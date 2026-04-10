/**
 * public/scripts/return-conference.js
 * Lógica para a tela de Conferência e Resolução de Devoluções.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // Elementos DOM
    const inputEl = document.getElementById('returnInput');
    const btnClear = document.getElementById('btnClear');
    const resultArea = document.getElementById('resultArea');
    const emptyState = document.getElementById('emptyState');
    const btnResolve = document.getElementById('btnResolve');
    const alreadyResolvedAlert = document.getElementById('alreadyResolvedAlert');
    const actionArea = document.getElementById('actionArea');

    // Elementos de Dados
    const resOrderNumber = document.getElementById('orderNumberDisplay');
    const resComprador = document.getElementById('resComprador');
    const resProduto = document.getElementById('resProduto');
    const resPackId = document.getElementById('resPackId');
    const resStatusBucket = document.getElementById('resStatusBucket');
    const resDevHistorico = document.getElementById('resDevHistorico');

    // Estado Local
    let currentOrderId = null;
    let isProcessing = false;

    // --- Inicialização ---
    inputEl.focus();

    // --- Eventos ---

    // Detecta Enter no input (Scanner geralmente envia Enter no final)
    inputEl.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const term = inputEl.value.trim();
            if (term) {
                checkOrder(term);
            }
        }
    });

    // Botão Limpar
    btnClear.addEventListener('click', resetUI);

    // Botão Resolver
    btnResolve.addEventListener('click', async () => {
        if (!currentOrderId) return;
        
        // Usa o ModalSystem do main.js se disponível, senão confirm nativo
        if (window.ModalSystem) {
            const confirmed = await window.ModalSystem.confirm(
                'Confirmar Resolução',
                'Tem certeza que deseja marcar esta devolução como <b>RESOLVIDA</b>?',
                { confirmText: 'Sim, Resolver', cancelText: 'Cancelar', confirmClass: 'btn-success' }
            );
            if (confirmed) executeResolution(currentOrderId);
        } else {
            if (confirm('Marcar como RESOLVIDA?')) executeResolution(currentOrderId);
        }
    });

    // --- Funções Lógicas ---

    async function checkOrder(term) {
        if (isProcessing) return;
        isProcessing = true;
        setLoading(true);

        try {
            // Chama a API criada no OrderController
            const response = await fetch(`/pedidos/api/check-return?term=${encodeURIComponent(term)}`);
            const result = await response.json();

            if (result.success && result.data) {
                renderOrder(result.data);
                inputEl.value = ''; // Limpa para próxima leitura (opcional, ou mantém para conferencia)
            } else {
                showError(result.message || 'Pedido não encontrado.');
                inputEl.value = '';
                inputEl.focus();
            }

        } catch (error) {
            console.error(error);
            showError('Erro de conexão ao buscar pedido.');
        } finally {
            isProcessing = false;
            setLoading(false);
        }
    }

    async function executeResolution(orderId) {
        try {
            const response = await fetch('/pedidos/api/resolve-return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });

            const result = await response.json();

            if (result.success) {
                if (window.ModalSystem) {
                    await window.ModalSystem.alert('Sucesso', 'Devolução marcada como resolvida!');
                } else {
                    alert('Sucesso!');
                }
                resetUI();
            } else {
                showError(result.message || 'Erro ao resolver.');
            }

        } catch (error) {
            console.error(error);
            showError('Erro ao processar a requisição.');
        }
    }

    // --- Renderização ---

    function renderOrder(order) {
        currentOrderId = order.id;

        // Preenche dados
        resOrderNumber.textContent = `#${order.numero_venda}`;
        resComprador.textContent = order.comprador || 'Consumidor';
        resProduto.textContent = order.titulo_anuncio || '-';
        resPackId.textContent = order.pack_id || 'N/A';
        
        // Status Principal
        resStatusBucket.textContent = order.status_bucket;
        // Aplica classe de cor baseada no status (usa classes do CSS existente)
        resStatusBucket.className = `badge status-${order.status_bucket}`;

        // Histórico de Devolução
        if (order.dev_historico === 'resolvido') {
            resDevHistorico.textContent = '✅ RESOLVIDO';
            resDevHistorico.className = 'badge badge-success';
            
            // UI: Esconde botão de ação, mostra alerta
            alreadyResolvedAlert.style.display = 'block';
            actionArea.style.display = 'none';
        } else if (order.dev_historico === 'nao_resolvido') {
            resDevHistorico.textContent = '⚠️ NÃO RESOLVIDO';
            resDevHistorico.className = 'badge badge-warning';
            
            // UI: Mostra botão de ação
            alreadyResolvedAlert.style.display = 'none';
            actionArea.style.display = 'block';
        } else {
            resDevHistorico.textContent = 'Sem Histórico';
            resDevHistorico.className = 'badge';
            
            // UI: Permite resolver mesmo se for nulo (cria o histórico agora)
            alreadyResolvedAlert.style.display = 'none';
            actionArea.style.display = 'block';
        }

        // Mostra Card, Esconde Empty State
        resultArea.style.display = 'block';
        emptyState.style.display = 'none';
    }

    function resetUI() {
        currentOrderId = null;
        inputEl.value = '';
        resultArea.style.display = 'none';
        emptyState.style.display = 'block';
        inputEl.focus();
    }

    function setLoading(loading) {
        if (loading) {
            inputEl.disabled = true;
            document.body.style.cursor = 'wait';
        } else {
            inputEl.disabled = false;
            document.body.style.cursor = 'default';
            inputEl.focus();
        }
    }

    function showError(msg) {
        if (window.ModalSystem) {
            window.ModalSystem.alert('Atenção', msg);
        } else {
            alert(msg);
        }
    }
});