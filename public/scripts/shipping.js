// public/scripts/shipping.js
(() => {
    const scanForm = document.getElementById('shipping-scan-form');
    const scanInput = document.getElementById('scan-input');
    const feedbackEl = document.getElementById('scan-feedback');
    const pendingTableBody = document.querySelector('#pending-orders-table tbody');
    const checkedTableBody = document.querySelector('#checked-orders-table tbody');
    const finalizeBtn = document.getElementById('finalize-batch-btn');
    const emptyRow = document.getElementById('empty-row');
    const pendingEmptyRow = document.getElementById('pending-empty-row');
    const pendingCountEl = document.querySelector('.pending-count');
    let hasPendingItems = false;
    let isProcessing = false;

    function showFeedback(message, type = 'error') {
        feedbackEl.textContent = message;
        feedbackEl.className = 'scan-feedback';
        feedbackEl.setAttribute('data-variant', type);
        feedbackEl.hidden = false;
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                feedbackEl.hidden = true;
            }, 3000);
        }
    }

    function removeFromPendingTable(numeroVenda) {
        if (!pendingTableBody) return;

        // Busca a linha do pedido na tabela de pendentes
        const rows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        let removed = false;
        
        for (let row of rows) {
            if (row.getAttribute('data-pedido') === numeroVenda) {
                const prazo = row.getAttribute('data-prazo');
                updateStats(prazo);
                row.remove();
                removed = true;
                break;
            }
        }

        // Atualiza o contador de pendentes
        updatePendingCount();

        // Se não há mais pedidos pendentes, mostra a linha vazia
        const remainingRows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        if (remainingRows.length === 0) {
            // Verifica se a linha vazia já existe
            const existingEmptyRow = document.getElementById('pending-empty-row');
            if (!existingEmptyRow) {
                // Cria a linha vazia se não existir
                const emptyRow = document.createElement('tr');
                emptyRow.id = 'pending-empty-row';
                emptyRow.innerHTML = '<td colspan="2">Nenhum pedido pendente para expedição no momento.</td>';
                pendingTableBody.appendChild(emptyRow);
            }
        }
    }

    function updateStats(prazoValue) {
        // Obter os elementos
        const statTotal = document.getElementById('stat-total');
        const statHoje = document.getElementById('stat-hoje');
        const statAtrasado = document.getElementById('stat-atrasado');
        const statFuturo = document.getElementById('stat-futuro');
        const statEnviadosHoje = document.getElementById('stat-enviados-hoje');

        if (!statTotal) return;

        // Decrementar Total
        statTotal.textContent = Math.max(0, parseInt(statTotal.textContent) - 1);

        // Incrementar Enviados Hoje
        if (statEnviadosHoje) {
            statEnviadosHoje.textContent = parseInt(statEnviadosHoje.textContent) + 1;
        }

        // Verificar prazo e decrementar o respectivo contador
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (!prazoValue) {
            if (statHoje) statHoje.textContent = Math.max(0, parseInt(statHoje.textContent) - 1);
            return;
        }

        // Se tem prazo definido, precisamos compensar o timezone porque as datas do banco
        // vêm em UTC ou string simples. Para simplificar e bater com a lógica do backend:
        // A data vem como "2024-04-10T00:00:00.000Z" ou similar.
        const limite = new Date(prazoValue);
        // Ajustar para hora local
        const limiteLocal = new Date(limite.getTime() + limite.getTimezoneOffset() * 60000);
        limiteLocal.setHours(0, 0, 0, 0);

        if (limiteLocal.getTime() < hoje.getTime()) {
            if (statAtrasado) statAtrasado.textContent = Math.max(0, parseInt(statAtrasado.textContent) - 1);
        } else if (limiteLocal.getTime() === hoje.getTime()) {
            if (statHoje) statHoje.textContent = Math.max(0, parseInt(statHoje.textContent) - 1);
        } else {
            if (statFuturo) statFuturo.textContent = Math.max(0, parseInt(statFuturo.textContent) - 1);
        }
    }

    function updatePendingCount() {
        if (!pendingCountEl || !pendingTableBody) return;
        
        const pendingRows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        const count = pendingRows.length;
        pendingCountEl.textContent = `${count} pedido(s) aguardando conferência`;
    }

    function addRowToCheckedTable(order) {
        // Remove a linha vazia se existir
        if (emptyRow) {
            emptyRow.remove();
        }

        // Verifica se o pedido já existe na tabela e remove se existir (evita duplicatas visualmente)
        const existingRows = checkedTableBody.querySelectorAll('tr');
        for (let row of existingRows) {
            const pedidoCell = row.querySelector('td:first-child strong');
            if (pedidoCell && pedidoCell.textContent.trim() === order.numero_venda) {
                row.remove();
                break;
            }
        }

        // Cria a nova linha
        const row = document.createElement('tr');
        row.setAttribute('data-pedido', order.numero_venda);
        row.className = 'newly-added'; // Classe para animação
        
        // Formata a data/hora
        const conferidoEm = order.conferido_em ? new Date(order.conferido_em) : new Date();
        const dataFormatada = formatDateTime(conferidoEm);
        
        // --- CORREÇÃO AQUI: Status Enviado (Verde) ---
        row.innerHTML = `
            <td><strong>${order.numero_venda}</strong></td>
            <td>${dataFormatada}</td>
            <td><span class="status-badge success">Enviado</span></td>
        `;
        
        // Adiciona no topo da tabela
        if (checkedTableBody.firstChild) {
            checkedTableBody.insertBefore(row, checkedTableBody.firstChild);
        } else {
            checkedTableBody.appendChild(row);
        }
        
        // Remove a classe de animação após a transição
        setTimeout(() => {
            row.classList.remove('newly-added');
        }, 500);
        
        // [ADICIONADO] Atualiza o estado global de pendência
        hasPendingItems = true;
        updateFinalizeButtonState();
    }

    function formatDateTime(date) {
        const hoje = new Date();
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        
        // Verifica se é hoje
        if (date.toDateString() === hoje.toDateString()) {
            return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Verifica se é ontem
        if (date.toDateString() === ontem.toDateString()) {
            return `Ontem, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Caso contrário, mostra a data completa
        return date.toLocaleString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    async function handleCheck(e) {
        e.preventDefault();
        if (isProcessing) return;

        const term = scanInput.value.trim();
        if (!term) return;

        isProcessing = true;
        scanInput.disabled = true;
        feedbackEl.hidden = true;

        try {
            const response = await fetch('/expedicao/api/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ term })
            });

            const data = await response.json();

            if (!response.ok) {
                // Erro: mostra modal de alerta
                const errorMessage = data.message || 'Erro ao conferir pedido.';
                await window.ModalSystem.alert('Atenção!!!', `<p style="background-color: red; font-weight: bold; color: black; padding: 20px;">${errorMessage}</p>`);
                scanInput.select();
                return;
            }

            // Sucesso: remove da tabela de pendentes e adiciona à tabela de conferidos
            removeFromPendingTable(data.numero_venda);
            addRowToCheckedTable(data);
            scanInput.value = '';

            await window.ModalSystem.alert(
                'Sucesso', 
                '<p>Pedido bipado com sucesso!</p>'
            );

        } catch (error) {
            // Erro de rede ou outro erro inesperado: mostra modal
            await window.ModalSystem.alert('<div style="color: red; font-weight: bold;">Erro<div>', `<p style="color: red; font-weight: bold;">${error.message || 'Erro inesperado ao processar a requisição.'}</p>`);
            scanInput.select();
        } finally {
            isProcessing = false;
            scanInput.disabled = false;
            scanInput.focus();
        }
    }

    // Função para o Botão "Gerar Relatório" (Manual)
    async function handleManualGenerateReport() {
        if (!hasPendingItems) return;

        try {
            finalizeBtn.disabled = true;
            finalizeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            const response = await fetch('/expedicao/api/finalize', { method: 'POST' });
            const data = await response.json();

            if (!data.success) throw new Error(data.message);

            // Reseta estado
            hasPendingItems = false;
            updateFinalizeButtonState();

            // Limpa tabela visualmente
            if (checkedTableBody) {
                checkedTableBody.innerHTML = `
                    <tr id="empty-row">
                        <td colspan="3" class="text-muted text-center py-4">
                            Relatório gerado! Nenhum envio pendente.
                        </td>
                    </tr>
                `;
            }

            // [USANDO SEU MODAL SYSTEM]
            await window.ModalSystem.alert(
                'Relatório Gerado', 
                `<p>O relatório foi criado com sucesso.</p>`,
                { confirmClass: 'btn-success', confirmLabel: 'Ver Histórico' }
            );
            
            // Redireciona para lista de romaneios
            window.location.href = '/expedicao/romaneios';

        } catch (error) {
            console.error(error);
            await window.ModalSystem.alert('Erro', `Falha ao gerar relatório: ${error.message}`);
            updateFinalizeButtonState();
        }
    }

    // Auxiliar para atualizar texto/estado do botão
    function updateFinalizeButtonState() {
        if (finalizeBtn) {
            finalizeBtn.disabled = !hasPendingItems;
            finalizeBtn.innerHTML = hasPendingItems 
                ? '<i class="fas fa-file-pdf"></i> Gerar Relatório Agora' 
                : '<i class="fas fa-check"></i> Tudo em dia';
        }
    }

    function triggerAutoSave() {
        if (!hasPendingItems) return;
        
        // Dispara e esquece (Fire and forget) segura
        fetch('/expedicao/api/finalize', { 
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error('Erro no auto-save:', err));
    }

    function setupNavigationGuard() {
        // Intercepta todos os cliques em links (<a>)
        document.body.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            
            // Se não for link, ou se não tiver itens pendentes, ignora
            if (!link || !hasPendingItems) return;
            
            // Se for link de download ou target blank, ignora
            if (link.hasAttribute('download') || link.target === '_blank') return;

            // Previne a navegação imediata
            e.preventDefault();
            const targetUrl = link.href;

            // [USANDO SEU MODAL SYSTEM]
            const confirmed = await window.ModalSystem.confirm(
                'Gerando Relatório Automático',
                '<p>Você possui envios conferidos que ainda não estão em um romaneio.</p><p>Ao sair, <strong>um relatório será gerado automaticamente</strong> com esses pedidos.</p>',
                {
                    confirmLabel: 'Entendi, Gerar e Sair',
                    cancelLabel: 'Cancelar (Ficar aqui)',
                    confirmClass: 'btn-primary'
                }
            );

            if (confirmed) {
                // Usuário aceitou. Dispara o save e navega.
                triggerAutoSave();
                
                // Pequeno delay visual para dar sensação de processamento, depois navega
                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 300);
            }
        });
    }

    // Event Listeners
    if (scanForm) {
        scanForm.addEventListener('submit', handleCheck);
    }

    if (finalizeBtn) {
        finalizeBtn.addEventListener('click', handleManualGenerateReport);
    }

    const initialRows = checkedTableBody ? checkedTableBody.querySelectorAll('tr') : [];
    // Se tiver linhas e não for a linha de "vazio", marca true
    if (initialRows.length > 0 && !document.getElementById('empty-row')) {
        hasPendingItems = true;
    }

    updateFinalizeButtonState();

    setupNavigationGuard();

    window.addEventListener('pagehide', () => {
        if (hasPendingItems) {
            triggerAutoSave();
        }
    });

})();