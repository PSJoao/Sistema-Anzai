// public/scripts/packing.js
// public/scripts/packing.js
document.addEventListener('DOMContentLoaded', () => {

    const initApp = () => {
        // Trava de segurança: Aguarda o main.js injetar o ModalSystem no window
        if (!window.ModalSystem) {
            setTimeout(initApp, 50); // Tenta de novo em 50ms
            return;
        }

        const appEl = document.getElementById('packing-app');
        if (!appEl) {
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const currentPlatform = urlParams.get('plataforma');

        // Se não tem plataforma na URL, abre o modal do sistema e FORÇA a escolha
        if (!currentPlatform || currentPlatform === 'todos') {
            window.ModalSystem.showInfo({
                title: 'Selecionar Plataforma',
                allowOutsideClick: false,
                body: `
                    <div class="text-center pb-3 pt-2">
                        <p class="mb-4">Qual plataforma você irá empacotar?</p>
                        <div style="display: flex; justify-content: center; gap: 15px;">
                            <button type="button" class="btn btn-primary btn-lg" onclick="window.location.href='?plataforma=mercado_livre'" style="min-width: 150px;">
                                Mercado Livre
                            </button>
                            <button type="button" class="btn btn-primary btn-lg" onclick="window.location.href='?plataforma=shopee'" style="min-width: 150px;">
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

        // Opcional: Adiciona a tag (badge) no título para o operador saber onde está
        const headerTitle = document.querySelector('.page-header h1');
        if (headerTitle) {
            const badgeLabel = currentPlatform === 'shopee' ? 'Shopee' : 'Mercado Livre';
            const badgeClass = currentPlatform === 'shopee' ? 'bg-warning text-dark' : 'bg-primary';
            if (badgeLabel === 'Mercado Livre') {
                headerTitle.innerHTML += ` <span class="badge ${badgeClass}" style="vertical-align: middle; color: yellow;">${badgeLabel}</span>`;
            } else if (badgeLabel === 'Shopee') {
                headerTitle.innerHTML += ` <span class="badge ${badgeClass}" style="vertical-align: middle; color: red;">${badgeLabel}</span>`;
            }
        }

        // Templates
        const baseCardTemplate = document.getElementById('packing-card-template');
        const itemTemplate = document.getElementById('packing-item-template');
        const finishedTemplate = document.getElementById('packing-finished-template');

        const queueItemTemplate = document.getElementById('queue-item-template');
        const queueListEl = document.getElementById('packing-queue-list');
        const queueCounterEl = document.getElementById('queue-total-counter');
        const queueEmptyEl = document.getElementById('queue-empty-state');
        const initialQueueDataEl = document.getElementById('initial-queue-data');

        let currentSession = null;
        let isRequesting = false;

        // --- Elementos do Card (para cache) ---
        let scanInput = null;
        let scanForm = null;
        let feedbackEl = null;

        function parseInitialSession() {
            const raw = appEl.dataset.initialSession;
            if (!raw || raw === 'null' || raw === '""') {
                return null;
            }
            try {
                const parsed = JSON.parse(raw);
                // Verifica se tem estrutura válida de sessão
                return (parsed && parsed.lock) ? parsed : null;
            } catch (error) {
                console.warn('[Empacotamento] Não foi possível analisar a sessão inicial:', error);
                return null;
            }
        }

        // Renderiza o estado de espera (Nenhum pedido na tela)
        function renderEmptyCard(message, type = 'info') {
            appEl.innerHTML = '';
            const container = document.createElement('div');
            container.className = 'card separation-card is-empty';

            let icon = '📦';
            if (type === 'error') icon = '❌';
            if (type === 'success') icon = '✅';

            container.innerHTML = `
                <div class="card-body" style="text-align: center; padding: 3rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">${icon}</div>
                    <h3>${message || 'Bipe um produto para iniciar'}</h3>
                    <p class="muted">O sistema buscará automaticamente o pedido mais prioritário.</p>
                    
                    <div style="margin-top: 2rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                        <form id="start-scan-form" autocomplete="off">
                            <input type="text" id="start-scan-input" class="form-control" placeholder="Bipe aqui..." autofocus>
                        </form>
                    </div>
                </div>
            `;
            appEl.appendChild(container);

            // Bind do input inicial
            const form = container.querySelector('#start-scan-form');
            const input = container.querySelector('#start-scan-input');

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (input.value.trim()) handleScan(input.value);
            });

            // Mantém foco
            input.focus();
            input.addEventListener('blur', () => setTimeout(() => input.focus(), 100));
        }

        // Renderiza o card de finalização
        function renderFinishedCard(lastOrderNumber) {
            if (!finishedTemplate) {
                return renderEmptyCard('Pedido finalizado!', 'success');
            }

            const card = finishedTemplate.content.cloneNode(true);
            const orderNumberEl = card.querySelector('[data-order-number-finished]');

            if (orderNumberEl) {
                orderNumberEl.textContent = `Pedido ${lastOrderNumber || ''} finalizado com sucesso.`;
            }

            // Botão para voltar ao início
            const nextBtn = card.querySelector('[data-action="request-next"]');
            if (nextBtn) {
                nextBtn.textContent = 'Bipar próximo produto';
                nextBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    currentSession = null;
                    renderEmptyCard();
                });
            }

            appEl.innerHTML = '';
            appEl.appendChild(card);
        }

        // Renderiza a sessão ativa (Card do Pedido)
        function renderSession() {
            if (!currentSession || !currentSession.lock || !currentSession.order || !currentSession.items) {
                return renderEmptyCard();
            }

            if (!baseCardTemplate || !itemTemplate) {
                return renderEmptyCard('Erro: Templates de empacotamento não encontrados.', 'error');
            }

            const card = baseCardTemplate.content.cloneNode(true);
            const { order, items, lock } = currentSession;
            const progress = lock.progress || {};

            console.log(currentSession);

            // Preenche cabeçalho
            card.querySelector('[data-order-number]').textContent = order[0].numero_venda || 'Não identificado';
            card.querySelector('[data-order-buyer]').textContent = order[0].comprador || 'Cliente não identificado';

            // --- NOVO: Coleta imagens dos produtos (via items ou progress) ---
            const imageItems = [];
            items.forEach(item => {
                // Tenta pegar cod_imagem do item (vem do JOIN) ou do progress (guardado no lock)
                const codImagem = item.cod_imagem || (progress[item.produto_codigo] && progress[item.produto_codigo].cod_imagem);
                if (codImagem) {
                    imageItems.push({
                        cod_imagem: codImagem,
                        descricao: item.descricao_produto || 'Produto',
                        codigo: item.produto_codigo
                    });
                }
            });

            // Monta o HTML do slider apenas se tiver imagens
            let sliderHtml = '';
            if (imageItems.length > 0) {
                const slidesHtml = imageItems.map((img, idx) => `
                    <div class="image-slide ${idx === 0 ? 'active' : ''}" data-slide-index="${idx}">
                        <img src="/api/produto-imagem/${img.cod_imagem}" 
                             alt="${img.descricao}"
                             data-img-index="${idx}">
                    </div>
                `).join('');

                const dotsHtml = imageItems.length > 1
                    ? `<div class="slider-dots">${imageItems.map((_, idx) => `
                        <button class="slider-dot ${idx === 0 ? 'active' : ''}" data-dot-index="${idx}"></button>
                      `).join('')}</div>`
                    : '';

                const navHtml = imageItems.length > 1
                    ? `<button class="slider-nav-btn prev" data-slider-prev>&#8249;</button>
                       <button class="slider-nav-btn next" data-slider-next>&#8250;</button>`
                    : '';

                const labelsHtml = imageItems.map((img, idx) => `
                    <div class="image-slide-label" data-label-index="${idx}" style="${idx !== 0 ? 'display:none' : ''}">
                        ${img.descricao}
                    </div>
                `).join('');

                const counterText = imageItems.length > 1
                    ? `<span class="image-counter" data-slider-counter>1 / ${imageItems.length}</span>`
                    : '';

                sliderHtml = `
                    <div class="packing-image-wrapper" id="packing-image-slider">
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: linear-gradient(135deg, #f8fafc, #eef2ff); border-bottom: 1px solid var(--border-color);">
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">Imagens do Pedido</span>
                            ${counterText}
                        </div>
                        <div class="image-slider">
                            ${navHtml}
                            ${slidesHtml}
                        </div>
                        ${labelsHtml}
                        ${dotsHtml}
                    </div>
                `;
            }
            // ---------------------------------------------------------------

            // Preenche lista de itens
            const itemListEl = card.querySelector('[data-item-list]');
            itemListEl.innerHTML = '';

            items.forEach(item => {
                const itemProg = progress[item.produto_codigo] || { scanned: 0, needed: item.quantidade_total };
                const itemRow = itemTemplate.content.cloneNode(true);
                const isComplete = itemProg.scanned >= itemProg.needed;

                // --- MELHORIA AQUI: Exibição detalhada dos códigos ---
                const skuDisplay = item.sku || item.produto_codigo;
                // Se tiver código de barras, mostra também. Se tiver ref de fábrica, mostra também.
                const extraInfo = [];

                const detailText = extraInfo.length > 0
                    ? `Cód: ${skuDisplay} | ${extraInfo.join(' | ')}`
                    : `Cód: ${skuDisplay}`;

                itemRow.querySelector('[data-item-name]').textContent = item.descricao_produto || 'Produto sem descrição';
                itemRow.querySelector('[data-item-sku]').textContent = detailText;
                // ----------------------------------------------------

                itemRow.querySelector('[data-scanned-count]').textContent = itemProg.scanned;
                itemRow.querySelector('[data-needed-count]').textContent = itemProg.needed;

                const statusIcon = itemRow.querySelector('[data-status-icon]');
                const itemCounter = itemRow.querySelector('[data-item-counter]');

                if (isComplete) {
                    statusIcon.textContent = '✅';
                    itemCounter.classList.add('is-complete');
                    itemRow.querySelector('li').classList.add('completed-item');
                } else {
                    statusIcon.textContent = '📦';
                }

                itemListEl.appendChild(itemRow);
            });

            // Configura input de scan dentro do card
            scanInput = card.querySelector('[data-scan-input]');
            scanForm = card.querySelector('[data-scan-form]');
            feedbackEl = card.querySelector('[data-feedback]');

            // Botão Cancelar (Liberar Pedido)
            const cancelBtn = card.querySelector('[data-action="cancel"]');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', handleCancel);
            }

            scanForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (scanInput.value.trim()) handleScan(scanInput.value);
            });

            // Foco automático
            setTimeout(() => scanInput.focus(), 100);

            appEl.innerHTML = '';
            appEl.appendChild(card);

            // --- NOVO: Injeta o slider dentro do card-body, ANTES da lista de itens ---
            if (sliderHtml) {
                const cardBody = appEl.querySelector('.card-body');
                if (cardBody) {
                    // Insere antes do primeiro filho (Itens do Pedido)
                    cardBody.insertAdjacentHTML('afterbegin', sliderHtml);

                    // Inicializa o slider controller
                    _initPackingSlider();
                }
            }
            // -----------------------------------------------------------------------
        }

        /**
         * Controller do Slider de Imagens (Empacotamento)
         * Gerencia navegação, dots, fallback de falha de imagem.
         */
        function _initPackingSlider() {
            const wrapper = document.getElementById('packing-image-slider');
            if (!wrapper) return;

            const slides = wrapper.querySelectorAll('.image-slide');
            const dots = wrapper.querySelectorAll('.slider-dot');
            const labels = wrapper.querySelectorAll('.image-slide-label');
            const counterEl = wrapper.querySelector('[data-slider-counter]');
            const prevBtn = wrapper.querySelector('[data-slider-prev]');
            const nextBtn = wrapper.querySelector('[data-slider-next]');

            let currentIndex = 0;
            let totalValid = slides.length;

            // Trata erro de carregamento de cada imagem
            slides.forEach((slide, idx) => {
                const img = slide.querySelector('img');
                if (img) {
                    img.addEventListener('error', () => {
                        // Remove o slide com imagem quebrada
                        slide.remove();
                        if (dots[idx]) dots[idx].remove();
                        if (labels[idx]) labels[idx].remove();

                        totalValid--;

                        // Se não sobrou nenhuma imagem, esconde o card todo
                        if (totalValid <= 0) {
                            wrapper.style.display = 'none';
                            return;
                        }

                        // Se era o slide ativo, mostra o primeiro disponível
                        const remainingSlides = wrapper.querySelectorAll('.image-slide');
                        const remainingDots = wrapper.querySelectorAll('.slider-dot');
                        const remainingLabels = wrapper.querySelectorAll('.image-slide-label');

                        if (remainingSlides.length > 0) {
                            currentIndex = 0;
                            remainingSlides[0].classList.add('active');
                            if (remainingDots[0]) remainingDots[0].classList.add('active');
                            if (remainingLabels[0]) remainingLabels[0].style.display = '';
                            if (counterEl) counterEl.textContent = `1 / ${totalValid}`;
                        }

                        // Esconde navegação se sobrou apenas 1
                        if (totalValid <= 1) {
                            if (prevBtn) prevBtn.style.display = 'none';
                            if (nextBtn) nextBtn.style.display = 'none';
                            const dotsContainer = wrapper.querySelector('.slider-dots');
                            if (dotsContainer) dotsContainer.style.display = 'none';
                        }
                    });
                }
            });

            function goToSlide(idx) {
                const allSlides = wrapper.querySelectorAll('.image-slide');
                const allDots = wrapper.querySelectorAll('.slider-dot');
                const allLabels = wrapper.querySelectorAll('.image-slide-label');

                allSlides.forEach(s => s.classList.remove('active'));
                allDots.forEach(d => d.classList.remove('active'));
                allLabels.forEach(l => l.style.display = 'none');

                if (allSlides[idx]) allSlides[idx].classList.add('active');
                if (allDots[idx]) allDots[idx].classList.add('active');
                if (allLabels[idx]) allLabels[idx].style.display = '';

                currentIndex = idx;
                if (counterEl) counterEl.textContent = `${idx + 1} / ${allSlides.length}`;
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    const allSlides = wrapper.querySelectorAll('.image-slide');
                    const newIdx = (currentIndex - 1 + allSlides.length) % allSlides.length;
                    goToSlide(newIdx);
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    const allSlides = wrapper.querySelectorAll('.image-slide');
                    const newIdx = (currentIndex + 1) % allSlides.length;
                    goToSlide(newIdx);
                });
            }

            dots.forEach((dot, idx) => {
                dot.addEventListener('click', () => goToSlide(idx));
            });
        }

        // Feedback visual de erro ou sucesso
        function showFeedback(message, type = 'error') {
            // Se estiver na tela vazia, usa alert ou renderiza erro no card vazio
            if (!feedbackEl) {
                if (document.querySelector('.is-empty')) {
                    renderEmptyCard(message, type);
                } else {
                    alert(message);
                }
                return;
            }

            feedbackEl.textContent = message;
            feedbackEl.className = `scan-feedback ${type === 'error' ? 'is-error' : 'is-success'}`;
            feedbackEl.hidden = false;

            // Oculta sucesso após 2s
            if (type === 'success') {
                setTimeout(() => {
                    if (feedbackEl) feedbackEl.hidden = true;
                }, 3000);
            }
        }

        // Renderiza a lista lateral
        function renderQueue(list) {
            if (!queueListEl) return;

            queueListEl.innerHTML = ''; // Limpa atual

            // Atualiza badge de total
            if (queueCounterEl) queueCounterEl.textContent = list.length;

            // Estado Vazio
            if (!list || list.length === 0) {
                if (queueEmptyEl) queueEmptyEl.style.display = 'block';
                return;
            }
            if (queueEmptyEl) queueEmptyEl.style.display = 'none';

            // Desenha os cards
            list.forEach(order => {
                const clone = queueItemTemplate.content.cloneNode(true);
                const li = clone.querySelector('.queue-item');

                // Cor da borda baseada na urgência (calculada no Service)
                if (order.urgency) {
                    li.classList.add(`status-${order.urgency}`);
                }

                // Preenche dados
                clone.querySelector('[data-q-order]').textContent = order.numero_venda;
                clone.querySelector('[data-q-buyer]').textContent = order.comprador || 'Cliente';
                clone.querySelector('[data-q-store]').textContent = order.loja_oficial || 'Orgânico';

                const prodListEl = clone.querySelector('[data-q-prod-list]');
                if (prodListEl && order.lista_produtos && Array.isArray(order.lista_produtos)) {
                    // Limita a 3 itens visuais para não estourar o card, se quiser mostrar tudo, remova o slice
                    const visibleItems = order.lista_produtos.slice(0, 5);

                    visibleItems.forEach(prod => {
                        const li = document.createElement('li');
                        // Exibe: "2x SKU123 - Nome do Produ..."
                        // Se o produto não tiver sku, usa 'item'
                        const nomeCurto = (prod.descricao || '').substring(0, 25);
                        li.innerHTML = `<strong>${prod.qtd}x</strong> ${prod.sku || ''} <span class="text-muted">${nomeCurto}</span>`;
                        prodListEl.appendChild(li);
                    });

                    // Se tiver mais produtos que o limite visual
                    if (order.lista_produtos.length > 5) {
                        const moreLi = document.createElement('li');
                        moreLi.style.fontStyle = 'italic';
                        moreLi.style.color = '#888';
                        moreLi.textContent = `+ ${order.lista_produtos.length - 5} outros itens...`;
                        prodListEl.appendChild(moreLi);
                    }
                }

                // Badge de Data (DD/MM)
                const badgeDate = clone.querySelector('[data-q-date-badge]');
                if (order.data_envio_limite) {
                    const d = new Date(order.data_envio_limite);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    badgeDate.textContent = `${day}/${month}`;

                    // Cor do badge
                    if (order.urgency === 'delayed') badgeDate.classList.add('badge-danger');
                    else if (order.urgency === 'today') badgeDate.classList.add('badge-warning');
                    else badgeDate.classList.add('badge-success');
                } else {
                    badgeDate.textContent = '-';
                }

                // NF
                const nfEl = clone.querySelector('[data-q-nf]');
                nfEl.textContent = order.nfe_numero ? `NF: ${order.nfe_numero}` : 'Sem NF';

                queueListEl.appendChild(clone);
            });
        }

        // Busca atualização silenciosa da fila
        async function fetchQueue() {
            try {
                const res = await fetch(`/empacotamento/api/queue?plataforma=${currentPlatform}`);
                if (res.ok) {
                    const list = await res.json();
                    renderQueue(list);
                }
            } catch (error) {
                console.error('[Packing] Erro ao atualizar sidebar:', error);
            }
        }

        // Ação Principal: Bipar (Serve tanto para iniciar quanto para continuar)
        async function handleScan(sku) {
            if (isRequesting) return;
            isRequesting = true;

            // Se tiver input na tela, desabilita visualmente
            if (scanInput) scanInput.disabled = true;

            if (feedbackEl) feedbackEl.hidden = true;

            let response; // Movido para fora para ser acessível no catch

            try {
                const response = await fetch('/empacotamento/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sku, plataforma: currentPlatform })
                });

                const data = await response.json();

                if (!response.ok) {
                    // Erro (ex: produto não pertence ao pedido, ou nenhum pedido encontrado)
                    throw new Error(data.message || 'Erro desconhecido');
                }

                if (data.finished) {
                    // 1. Abre a etiqueta numa nova aba (Rota universal para todas as plataformas)
                    window.open(`/empacotamento/etiqueta/${data.numero_venda}`, '_blank');

                    // 2. Limpa a sessão local
                    currentSession = null;

                    // Atualiza a lista de pedidos
                    fetchQueue();

                    // 3. Volta IMEDIATAMENTE para a tela de bipar (Card Vazio)
                    renderEmptyCard(`Pedido ${data.numero_venda} finalizado! Bipe o próximo.`, 'success');
                } else {
                    // Verifica se foi o início de uma nova sessão
                    const foiInicio = !currentSession;

                    if (data.order && data.items) {
                        currentSession = {
                            lock: data.lock,
                            order: data.order,
                            items: data.items
                        };
                    } else if (currentSession && currentSession.lock) {
                        currentSession.lock.progress = data.progress;
                    }

                    renderSession();

                    if (foiInicio) {
                        showFeedback('Pedido iniciado!', 'success');
                    } else {
                        showFeedback('Item confirmado!', 'success');
                    }
                }

            } catch (error) {
                console.error('[Empacotamento] Erro ao bipar:', error);

                // --- MODIFICAÇÃO PARA O MODAL DE CANCELAMENTO ---
                // Verifica se é um erro crítico (Cancelamento) baseado na mensagem do Backend
                const isCritical = error.message.includes('ATENÇÃO') || error.message.includes('CANCELADO');

                if (isCritical && window.ModalSystem) {
                    // Usa o ModalSystem do main.js para travar a tela e avisar
                    await window.ModalSystem.alert(
                        '⛔ Bloqueio de Segurança',
                        `<p style="font-size: 1.1rem;">${error.message}</p>`,
                        { confirmClass: 'btn-danger', confirmText: 'Entendido' }
                    );

                    // Se o erro foi de cancelamento, é provável que a sessão tenha sido invalidada ou o pedido removido.
                    // Limpamos o input para garantir.
                    if (scanInput) scanInput.value = '';

                } else {
                    // Erros comuns (Ex: Produto errado) continuam discretos
                    showFeedback(error.message, 'error');
                }

                // Lógica de reset de sessão inválida
                if (error.message.includes('Sessão') || (response && response.status === 401)) {
                    currentSession = null;
                    renderEmptyCard();
                }

            } finally {
                isRequesting = false;
                // Restaura foco
                const inputNow = document.querySelector('input[type="text"]');
                if (inputNow) {
                    inputNow.disabled = false;
                    inputNow.value = '';
                    inputNow.focus();
                }
            }
        }

        // Ação: Cancelar/Liberar Pedido
        async function handleCancel() {
            if (!currentSession || !confirm('Tem certeza? O pedido voltará para a fila e todo o progresso deste empacotamento será perdido.')) {
                return;
            }

            try {
                await fetch('/empacotamento/api/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                currentSession = null;
                renderEmptyCard('Pedido devolvido à fila.', 'info');

            } catch (error) {
                alert('Erro ao cancelar: ' + error.message);
            }
        }

        // --- Inicialização ---
        // Previne que o Enter recarregue a página
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                // Apenas garante que o form submit seja tratado pelos listeners
            }
        });

        const initial = parseInitialSession();
        if (initial) {
            currentSession = initial;
            renderSession();
        } else {
            renderEmptyCard();
        }

        if (initialQueueDataEl && initialQueueDataEl.textContent) {
            try {
                const initialList = JSON.parse(initialQueueDataEl.textContent);
                renderQueue(initialList);
            } catch (e) {
                console.warn('Erro ao ler fila inicial, buscando da API...');
                fetchQueue();
            }
        } else {
            // Se não veio nada no HTML, busca da API
            fetchQueue();
        }

        setInterval(fetchQueue, 5000);
    }; // Fim da função initApp

    initApp(); // Dá o disparo inicial
});