// public/scripts/separation.js

document.addEventListener('DOMContentLoaded', () => {

    const initApp = () => {
        // Trava de segurança: Aguarda o main.js carregar o ModalSystem
        if (!window.ModalSystem || typeof window.ModalSystem.showInfo !== 'function') {
            setTimeout(initApp, 50);
            return;
        }

        const appEl = document.getElementById('separation-app');
        if (!appEl) return; // Proteção caso o script carregue em outra página

        // --- NOVO: Verificação de Plataforma via URL ---
        const urlParams = new URLSearchParams(window.location.search);
        const currentPlatform = urlParams.get('plataforma');

        // Se não tem plataforma na URL, abre o modal customizado e FORÇA a escolha
        if (!currentPlatform || currentPlatform === 'todos') {
            window.ModalSystem.showInfo({
                title: 'Selecionar Plataforma',
                allowOutsideClick: false,
                body: `
                    <div class="text-center pb-3 pt-2">
                        <p class="mb-4">Qual plataforma você irá separar?</p>
                        <div style="display: flex; justify-content: center; gap: 15px;">
                            <button type="button" class="btn btn-primary btn-lg" onclick="const params = new URLSearchParams(window.location.search); params.set('plataforma', 'mercado_livre'); window.location.search = params.toString();" style="min-width: 150px;">
                                Mercado Livre
                            </button>
                            <button type="button" class="btn btn-primary btn-lg" onclick="const params = new URLSearchParams(window.location.search); params.set('plataforma', 'shopee'); window.location.search = params.toString();" style="min-width: 150px;">
                                Shopee
                            </button>
                        </div>
                    </div>
                `,
                footer: '', // Vazio para não mostrar botões padrão
                allowOutsideClick: false // Impede fechar clicando fora
            });
            return; // Interrompe a execução do script até a página recarregar
        }

        // Adiciona a tag (badge) no título para o operador saber onde está
        const headerTitle = document.querySelector('.page-header h1');
        if (headerTitle) {
            const badgeLabel = currentPlatform === 'shopee' ? 'Shopee' : 'Mercado Livre';
            const badgeClass = currentPlatform === 'shopee' ? 'bg-warning text-dark' : 'bg-primary';
            headerTitle.innerHTML += ` <span class="badge ${badgeClass}" style="vertical-align: middle; color: red;">${badgeLabel}</span>`;
        }
        // -----------------------------------------------

        // Dados inicias injetados pelo Handlebars no HTML
        const departmentCode = Number.parseInt(appEl.dataset.departmentCode, 10);

        // =========================================================================
        // ESTADO DA APLICAÇÃO (State)
        // =========================================================================
        let currentSession = null;
        let isRequesting = false;
        let skipCount = 0;

        // =========================================================================
        // SISTEMA DE MODAL (Wrapper Corrigido para Promises)
        // =========================================================================

        function showConfirm(title, message, onConfirm) {
            // Verifica se o ModalSystem existe e é a versão Promise (do main.js)
            if (window.ModalSystem && typeof window.ModalSystem.confirm === 'function') {
                // O ModalSystem.confirm retorna uma Promise! Precisamos usar .then()
                window.ModalSystem.confirm(title, message)
                    .then((confirmed) => {
                        if (confirmed) {
                            onConfirm(); // Executa a ação APENAS se a promise resolver como true
                        }
                    })
                    .catch(() => {
                        // Usuário cancelou ou fechou o modal
                        // Não fazemos nada, apenas ignoramos
                    });
            } else {
                // Fallback nativo
                if (confirm(`${title}\n\n${message}`)) {
                    onConfirm();
                }
            }
        }

        function showAlert(title, message) {
            if (window.ModalSystem && typeof window.ModalSystem.alert === 'function') {
                // O alert também é uma Promise no main.js, mas aqui só queremos exibir
                window.ModalSystem.alert(title, message);
            } else {
                alert(`${title}: ${message}`);
            }
        }

        // =========================================================================
        // LÓGICA DE API (Comunicação com o Backend)
        // =========================================================================

        function getFilters() {
            const params = new URLSearchParams(window.location.search);
            return {
                companyFilter: params.get('company') || 'todos',
                deadlines: params.getAll('deadlines')
            };
        }

        /**
         * Busca um produto para separar.
         * @param {number} skip - Quantos produtos pular na fila.
         */
        async function acquireProduct(skipVal) {
            // Se o skip não for passado, usa a variável global state
            // Isso permite chamar acquireProduct() sem argumentos
            if (typeof skipVal !== 'number') {
                skipVal = skipCount;
            } else {
                skipCount = skipVal; // Atualiza global
            }

            if (isRequesting) return;
            isRequesting = true;
            renderLoading('Buscando produto...');

            try {
                // --- ADIÇÃO: Captura os filtros da URL para enviar ao backend ---
                const filters = getFilters();
                // -----------------------------------------------------------------

                const res = await fetch('/separacao/api/acquire', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        departmentCode,
                        skip: skipCount, // Envia o contador de navegação atual
                        filters,         // Envia os filtros
                        plataforma: currentPlatform // <--- NOVO: Informa o backend
                    })
                });

                if (res.status === 204) {
                    currentSession = null;
                    renderEmpty();
                } else if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.message || 'Erro ao buscar produto.');
                } else {
                    const session = await res.json();
                    currentSession = session;
                    // Não zeramos o skipCount aqui, pois se o usuário clicou em "Próximo",
                    // queremos manter o skipCount alto para ele continuar navegando.
                    renderSession();
                }

            } catch (error) {
                console.error(error);
                renderError(error.message);
            } finally {
                isRequesting = false;
            }
        }

        /**
         * Envia o código bipado (SKU)
         */
        async function handlePick(sku) {
            if (isRequesting || !sku) return;
            isRequesting = true;

            try {
                const res = await fetch('/separacao/api/pick', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sku, plataforma: currentPlatform, filters: getFilters() }) // <-- ADICIONADO
                });

                const data = await res.json();

                if (!res.ok) {
                    playErrorSound();
                    showAlert('Atenção', data.message || 'Erro ao bipar.');
                } else {
                    // Sucesso: Atualiza estado
                    if (!currentSession.status) currentSession.status = {};
                    currentSession.status.scanned = data.scanned;
                    currentSession.status.total = data.total;

                    // === NOVO: LÓGICA DE AUTO-COMPLETE ===
                    // Se completou a meta, chama o confirmar forçado imediatamente
                    if (data.scanned >= data.total) {
                        isRequesting = false; // Libera a flag para o handleConfirm poder rodar
                        handleConfirm(true);  // TRUE = Força sem modal
                        return; // Para a execução aqui para não renderizar a tela antiga
                    }
                    // =====================================

                    renderSession();
                }
            } catch (error) {
                console.error(error);
                playErrorSound();
                showAlert('Erro', 'Falha de rede ao bipar.');
            } finally {
                // Só libera a flag se NÃO entramos no if do auto-complete
                // (pois o auto-complete inicia outra requisição)
                if (currentSession && currentSession.status && currentSession.status.scanned < currentSession.status.total) {
                    isRequesting = false;
                    const input = document.getElementById('sku-input');
                    if (input) input.value = '';
                    autoFocus();
                }
            }
        }

        /**
         * Zera a contagem do produto atual
         */
        function handleReset() {
            showConfirm(
                'Reiniciar Contagem',
                'Tem certeza? Isso zerará todos os itens que você bipou deste produto até agora.',
                async () => {
                    if (isRequesting) return;
                    isRequesting = true;

                    try {
                        const res = await fetch('/separacao/api/reset', { method: 'POST' });
                        if (!res.ok) throw new Error('Falha ao reiniciar.');

                        // Sucesso: Zera localmente para feedback instantâneo
                        if (currentSession.status) currentSession.status.scanned = 0;
                        if (currentSession.lock) currentSession.lock.quantidade_concluida = 0;

                        renderSession(); // Botões vão sumir pois scanned será 0

                    } catch (error) {
                        console.error(error);
                        showAlert('Erro', error.message || 'Não foi possível reiniciar.');
                    } finally {
                        isRequesting = false;
                        autoFocus();
                    }
                }
            );
        }

        /**
         * Confirma a separação.
         * @param {boolean} force - Se true, finaliza direto sem perguntar (usado quando completa 100%).
         */
        function handleConfirm(force = false) {
            const { scanned, total } = currentSession.status;

            // A função que faz a chamada ao backend
            const executeConfirm = async () => {
                if (isRequesting) return;
                isRequesting = true;

                try {
                    const res = await fetch('/separacao/api/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }, // <-- ADICIONADO
                        body: JSON.stringify({ plataforma: currentPlatform, filters: getFilters() }) // <-- ADICIONADO
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.message || 'Erro ao confirmar.');
                    }

                    // SUCESSO
                    currentSession = null;

                    // [CORREÇÃO]: Não zeramos mais o skipCount aqui!
                    // skipCount = 0;  <-- REMOVIDO PARA NÃO VOLTAR AO INÍCIO

                    isRequesting = false;

                    // Mantém a posição atual da fila (skipCount)
                    // Se o produto foi finalizado, o próximo da fila ocupa este lugar.
                    // Se foi parcial (divergência), o mesmo produto recarrega.
                    await acquireProduct(skipCount);

                } catch (error) {
                    console.error(error);
                    showAlert('Erro', error.message);
                    isRequesting = false;
                }
            };

            // LÓGICA DE DECISÃO:
            // Se for forçado (auto-complete) OU se estiver completo (100%), vai direto.
            // Só mostra modal se for PARCIAL (Divergência).
            if (force || scanned >= total) {
                executeConfirm();
            } else {
                // É parcial, então pergunta
                showConfirm(
                    'Separação com Divergência',
                    `Você bipou <b>${scanned}</b> de <b>${total}</b> itens.<br><br>Confirmar a separação PARCIAL?`,
                    executeConfirm
                );
            }
        }

        // =========================================================================
        // RENDERIZAÇÃO (UI)
        // =========================================================================

        function renderSession() {
            if (!currentSession || !currentSession.product) return;

            // 1. PREPARAÇÃO DOS DADOS
            const status = currentSession.status || {
                scanned: currentSession.lock ? currentSession.lock.quantidade_concluida : 0,
                total: currentSession.lock ? currentSession.lock.quantidade_meta : 0
            };
            const { product } = currentSession;

            // --- NOVO: LÓGICA DA LISTA DE PEDIDOS ---
            const orders = currentSession.orders || [];
            let ordersHtml = '';

            if (orders.length === 0) {
                ordersHtml = '<li class="order-list-item text-muted text-center p-3">Nenhum pedido pendente.</li>';
            } else {
                ordersHtml = orders.map(order => `
                    <li class="order-list-item">
                        <div class="order-list-header">
                            <span>#${order.numero_venda}</span>
                            <span class="badge-qty">${order.qty_needed} un</span>
                        </div>
                        <div class="order-list-buyer" title="${order.comprador || ''}">
                            👤 ${order.comprador || 'Consumidor Final'}
                        </div>
                    </li>
                `).join('');
            }
            // ----------------------------------------

            const scanned = status.scanned;
            const total = status.total;
            const missing = Math.max(0, total - scanned);

            const hasStarted = scanned > 0;
            const isComplete = scanned >= total;

            let btnClass = 'btn-warning';
            let btnText = 'Separar com Divergência';

            if (isComplete) {
                btnClass = 'btn-success';
                btnText = 'Finalizar Separação';
            }

            // 2. TEMPLATE HTML (AGORA COM LAYOUT DE 2 COLUNAS)
            appEl.innerHTML = `
                <div class="separation-layout">
                    
                    <div>
                        <div class="card shadow-sm separation-card">
                            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3" style="justify-content: center;">
                                <div class="btn-group">
                                    <button id="btn-prev" class="btn btn-outline-secondary" ${skipCount === 0 ? 'disabled' : ''}>
                                        &larr; Anterior
                                    </button>
                                    <button id="btn-next" class="btn btn-outline-secondary">
                                        Próximo &rarr;
                                    </button>
                                </div>
                            </div>

                            <div class="card-body text-center">
                                <h3 class="font-weight-bold" style="color: var(--text-primary);">${product.descricao}</h3>
                                <div class="text-muted mb-4">
                                    SKU: <strong>${product.codigo}</strong>
                                </div>

                                <div class="d-flex justify-content-center align-items-center mb-4 p-3 bg-light rounded border">
                                    <div class="mr-4 pr-4 border-right text-right">
                                        <small class="text-muted text-uppercase" style="font-size:0.75rem">Bipados</small>
                                        <div class="display-4 font-weight-bold ${isComplete ? 'text-success' : 'text-primary'}" style="line-height:1">
                                            ${scanned}
                                        </div>
                                    </div>
                                    <div class="text-left">
                                        <small class="text-muted text-uppercase" style="font-size:0.75rem">Total</small>
                                        <div class="display-4 font-weight-bold text-dark" style="line-height:1">
                                            ${total}
                                        </div>
                                    </div>
                                </div>
                                
                                <p class="text-muted mb-4" style="font-size: 1.1rem;">
                                    Faltam: <strong class="${missing === 0 ? 'text-success' : 'text-danger'}">${missing}</strong>
                                </p>

                                <div class="form-group mb-4">
                                    <input type="text" id="sku-input" 
                                        class="form-control form-control-lg text-center shadow-sm" 
                                        placeholder="Bipe o código..." 
                                        autocomplete="off" 
                                        autofocus
                                        style="height: 60px; font-size: 1.5rem;">
                                </div>
                                
                                <div id="action-area" class="${hasStarted ? 'd-flex' : 'd-none'} justify-content-center">
                                    <button id="btn-reset" class="btn btn-danger mr-2 btn-lg shadow-sm" style="margin-bottom: 10px;">
                                        <i class="fas fa-trash mr-2"></i>Reiniciar
                                    </button>
                                    <button id="btn-confirm" class="btn ${btnClass} btn-lg shadow-sm">
                                        <i class="fas fa-check mr-2"></i>${btnText}
                                    </button>
                                </div>
                            </div>
                        </div>

                        ${product.cod_imagem ? `
                        <div class="product-image-card" id="product-image-card">
                            <div class="image-card-header">
                                <h5>Imagem do Produto</h5>
                            </div>
                            <div class="image-slider">
                                <div class="image-slide active">
                                    <img src="/api/produto-imagem/${product.cod_imagem}" 
                                         alt="${product.descricao}"
                                         onerror="document.getElementById('product-image-card').style.display='none';">
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <aside class="card orders-list-card shadow-sm">
                        <div class="card-header bg-white border-bottom">
                            <h5 class="mb-0 font-weight-bold" style="font-size:1.1rem">📋 Pedidos na Fila</h5>
                        </div>
                        <ul class="orders-list-scroll">
                            ${ordersHtml}
                        </ul>
                    </aside>

                </div>
            `;

            // 3. LISTENERS E COMPORTAMENTO DE INPUT
            const input = document.getElementById('sku-input');
            if (input) {
                let typeTimer;
                const doneTypingInterval = 3000; // Tempo para enviar sozinho (3s)

                // Foco agressivo (mas permite clicar nos botões)
                /*input.onblur = (e) => {
                    if (!e.relatedTarget || !e.relatedTarget.classList.contains('btn')) {
                        setTimeout(() => input.focus(), 10);
                    }
                };*/

                // Envia com Enter
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        clearTimeout(typeTimer);
                        handlePick(e.target.value);
                    }
                });

                // Envia sozinho (Leitor rápido)
                input.addEventListener('input', (e) => {
                    clearTimeout(typeTimer);
                    const val = e.target.value;
                    if (val && val.trim().length > 0) {
                        typeTimer = setTimeout(() => {
                            handlePick(val);
                        }, doneTypingInterval);
                    }
                });
            }

            const bPrev = document.getElementById('btn-prev');
            const bNext = document.getElementById('btn-next');
            if (bPrev) bPrev.onclick = () => { if (skipCount > 0) acquireProduct(skipCount - 1); };
            if (bNext) bNext.onclick = () => { acquireProduct(skipCount + 1); };

            const bReset = document.getElementById('btn-reset');
            const bConfirm = document.getElementById('btn-confirm');
            if (bReset) bReset.onclick = handleReset;

            // Passamos uma arrow function para não enviar o evento de click como 'force'
            if (bConfirm) bConfirm.onclick = () => handleConfirm(false);

            autoFocus();
        }

        function renderEmpty() {
            appEl.innerHTML = `
                <div class="card shadow-sm p-5 text-center separation-card is-empty">
                    <div style="font-size: 4rem; color: var(--success-color); margin-bottom: 1rem;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 class="text-success font-weight-bold">Tudo pronto!</h3>
                    <p class="text-muted lead">Não há mais produtos pendentes neste departamento.</p>
                    <button class="btn btn-primary mt-3 shadow-sm" onclick="window.location.reload()">
                        Atualizar Lista
                    </button>
                </div>
            `;
        }

        function renderLoading(msg = 'Carregando...') {
            appEl.innerHTML = `
                <div class="d-flex flex-column justify-content-center align-items-center p-5" style="min-height: 300px;">
                    <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;"></div>
                    <p class="text-muted font-weight-bold">${msg}</p>
                </div>
            `;
        }

        function renderError(msg) {
            appEl.innerHTML = `
                <div class="alert alert-danger m-3 text-center shadow-sm">
                    <h4>Ocorreu um erro</h4>
                    <p>${msg}</p>
                    <button class="btn btn-outline-danger btn-sm" onclick="window.location.reload()">Recarregar Página</button>
                </div>
            `;
        }

        function autoFocus() {
            const inp = document.getElementById('sku-input');
            if (inp) setTimeout(() => inp.focus(), 150);
        }

        function playErrorSound() {
            // Implemente aqui se tiver o arquivo de áudio no futuro
            // const audio = new Audio('/sounds/error.mp3');
            // audio.play().catch(e => {});
        }

        // =========================================================================
        // LÓGICA DA BARRA DE PESQUISA (FURA-FILA)
        // =========================================================================

        const searchInput = document.getElementById('globalSeparationInput');
        const searchBtn = document.getElementById('btnGlobalSearch');

        async function handleGlobalSearch() {
            const term = searchInput.value.trim();

            // Se estiver vazio, não faz nada
            if (!term) return;

            // Evita múltiplos cliques
            if (isRequesting) return;
            isRequesting = true;

            // Feedback visual de carregamento
            const originalBtnText = searchBtn.innerHTML;
            searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            searchBtn.disabled = true;
            searchInput.disabled = true;

            try {
                const res = await fetch('/separacao/api/search-acquire', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        term: term,
                        departmentCode: departmentCode, // Variável já existente no escopo global do script
                        plataforma: currentPlatform,     // <--- NOVO: Garante busca na plataforma correta
                        filters: getFilters()            // <--- NOVO: Aplica os filtros na busca global
                    })
                });

                const data = await res.json();

                if (res.ok) {
                    // SUCESSO!
                    // O backend já fez o "release" do anterior e o "lock" deste novo produto.
                    // Basta atualizar o estado local e renderizar.

                    currentSession = data; // Atualiza a sessão global com o produto buscado
                    skipCount = 0;         // Reseta contadores de "pular"

                    renderSession();       // Atualiza a tela com o novo card!

                    // Limpa o input e foca para bipar o produto
                    searchInput.value = '';
                    searchInput.placeholder = `Último encontrado: ${term}`;

                    // Toca um som de sucesso (opcional, se tiver função de som)
                    // playSound('success'); 

                } else {
                    // ERRO (Não achou ou está com outro usuário)
                    // Usa o sistema de modal se existir, ou alert padrão
                    if (window.ModalSystem && window.ModalSystem.alert) {
                        window.ModalSystem.alert('Atenção', data.message || 'Item não encontrado neste departamento.');
                    } else {
                        alert(data.message || 'Item não encontrado.');
                    }

                    // Seleciona o texto para facilitar nova tentativa
                    searchInput.disabled = false;
                    searchInput.focus();
                    searchInput.select();
                }

            } catch (error) {
                console.error('[Search] Erro:', error);
                alert('Erro de conexão ao buscar produto.');
            } finally {
                // Restaura o botão
                isRequesting = false;
                searchBtn.innerHTML = originalBtnText;
                searchBtn.disabled = false;
                searchInput.disabled = false;

                // Se deu certo, o foco vai para o input de bipagem do card principal
                // Se deu errado, o foco volta para a busca (tratado no else acima)
                if (document.getElementById('scannedCode')) {
                    document.getElementById('scannedCode').focus();
                }
            }
        }

        // Registra os Event Listeners se a barra existir na tela
        if (searchInput && searchBtn) {

            // Clique no botão
            searchBtn.addEventListener('click', handleGlobalSearch);

            // Enter no input
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Evita submit de form se houver
                    handleGlobalSearch();
                }
            });
        }

        // =========================================================================
        // INICIALIZAÇÃO E LIMPEZA
        // =========================================================================

        // Se o usuário fechar a aba, tentamos liberar a sessão
        window.addEventListener('beforeunload', () => {
            if (currentSession && currentSession.lock) {
                const data = new FormData();
                navigator.sendBeacon('/separacao/api/release', data);
            }
        });

        // Boot (Inicialização Blindada)
        (async () => {
            try {
                renderLoading('Carregando sessão...');

                const filters = getFilters();
                const queryParams = new URLSearchParams({
                    plataforma: currentPlatform,
                    company: filters.companyFilter
                });
                filters.deadlines.forEach(d => queryParams.append('deadlines', d));

                const res = await fetch(`/separacao/api/session?${queryParams.toString()}`);

                // Se o status for 204 (No Content) ou erro, não tentamos ler JSON
                if (res.ok && res.status !== 204) {
                    // Lê como texto primeiro para garantir que não está vazio
                    const text = await res.text();

                    if (text && text.trim().length > 0) {
                        const session = JSON.parse(text);

                        // Verifica se o objeto retornado é uma sessão válida
                        if (session && session.lock) {
                            currentSession = session;
                            skipCount = 0;
                            renderSession();
                            return; // Sessão recuperada com sucesso!
                        }
                    }
                }

                // Se chegou aqui: não tem sessão, resposta vazia ou inválida.
                // Iniciamos do zero sem erro no console.
                acquireProduct(0);

            } catch (e) {
                // Log apenas como aviso, pois na primeira vez é normal falhar a recuperação
                console.warn('[Separação] Iniciando nova alocação (sem sessão prévia).');
                acquireProduct(0);
            }
        })(); // Fim da IIFE interna (Boot)

    }; // Fim da função initApp

    initApp(); // Dispara o loop de inicialização

}); // Fim do DOMContentLoaded