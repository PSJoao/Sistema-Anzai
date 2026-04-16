/**
 * public/scripts/orders-dashboard.js
 * Lógica de front-end para a Torre de Controle de Pedidos (Dashboard Avançada)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Estado da Aplicação (Matriz de Filtragem)
    const state = {
        page: 1,
        statusFilter: 'todos', // Grupo 1: Fluxo Operacional (pendente, separado...)
        dateFilter: 'hoje',    // Grupo 2: Prazo/Prioridade (hoje, atrasados...)
        company: 'todos',
        divergenceFilter: false,
        devHistorico: 'todos',
        search: '',
        flexFilter: false,
        startDate: '',
        endDate: '',
        mediationFilter: 'todos',
        selectionMode: false,
        plataforma: 'mercado_livre',
        selectedIds: new Set()
    };

    // Referências ao DOM
    const elements = {
        filterButtons: document.querySelectorAll('.filter-tab'), // Seleciona todos os botões de ambos os grupos
        searchInput: document.getElementById('searchInput'),
        companySelect: document.getElementById('companySelect'),
        ordersContainer: document.getElementById('ordersContainer'),
        paginationContainer: document.getElementById('paginationContainer'),
        statsCounters: document.querySelectorAll('[data-stat-counter]'),
        dateFilterGroup: document.getElementById('dateFilterGroup'),
        divergenceFilterWrapper: document.getElementById('divergenceFilterWrapper'),
        divergenceCheckbox: document.getElementById('divergenceFilter'),
        flexFilterContainer: document.getElementById('flexFilterContainer'),
        flexCheckbox: document.getElementById('flexFilter'),
        labelNormal: document.getElementById('labelNormal'),
        labelFlex: document.getElementById('labelFlex'),
        startDateInput: document.getElementById('startDateInput'),
        endDateInput: document.getElementById('endDateInput'),
        mediationSelect: document.getElementById('mediationSelect'),
        returnHistoryFilterGroup: document.getElementById('returnHistoryFilterGroup'),

        eqPendente: document.getElementById('eq-pendente'),
        eqSeparado: document.getElementById('eq-separado'),
        eqEmRomaneio: document.getElementById('eq-em-romaneio'),
        eqTotal: document.getElementById('eq-total'),

        // Controles de Massa
        bulkActionsToolbar: document.getElementById('bulkActionsToolbar'),
        toggleSelectionBtn: document.getElementById('toggleSelectionBtn'),
        cancelSelectionBtn: document.getElementById('cancelSelectionBtn'),
        selectAllBtn: document.getElementById('selectAllBtn'),
        bulkActionSelect: document.getElementById('bulkActionSelect'),
        applyBulkActionBtn: document.getElementById('applyBulkActionBtn'),
        selectedCountSpan: document.getElementById('selectedCount'),
    };

    // --- Inicialização ---
    init();

    function init() {
        bindEvents();

        // Lê URL Params para restaurar estado
        const params = new URLSearchParams(window.location.search);
        if (params.has('status')) state.statusFilter = params.get('status');
        if (params.has('date')) state.dateFilter = params.get('date');
        if (params.has('divergence')) {
            state.divergenceFilter = params.get('divergence') === 'true';
            if (elements.divergenceCheckbox) {
                elements.divergenceCheckbox.checked = state.divergenceFilter;
            }
        }
        if (params.has('search')) {
            state.search = params.get('search');
            elements.searchInput.value = state.search;
        }
        if (params.has('devHistorico')) state.devHistorico = params.get('devHistorico');
        if (params.has('company')) {
            state.company = params.get('company');
            if (elements.companySelect) {
                elements.companySelect.value = state.company;
            }
        }
        if (params.has('flex')) {
            state.flexFilter = params.get('flex') === 'true';
            if (elements.flexCheckbox) {
                elements.flexCheckbox.checked = state.flexFilter;
            }
        }

        if (elements.startDateInput) state.startDate = elements.startDateInput.value;
        if (elements.endDateInput) state.endDate = elements.endDateInput.value;
        if (elements.mediationSelect) state.mediationFilter = elements.mediationSelect.value;

        if (params.has('mediation')) {
            state.mediationFilter = params.get('mediation');
            if (elements.mediationSelect) elements.mediationSelect.value = state.mediationFilter;
        }

        if (params.has('plataforma')) {
            state.plataforma = params.get('plataforma');
        }

        updatePlatformVisuals();
        updateFlexModeVisuals();
        updateDateFiltersVisibility();
        updateReturnHistoryVisibility();
        updateDivergenceVisibility();
        updateUIFilters(); // Marca visualmente os botões ativos
        fetchOrders();
    }

    function bindEvents() {
        // Evento unificado para os botões de filtro (Fluxo e Prazo)
        elements.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnEl = e.target.closest('.filter-tab');
                if (!btnEl) return;

                const type = btnEl.dataset.filterType; // 'status' ou 'date'
                const value = btnEl.dataset.value;

                // Atualiza o estado conforme o grupo clicado
                let changed = false;
                if (type === 'status') {
                    if (state.statusFilter !== value) {
                        state.statusFilter = value;
                        state.page = 1;

                        state.devHistorico = 'todos';

                        updateDateFiltersVisibility();
                        updateReturnHistoryVisibility();
                        updateDivergenceVisibility();

                        updateUIFilters();
                        fetchOrders();
                    }
                } else if (type === 'date') {
                    if (state.dateFilter !== value) {
                        state.dateFilter = value;
                        changed = true;
                    }
                } else if (type === 'devHistorico') {
                    if (state.devHistorico !== value) {
                        state.devHistorico = value;
                        changed = true;
                    }
                }

                if (changed) {
                    state.page = 1; // Reseta paginação
                    updateUIFilters();
                    fetchOrders();
                }
            });
        });

        if (elements.companySelect) {
            elements.companySelect.addEventListener('change', (e) => {
                state.company = e.target.value;
                state.page = 1; // Reseta para primeira página
                fetchOrders();
            });
        }

        if (elements.flexCheckbox) {
            elements.flexCheckbox.addEventListener('change', (e) => {
                state.flexFilter = e.target.checked;
                updateFlexModeVisuals();
                state.page = 1; // Reseta paginação
                fetchOrders();
            });
        }

        if (elements.startDateInput) {
            elements.startDateInput.addEventListener('change', (e) => {
                state.startDate = e.target.value;
                state.page = 1;
                fetchOrders();
            });
        }

        if (elements.endDateInput) {
            elements.endDateInput.addEventListener('change', (e) => {
                state.endDate = e.target.value;
                state.page = 1;
                fetchOrders();
            });
        }

        // Novo: Select de Mediação
        if (elements.mediationSelect) {
            elements.mediationSelect.addEventListener('change', (e) => {
                state.mediationFilter = e.target.value;
                state.page = 1;
                fetchOrders();
            });
        }

        // Busca (Debounce)
        let debounceTimer;
        elements.searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                state.search = e.target.value.trim();
                state.page = 1;
                fetchOrders();
            }, 400); // 400ms delay
        });

        if (elements.divergenceCheckbox) {
            elements.divergenceCheckbox.addEventListener('change', (e) => {
                state.divergenceFilter = e.target.checked;
                state.page = 1;
                fetchOrders();
            });
        }

        // Modo Seleção
        elements.toggleSelectionBtn.addEventListener('click', toggleSelectionMode);
        elements.cancelSelectionBtn.addEventListener('click', disableSelectionMode);

        // Selecionar Todos (da página atual)
        elements.selectAllBtn.addEventListener('click', toggleSelectAllCurrentPage);

        // Aplicar Ação em Massa
        elements.applyBulkActionBtn.addEventListener('click', handleBulkApply);
    }

    // --- Lógica de Dados (Fetch) ---

    async function fetchOrders() {
        setLoading(true);

        try {
            // Envia os DOIS filtros para o back-end
            const params = new URLSearchParams({
                page: state.page,
                status: state.statusFilter,
                date: state.dateFilter,
                company: state.company,
                divergence: state.divergenceFilter,
                flex: state.flexFilter,
                search: state.search,
                startDate: state.startDate,
                endDate: state.endDate,
                mediation: state.mediationFilter,
                devHistorico: state.devHistorico,
                plataforma: state.plataforma
            });

            // Adiciona cabeçalho para garantir retorno JSON
            const response = await fetch(`/pedidos?${params.toString()}`, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) throw new Error('Erro ao buscar pedidos');

            const data = await response.json();

            // Renderiza
            renderOrders(data.orders);
            renderPagination(data.pagination);
            updateStats(data.stats);

            if (data.activeStartDate && data.activeStartDate !== state.startDate) {
                state.startDate = data.activeStartDate;
                if (elements.startDateInput) elements.startDateInput.value = data.activeStartDate;
            }
            if (data.activeEndDate && data.activeEndDate !== state.endDate) {
                state.endDate = data.activeEndDate;
                if (elements.endDateInput) elements.endDateInput.value = data.activeEndDate;
            }

            // Atualiza URL sem recarregar (History API)
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

        } catch (error) {
            console.error('Erro:', error);
            elements.ordersContainer.innerHTML = `
                <div class="alert alert-error">
                    Não foi possível carregar os pedidos. Tente novamente.
                </div>
            `;
        } finally {
            setLoading(false);
        }
    }

    function updateUIFilters() {
        elements.filterButtons.forEach(btn => {
            const type = btn.dataset.filterType;
            const value = btn.dataset.value;

            let isActive = false;

            if (type === 'status') {
                isActive = (value === state.statusFilter);
            } else if (type === 'date') {
                isActive = (value === state.dateFilter);
            }
            else if (type === 'devHistorico') {
                isActive = (value === state.devHistorico);
            }

            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function updatePlatformVisuals() {
        if (!elements.flexFilterContainer) return;

        if (state.plataforma === 'shopee') {
            elements.flexFilterContainer.style.display = 'none';

            // Segurança: Se o filtro Flex estivesse ativo, nós desligamos para não bugar a busca
            if (state.flexFilter) {
                state.flexFilter = false;
                if (elements.flexCheckbox) elements.flexCheckbox.checked = false;
            }
        } else {
            // O padrão do Bootstrap/Layout é 'block' ou 'flex'
            elements.flexFilterContainer.style.display = 'flex';
        }
    }

    function updateFlexModeVisuals() {
        // Proteção caso os elementos não existam na tela
        if (!elements.labelNormal || !elements.labelFlex) return;

        if (state.flexFilter) {
            // Modo Flex LIGADO (Azul na direita, Cinza na esquerda)
            elements.labelNormal.classList.remove('active-normal');
            elements.labelFlex.classList.add('active-flex');
        } else {
            // Modo Normal LIGADO (Preto na esquerda, Cinza na direita)
            elements.labelNormal.classList.add('active-normal');
            elements.labelFlex.classList.remove('active-flex');
        }
    }

    function updateStats(stats) {
        if (!stats) return;

        const map = {
            // Fluxo Operacional
            'pendente': stats.count_pendente,
            'separado': stats.count_separado,
            'em_romaneio': stats.count_em_romaneio,
            'enviado': stats.count_enviado,

            // Prazos / Datas
            'hoje': stats.count_hoje,
            'atrasados': stats.count_atrasados,
            'futuros': stats.count_futuros,
            //'agendados': stats.count_agendados,
            'cancelados': stats.count_cancelados,
            'entregues': stats.count_entregues,
            'devolucao_analise': stats.count_devolucao_analise,
            'devolucao_concluida': stats.count_devolucao_concluida,
            'nao_entregue': stats.count_nao_entregue,
            'venda_concretizada': stats.count_venda_concretizada,
            'dev_resolvido': stats.count_dev_resolvido,
            'dev_nao_resolvido': stats.count_dev_nao_resolvido,
            'sem_enviar': stats.count_sem_enviar,
        };

        elements.statsCounters.forEach(span => {
            const filterKey = span.dataset.statCounter;
            // Mostra 0 se indefinido
            span.textContent = map[filterKey] !== undefined ? map[filterKey] : 0;
        });

        const pendentes = stats.count_pendente || 0;
        const separados = stats.count_separado || 0;
        const embalados = stats.count_em_romaneio || 0;
        const totalEquacao = Number(pendentes) + Number(separados) + Number(embalados);

        if (elements.eqPendente) elements.eqPendente.textContent = pendentes;
        if (elements.eqSeparado) elements.eqSeparado.textContent = separados;
        if (elements.eqEmRomaneio) elements.eqEmRomaneio.textContent = embalados;
        if (elements.eqTotal) elements.eqTotal.textContent = totalEquacao;
    }

    // --- Renderização ---

    function renderOrders(orders) {
        if (!orders || orders.length === 0) {
            elements.ordersContainer.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum pedido encontrado com estes filtros.</p>
                </div>
            `;
            return;
        }

        elements.ordersContainer.innerHTML = orders.map(order => {
            const isSelected = state.selectedIds.has(String(order.id));

            // Badge Manual
            const manualBadge = order.situacao_manual
                ? `<span class="badge badge-manual" title="Definido Manualmente">Manual: ${order.situacao_manual}</span>`
                : '';

            // Formatação de Dados
            const nomeComprador = sanitizeBuyerName(order.comprador);
            const skus = order.lista_skus || 'Sem SKU';
            const codigoLoja = order.codigo_empresa || '-';
            const nfNumero = order.nfe_numero || '-';

            // --- LÓGICA DO BOTÃO DE ETIQUETA ---
            // Só aparece se estiver no status 'em_romaneio' (Embalado)
            const showLabelButton = order.status_bucket === 'em_romaneio';
            const labelButtonHtml = showLabelButton
                ? `<a href="/empacotamento/etiqueta/${order.numero_venda}" 
                      target="_blank" 
                      class="btn btn-sm btn-outline btn-print-label" 
                      title="Gerar Etiqueta de Envio"
                      onclick="event.stopPropagation()">
                      Gerar Etiqueta
                   </a>`
                : '';
            // ------------------------------------

            let mediationBadge = '';
            if (order.medicao === 'aberta') {
                mediationBadge = `<span class="badge badge-warning" style="margin-left:5px;">⚠️ Mediação Aberta</span>`;
            } else if (order.medicao === 'fechada') {
                mediationBadge = `<span class="badge badge-success" style="margin-left:5px;">✅ Mediação Fechada</span>`;
            }

            let empacotadorName = '';
            if (order.empacotador) {
                empacotadorName = `Empacotador: ${order.empacotador}`;
            }

            return `
                <article class="card order-card-row ${isSelected ? 'selected' : ''}" data-id="${order.id}">
                    
                    <div class="order-selection-checkbox ${state.selectionMode ? 'visible' : ''}">
                        <input type="checkbox" class="order-checkbox" 
                            ${isSelected ? 'checked' : ''} 
                            onchange="window.OrdersApp.toggleOrderSelection('${order.id}', this.checked)">
                    </div>
                    
                    <div class="order-info-main">
                        <div class="order-header-row" style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div class="header-left">
                                <span class="order-number">#${order.numero_venda}</span>
                                <span class="order-status-badge status-${order.status_bucket}">${order.status_bucket}</span>
                                ${empacotadorName}
                                ${manualBadge}
                                ${mediationBadge}
                                <span class="detail-value">${order.desc_status || ''}</span>
                            </div>
                        </div>
                        
                        <div class="order-details-block">
                            ${state.plataforma === 'shopee' || order.plataforma === 'shopee' ? '' : `<span class="detail-value" style="color: #3457D5;">${order.pack_id || ''}</span>`}
                            <div class="detail-row">
                                <span class="detail-label">Comprador:</span>
                                <span class="detail-value text-uppercase">${nomeComprador}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Itens:</span>
                                <span class="detail-value sku-list">${skus}</span>
                            </div>
                        </div>

                        <div class="order-note-block" style="margin-top: 10px; padding: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid #ffc107;">
                            <span class="detail-label" style="display: block; font-size: 0.8em; color: #666; margin-bottom: 2px;">Nota do Pedido (Duplo clique para editar):</span>
                            <span class="note-display" 
                                  style="cursor: pointer; display: block; min-height: 20px; font-style: ${order.nota_pedido ? 'normal' : 'italic'}; color: ${order.nota_pedido ? '#333' : '#999'};"
                                  ondblclick="window.OrdersApp.editNote('${order.id}', this)">
                                ${order.nota_pedido ? order.nota_pedido : 'Clique duas vezes para adicionar uma nota...'}
                            </span>
                        </div>

                    </div>

                    <div class="order-dates">
                        <div class="date-group">
                            <span class="detail-label">Limite Envio:</span>
                            <span class="detail-value ${isDateLate(order.data_envio_limite) ? 'text-danger' : ''}">
                                <i class="icon-clock"></i> ${formatDateShort(order.data_envio_limite)}
                            </span>
                        </div>
                        
                        ${order.data_coleta_agendada ? `
                        <div class="date-group">
                            <span class="detail-label">Coleta Agendada:</span>
                            <span class="detail-value text-warning">
                                <i class="icon-truck"></i> ${formatDateShort(order.data_coleta_agendada)}
                            </span>
                        </div>` : ''}
                    </div>

                    <div class="order-fiscal">
                        <div class="fiscal-group">
                            <span class="detail-label">Cód. Loja:</span>
                            <span class="detail-value">${codigoLoja}</span>
                        </div>
                        <div class="fiscal-group">
                            <span class="detail-label">Nota Fiscal:</span>
                            ${order.nfe_numero
                    ? `<span class="nfe-tag">${order.nfe_numero}</span>`
                    : `<span class=\"nfe-missing\">Pendente</span>`}
                        </div>
                    </div>

                    <div>
                        <div class="header-dates-right" style="text-align: right; font-size: 0.85rem; color: #6c757d; white-space: nowrap; margin-left: 10px;">
                            ${order.data_venda ? `<div style="margin-bottom: 2px;">Venda: <strong style="color: #343a40;">${formatDateFull(order.data_venda)}</strong></div>` : ''}
                            ${order.data_acao ? `<div>Ação: <strong style="color: #343a40;">${formatDateFull(order.data_acao)}</strong></div>` : ''}
                        </div>
                        <br><br>
                        <div class="order-actions">
                            ${labelButtonHtml}
                            <i class="icon-chevron-right action-arrow"></i>
                        </div>            
                    </div>
                </article>
            `;
        }).join('');
    }

    // --- Helpers de Formatação ---

    /**
     * Remove repetições no nome do comprador.
     * Ex: "MARINHO MARINHO" -> "MARINHO"
     */
    function sanitizeBuyerName(name) {
        if (!name) return 'Consumidor';
        // Divide por espaços, remove vazios
        const parts = name.trim().split(/\s+/);
        // Cria um Set para pegar únicos (Case sensitive, pode melhorar se quiser)
        const unique = [...new Set(parts)];
        return unique.join(' ');
    }

    function isDateLate(dateString) {
        if (!dateString) return false;
        const date = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date < today;
    }

    function renderPagination(meta) {
        if (!meta || meta.totalPages <= 1) {
            elements.paginationContainer.innerHTML = '';
            return;
        }

        const prevDisabled = meta.currentPage === 1 ? 'disabled' : '';
        const nextDisabled = meta.currentPage === meta.totalPages ? 'disabled' : '';

        elements.paginationContainer.innerHTML = `
            <div class="pagination">
                <button class="btn btn-sm btn-outline" ${prevDisabled} 
                    onclick="window.OrdersApp.changePage(${meta.currentPage - 1})">
                    Anterior
                </button>
                <span class="pagination-info">
                    Página ${meta.currentPage} de ${meta.totalPages}
                </span>
                <button class="btn btn-sm btn-outline" ${nextDisabled} 
                    onclick="window.OrdersApp.changePage(${meta.currentPage + 1})">
                    Próximo
                </button>
            </div>
        `;
    }

    // --- Lógica de Seleção em Massa ---

    // --- Lógica de Seleção em Massa ---

    function toggleSelectionMode() {
        state.selectionMode = !state.selectionMode;

        // Referência ao container pai da toolbar
        const toolbarContainer = document.querySelector('.dashboard-toolbar');

        if (state.selectionMode) {
            // Adiciona classe ao PAI para controlar o layout via CSS
            toolbarContainer.classList.add('selection-active');

            elements.toggleSelectionBtn.style.display = 'none';
            document.querySelectorAll('.order-selection-checkbox').forEach(el => el.classList.add('visible'));
        } else {
            disableSelectionMode();
        }
    }

    function disableSelectionMode() {
        state.selectionMode = false;
        state.selectedIds.clear(); // Limpa seleção ao sair
        updateSelectionCounter();

        // Remove classe do PAI
        const toolbarContainer = document.querySelector('.dashboard-toolbar');
        if (toolbarContainer) toolbarContainer.classList.remove('selection-active');

        elements.toggleSelectionBtn.style.display = 'inline-flex';

        document.querySelectorAll('.order-selection-checkbox').forEach(el => el.classList.remove('visible'));
        document.querySelectorAll('.order-card-row.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
    }

    function toggleSelectAllCurrentPage() {
        const checkboxes = document.querySelectorAll('.order-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(cb => {
            // Se nem todos estão marcados, marca todos. Se todos estão, desmarca.
            if (!allChecked && !cb.checked) cb.click();
            if (allChecked && cb.checked) cb.click();
        });
    }

    // Ação do Botão "Aplicar Alteração"
    async function handleBulkApply() {
        const action = elements.bulkActionSelect.value;
        const count = state.selectedIds.size;

        if (count === 0) {
            alert('Nenhum pedido selecionado.');
            return;
        }
        if (!action) {
            alert('Selecione uma situação para aplicar.');
            return;
        }

        // Usa o ModalSystem do main.js
        if (window.ModalSystem) {
            const confirmed = await window.ModalSystem.confirm(
                'Confirmar Alteração em Massa',
                `Deseja alterar a situação de <b>${count} pedido(s)</b> para <b>"${action.toUpperCase()}"</b>?<br>Isso irá sobrepor a lógica automática de prazos.`,
                {
                    confirmText: 'Confirmar',
                    cancelText: 'Cancelar'
                }
            );

            if (confirmed) {
                executeBulkUpdate(action);
            }
        } else {
            // Fallback se ModalSystem não existir
            if (confirm(`Alterar ${count} pedidos para ${action}?`)) {
                executeBulkUpdate(action);
            }
        }
    }

    async function executeBulkUpdate(newStatus) {
        try {
            const response = await fetch('/pedidos/api/bulk-manual-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderIds: Array.from(state.selectedIds),
                    status: newStatus
                })
            });

            const result = await response.json();

            if (result.success) {
                disableSelectionMode();
                fetchOrders(); // Recarrega lista
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (err) {
            console.error(err);
            alert('Erro de conexão ao atualizar.');
        }
    }

    // --- Helpers ---

    function updateSelectionCounter() {
        elements.selectedCountSpan.textContent = `${state.selectedIds.size} selecionado(s)`;
    }

    function setLoading(isLoading) {
        if (isLoading) {
            elements.ordersContainer.classList.add('loading-opacity');
        } else {
            elements.ordersContainer.classList.remove('loading-opacity');
        }
    }

    function formatDateShort(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    function formatDateFull(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    /**
     * Controla quais filtros de data aparecem com base no fluxo selecionado.
     */
    function updateDateFiltersVisibility() {
        const status = state.statusFilter;
        const dateGroup = elements.dateFilterGroup;

        // 1. Seleciona todos os botões de data
        const dateButtons = dateGroup.querySelectorAll('.filter-tab');

        const hiddenStatusList = [
            'enviado',
            'entregue',
            'cancelado',
            'venda_concretizada',
            'devolucao_analise',
            'devolucao_concluida',
            'nao_entregue',
            'sem_enviar'
        ];

        // Regra: Não mostra nenhum filtro de prazo.
        if (hiddenStatusList.includes(status)) {
            dateGroup.style.display = 'none';
            // Reseta o filtro de data para 'todos' silenciosamente
            if (state.dateFilter !== 'todos') {
                state.dateFilter = 'todos';
                // Atualiza visualmente o botão 'todos' como ativo
                updateUIFilters();
            }
            return;
        }

        // Se não for finalizado, garante que o grupo apareça
        dateGroup.style.display = 'flex';

        // Cenário B: Fluxos Ativos (Pendente, Separado, Embalado)
        // Regra: Só mostra Hoje e Atrasados (e Todos). Esconde Futuros e Agendados.
        if (['pendente', 'separado', 'em_romaneio'].includes(status)) {
            dateButtons.forEach(btn => {
                const val = btn.dataset.value;

                // MUDANÇA AQUI: Removemos 'futuros' da lista de ocultação
                if (['agendados'].includes(val)) {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = 'flex';
                }
            });

            // Se o usuário estava em 'agendados' (que sumiu), joga ele para 'todos'
            if (['agendados'].includes(state.dateFilter)) {
                state.dateFilter = 'todos';
                fetchOrders();
            }
        }

        // Cenário C: Todos
        // Regra: Mostra tudo.
        else if (status === 'todos') {
            dateButtons.forEach(btn => btn.style.display = 'flex');
        }

        updateUIFilters(); // Garante que as classes .active estejam certas
    }

    /**
     * Mostra o filtro de Histórico de Devolução APENAS se a aba for 'devolucao_concluida'.
     */
    function updateReturnHistoryVisibility() {
        if (!elements.returnHistoryFilterGroup) return;

        if (state.statusFilter === 'devolucao_concluida') {
            elements.returnHistoryFilterGroup.style.display = 'block';

            // Garante que o filtro de datas suma (reforço)
            if (elements.dateFilterGroup) elements.dateFilterGroup.style.display = 'none';
        } else {
            elements.returnHistoryFilterGroup.style.display = 'none';
        }
    }

    /**
     * Controla a visibilidade do Checkbox "Não Enviados - Plataforma"
     */
    function updateDivergenceVisibility() {
        if (!elements.divergenceFilterWrapper) return;

        if (state.statusFilter === 'enviado') {
            elements.divergenceFilterWrapper.style.display = 'block';
        } else {
            elements.divergenceFilterWrapper.style.display = 'none';
            // Se sair da aba Enviados, desmarca o filtro para não bugar a próxima aba
            if (state.divergenceFilter) {
                state.divergenceFilter = false;
                if (elements.divergenceCheckbox) {
                    elements.divergenceCheckbox.checked = false;
                }
            }
        }
    }

    // --- Expores Globais (para onclick no HTML) ---
    window.OrdersApp = {
        changePage: (newPage) => {
            state.page = newPage;
            fetchOrders();
            // Scroll para o topo da lista
            elements.ordersContainer.scrollIntoView({ behavior: 'smooth' });
        },
        toggleOrderSelection: (id, isChecked) => {
            if (isChecked) {
                state.selectedIds.add(id);
                document.querySelector(`article[data-id="${id}"]`).classList.add('selected');
            } else {
                state.selectedIds.delete(id);
                document.querySelector(`article[data-id="${id}"]`).classList.remove('selected');
            }
            updateSelectionCounter();
        },
        editNote: (orderId, element) => {
            // Evita criar múltiplos inputs se o utilizador clicar várias vezes
            if (element.querySelector('input')) return;

            const isPlaceholder = element.innerText.includes('Clique duas vezes');
            const currentNote = isPlaceholder ? '' : element.innerText;

            // Cria a caixa de texto
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.style.width = '100%';
            input.value = currentNote;
            input.placeholder = 'Digite a nota e pressione Enter...';

            // Substitui o texto da span pela caixa de texto
            element.innerHTML = '';
            element.appendChild(input);
            input.focus();

            // Lógica para guardar a nota no Back-end
            const saveHandler = async (e) => {
                // Se for evento de teclado e não for Enter, apenas continua a digitar
                if (e.type === 'keydown' && e.key !== 'Enter') return;

                const newNote = input.value.trim();
                input.disabled = true; // Bloqueia enquanto guarda

                try {
                    const response = await fetch('/pedidos/api/nota', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId, nota: newNote })
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Atualiza a vista com a nova nota
                        element.innerHTML = '';
                        element.innerText = result.nota || 'Clique duas vezes para adicionar uma nota...';
                        element.style.fontStyle = result.nota ? 'normal' : 'italic';
                        element.style.color = result.nota ? '#333' : '#999';
                    } else {
                        alert('Erro ao guardar nota: ' + result.message);
                        element.innerHTML = '';
                        element.innerText = currentNote || 'Clique duas vezes para adicionar uma nota...';
                    }
                } catch (error) {
                    console.error('Erro ao guardar nota:', error);
                    alert('Erro de ligação ao guardar a nota.');
                    element.innerHTML = '';
                    element.innerText = currentNote || 'Clique duas vezes para adicionar uma nota...';
                }
            };

            // Guarda quando tira o rato da caixa ou quando prime Enter
            input.addEventListener('blur', saveHandler);
            input.addEventListener('keydown', saveHandler);
        }
    };

    const btnExport = document.getElementById('btnExportExcel');
    if (btnExport) {
        btnExport.addEventListener('click', (e) => {
            e.preventDefault();

            // Muda texto para feedback visual
            const originalText = btnExport.innerHTML;
            btnExport.innerHTML = '<i class="icon-refresh spinning"></i> Gerando...';
            btnExport.disabled = true;

            // Monta a URL com os parâmetros ATUAIS do state
            const params = new URLSearchParams({
                search: state.search,
                status: state.statusFilter, // ex: 'pendente', 'separado'
                date: state.dateFilter,     // ex: 'hoje', 'atrasados'
                company: state.company,      // ex: 'todos' ou ID da loja
                divergence: state.divergenceFilter,
                flex: state.flexFilter,
                startDate: state.startDate,
                endDate: state.endDate,
                plataforma: state.plataforma,
                mediation: state.mediationFilter,
                devHistorico: state.devHistorico
            });

            // Força o download redirecionando para a API
            // Usamos window.location para GET simples que baixa arquivo
            window.location.href = `/pedidos/api/export?${params.toString()}`;

            // Restaura o botão após alguns segundos (já que o download não recarrega a página)
            setTimeout(() => {
                btnExport.innerHTML = originalText;
                btnExport.disabled = false;
            }, 3000);
        });
    }

    // Lógica para o botão de Exportar Registros (Admin)
    const btnExportLogs = document.getElementById('btnExportLogs');

    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', (e) => {
            e.preventDefault();

            // 1. Define o HTML do formulário de datas
            const formHtml = `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <p>Selecione o período para análise de produtividade (Separação e Empacotamento):</p>
                    
                    <div class="form-group">
                        <label for="modalStartDate" style="font-weight: bold; display: block; margin-bottom: 5px;">Data Inicial:</label>
                        <input type="date" id="modalStartDate" class="form-control" style="width: 100%; padding: 8px;">
                    </div>

                    <div class="form-group">
                        <label for="modalEndDate" style="font-weight: bold; display: block; margin-bottom: 5px;">Data Final:</label>
                        <input type="date" id="modalEndDate" class="form-control" style="width: 100%; padding: 8px;">
                    </div>
                </div>
            `;

            // 2. Chama o ModalSystem customizado
            // Estamos usando a estrutura do seu main.js onde ele injeta HTML no body
            if (window.ModalSystem) {
                // O ModalSystem.confirm do seu main.js espera (title, messageHtml, options)
                window.ModalSystem.confirm(
                    'Exportar Registros de Produtividade',
                    formHtml,
                    {
                        confirmText: 'Baixar Relatório',
                        cancelText: 'Cancelar'
                    }
                ).then((confirmed) => {
                    if (confirmed) {
                        const startDate = document.getElementById('modalStartDate').value;
                        const endDate = document.getElementById('modalEndDate').value;

                        if (!startDate || !endDate) {
                            alert('Por favor, selecione as duas datas.');
                            return;
                        }

                        if (startDate > endDate) {
                            alert('A data inicial não pode ser maior que a final.');
                            return;
                        }

                        // 3. Redireciona para download se confirmado
                        const params = new URLSearchParams({ startDate, endDate });
                        window.location.href = `/pedidos/api/export-logs?${params.toString()}`;
                    }
                });

                // Pequeno hack para setar datas padrão (hoje) assim que o modal abrir
                setTimeout(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const startInput = document.getElementById('modalStartDate');
                    const endInput = document.getElementById('modalEndDate');
                    if (startInput && endInput) {
                        startInput.value = today;
                        endInput.value = today;
                    }
                }, 100);
            } else {
                console.error('ModalSystem não encontrado.');
            }
        });
    }

});