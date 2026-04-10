document.addEventListener('DOMContentLoaded', () => {

    // --- Lógica do Menu Mobile  ---
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const nameUser = document.querySelector('.user-profile');

    if (menuToggle && mobileNav) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('open');
            mobileNav.classList.toggle('open');
        });
    }

    function ajustarVisibilidade() {
        if (window.innerWidth < 768) {
            nameUser.style.display = 'none'; // esconde
        } else {
            nameUser.style.display = 'block'; // mostra
        }
    }

    // Executa logo ao carregar a página
    ajustarVisibilidade();

    // Executa sempre que a tela for redimensionada
    window.addEventListener("resize", ajustarVisibilidade);

    /**
     * ================================================================
     * Sistema de Modal Flexível
     * ================================================================
     */
    const ModalSystem = {
        backdropEl: null,
        titleEl: null,
        bodyEl: null,
        footerEl: null,
        
        _currentResolve: null,
        _currentReject: null,

        // 1. Cria o HTML da modal e anexa ao <body>
        init() {
            if (this.backdropEl) return;

            // HTML baseado no main.css
            const modalHtml = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title"></h3>
                        <button class="modal-close" aria-label="Fechar Modal">&times;</button>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" data-modal-action="cancel">Cancelar</button>
                        <button class="btn btn-primary" data-modal-action="confirm">Confirmar</button>
                    </div>
                </div>
            `;
            
            this.backdropEl = document.createElement('div');
            this.backdropEl.className = 'modal-backdrop';
            this.backdropEl.innerHTML = modalHtml;
            document.body.appendChild(this.backdropEl);

            // Armazenar referências
            this.titleEl = this.backdropEl.querySelector('.modal-title');
            this.bodyEl = this.backdropEl.querySelector('.modal-body');
            this.footerEl = this.backdropEl.querySelector('.modal-footer');
            const closeBtn = this.backdropEl.querySelector('.modal-close');

            // Adicionar eventos de fecho
            this.backdropEl.addEventListener('click', (e) => {
                // --- ALTERADO: Só fecha se não estiver bloqueado ---
                if (e.target === this.backdropEl && this.allowOutsideClick !== false) {
                    this._handleCancel();
                }
            });
            closeBtn.addEventListener('click', () => this._handleCancel());

            this.footerEl.addEventListener('click', (e) => {
                const action = e.target.dataset.modalAction;
                if (action === 'confirm') {
                    this._handleConfirm();
                } else if (action === 'cancel') {
                    this._handleCancel();
                }
            });
        },

        // 2. Função principal de exibição
        show(options) {
            if (!this.backdropEl) this.init(); 
            this.allowOutsideClick = true;
            const {
                type = 'alert', // 'alert', 'confirm', 'loading'
                title,
                body,
                confirmText,
                cancelText,
                confirmClass = 'btn-primary'
            } = options;

            this.titleEl.textContent = title;
            this.bodyEl.innerHTML = ''; // Limpa o corpo

            const confirmBtn = this.footerEl.querySelector('[data-modal-action="confirm"]');
            const cancelBtn = this.footerEl.querySelector('[data-modal-action="cancel"]');
            const closeBtn = this.backdropEl.querySelector('.modal-close');

            if (type === 'loading') {
                this.bodyEl.innerHTML = '<div class="spinner"></div>' + (body || '');
                closeBtn.style.display = 'none';
                this.footerEl.style.display = 'none';
            } else {
                this.bodyEl.innerHTML = body || '';
                closeBtn.style.display = 'block';
                this.footerEl.style.display = 'flex';

                if (type === 'alert') {
                    confirmBtn.textContent = confirmText || 'OK';
                    confirmBtn.className = `btn ${confirmClass}`;
                    cancelBtn.style.display = 'none';
                } else if (type === 'confirm') {
                    confirmBtn.textContent = confirmText || 'Confirmar';
                    confirmBtn.className = `btn ${confirmClass}`;
                    confirmBtn.style.display = 'inline-block';
                    
                    cancelBtn.textContent = cancelText || 'Cancelar';
                    cancelBtn.style.display = 'inline-block';
                }
            }

            this.backdropEl.classList.add('open');
        },

        showInfo: function(options) {
            if (!this.backdropEl) this.init(); // Garante inicialização

            const {
                title,
                body,
                allowOutsideClick
            } = options;

            this.allowOutsideClick = allowOutsideClick;

            // Define Título e Corpo
            this.titleEl.textContent = title;
            this.bodyEl.innerHTML = body || ''; // Aceita HTML

            const closeBtn = this.backdropEl.querySelector('.modal-close');

            // --- Lógica de Visibilidade (AJUSTADA) ---
            // O 'X' de fechar FICA VISÍVEL
            closeBtn.style.display = 'none';

            // O footer INTEIRO (onde fica o botão OK) é ESCONDIDO
            this.footerEl.style.display = 'none';

            // Abre o modal
            this.backdropEl.classList.add('open');
        },

        // 3. Funções de "atalho"
        alert(title, body) {
            return new Promise((resolve) => {
                this._currentResolve = resolve;
                this._currentReject = null; // Alertas não rejeitam, apenas resolvem
                this.show({ type: 'alert', title, body });
            });
        },

        loading(title) {
            this.show({ type: 'loading', title: title || 'A carregar...' });
        },

        confirm(title, body, options = {}) {
            return new Promise((resolve, reject) => {
                this._currentResolve = resolve;
                this._currentReject = reject;
                this.show({
                    type: 'confirm',
                    title,
                    body,
                    ...options
                });
            });
        },

        // 4. Função de fecho
        hide() {
            if (!this.backdropEl) return;
            this.backdropEl.classList.remove('open');
            this._currentResolve = null;
            this._currentReject = null;
        },

        // 5. Handlers da Promise
        _handleConfirm() {
            if (this._currentResolve) {
                this._currentResolve(true);
            }
            this.hide();
        },

        _handleCancel() {
            // CORREÇÃO: Resolve com FALSE ao invés de rejeitar
            if (this._currentResolve) this._currentResolve(false);
            this.hide();
        }
    };

    // Inicializa o sistema de modal
    ModalSystem.init();

    // Expõe o ModalSystem globalmente para ser usado em qualquer script
    // (Ou em testes no console)
    window.ModalSystem = ModalSystem;

    /**
     * ================================================================
     * Intercepta os formulários de eliminação (DELETE)
     * ================================================================
     */
    const deleteForms = document.querySelectorAll('.delete-form');
    
    deleteForms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            // 1. Previne o envio imediato
            e.preventDefault(); 
            
            const username = form.dataset.username || 'este item';
            
            try {
                // 2. Chama a modal de confirmação
                await ModalSystem.confirm(
                    'Confirmar Eliminação',
                    `<p>Tem a certeza que quer eliminar permanentemente o utilizador <strong>${username}</strong>?</p><p>Esta ação não pode ser desfeita.</p>`,
                    {
                        confirmText: 'Sim, Eliminar',
                        confirmClass: 'btn-danger' // Botão vermelho
                    }
                );
                
                // 3. Se a Promise resolver (utilizador confirmou), envia o formulário
                form.submit();

            } catch (error) {
                // 4. Se a Promise rejeitar (utilizador cancelou), não faz nada
                // O 'catch' é necessário para evitar erro de "Promise uncaught"
            }
        });
    });

    const feedbackEl = document.getElementById('page-feedback');
    
    if (feedbackEl) {
        // Lê os dados que o Handlebars escreveu no HTML
        const { type, title, message } = feedbackEl.dataset;

        if (message) {
            // Atrasamos 50ms para garantir que a página está pronta
            setTimeout(() => {
                if (type === 'error') {
                    // Chama a sua modal de alerta!
                    ModalSystem.alert(title || 'Erro', message);
                } else if (type === 'success') {
                    // Chama a sua modal de alerta!
                    ModalSystem.alert(title || 'Sucesso', message);
                }
            }, 50);
        }
    }

    /**
     * ================================================================
     * Dashboard de Pedidos - Atualização Dinâmica
     * ================================================================
     */
    const statusCardsContainer = document.querySelector('[data-order-status-cards]');
    const orderCardsContainer = document.querySelector('[data-order-cards]');
    const statusLabelEl = document.querySelector('[data-selected-status-label]');
    const orderCountEl = document.querySelector('[data-order-count]');
    const statusButtons = document.querySelectorAll('[data-status]');
    const statusCardElements = document.querySelectorAll('[data-status-card]');

    if (statusCardsContainer && orderCardsContainer) {
        const summaryEndpoint = '/pedidos/api/status-summary';
        const ordersEndpoint = (bucket) => `/pedidos/api/status/${bucket}`;
        const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const dateFormatter = new Intl.DateTimeFormat('pt-BR');

        const statusLabelMap = {};
        statusButtons.forEach((button) => {
            statusLabelMap[button.dataset.status] = button.textContent.trim();
        });

        let activeBucket = document.querySelector('.order-status-button.active')?.dataset.status
            || statusCardElements?.[0]?.dataset.statusCard
            || 'pendente';

        const setActiveBucket = (bucket) => {
            activeBucket = bucket;

            statusButtons.forEach((button) => {
                button.classList.toggle('active', button.dataset.status === bucket);
            });

            statusCardElements.forEach((card) => {
                card.classList.toggle('is-active', card.dataset.statusCard === bucket);
            });

            if (statusLabelEl) {
                statusLabelEl.textContent = statusLabelMap[bucket] || 'Pedidos';
            }
        };

        const updateSummaryCards = (cards = []) => {
            cards.forEach((card) => {
                const cardElement = statusCardsContainer.querySelector(`[data-status-card="${card.id}"]`);
                if (cardElement) {
                    const totalEl = cardElement.querySelector('[data-status-total]');
                    if (totalEl) {
                        totalEl.textContent = card.total;
                    }
                }

                const buttonElement = document.querySelector(`.order-status-button[data-status="${card.id}"]`);
                if (buttonElement) {
                    statusLabelMap[card.id] = card.label;
                    buttonElement.textContent = card.label;
                }
            });
        };

        const createDetailLine = (label, value) => {
            const paragraph = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = `${label}:`;
            paragraph.appendChild(strong);
            paragraph.appendChild(document.createTextNode(` ${value ?? '-'}`));
            return paragraph;
        };

        const renderOrders = (bucket, orders = []) => {
            orderCardsContainer.innerHTML = '';

            if (orderCountEl) {
                const count = orders.length || 0;
                orderCountEl.textContent = count === 1 ? '1 pedido' : `${count} pedidos`;
            }

            if (!orders.length) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'muted';
                emptyMsg.textContent = 'Nenhum pedido encontrado para este status.';
                orderCardsContainer.appendChild(emptyMsg);
                return;
            }

            orders.forEach((order) => {
                const card = document.createElement('article');
                card.className = 'card order-card';

                const header = document.createElement('div');
                header.style = 'flex-direction: column;'
                header.className = 'card-header';

                const title = document.createElement('h3');
                title.textContent = `${order.numero_venda}`;
                header.appendChild(title);

                const chip = document.createElement('span');
                chip.className = 'order-chip';
                const orderStatusKey = order.bucket || order.status_bucket;
                chip.textContent = statusLabelMap[orderStatusKey] || statusLabelMap[bucket] || 'Status';
                header.appendChild(chip);

                card.appendChild(header);

                const body = document.createElement('div');
                body.className = 'card-body';

                body.appendChild(createDetailLine('Comprador', order.comprador || '-'));
                body.appendChild(createDetailLine('Título', order.titulo_anuncio || '-'));
                body.appendChild(createDetailLine('Unidades', order.unidades ?? '-'));
                const formattedTotal = currencyFormatter.format(Number(order.total) || 0);
                body.appendChild(createDetailLine('Total', formattedTotal));

                card.appendChild(body);

                const footer = document.createElement('footer');
                footer.className = 'card-footer';

                const date = document.createElement('span');
                let formattedDate = '-';
                if (order.data_venda) {
                    const dateValue = new Date(order.data_venda);
                    if (!Number.isNaN(dateValue.getTime())) {
                        formattedDate = dateFormatter.format(dateValue);
                    }
                }
                const dateLabel = document.createElement('strong');
                dateLabel.textContent = 'Data:';
                date.appendChild(dateLabel);
                date.appendChild(document.createTextNode(` ${formattedDate}`));
                footer.appendChild(date);

                const platform = document.createElement('span');
                const platformLabel = order.plataforma_label || order.plataforma || '—';
                const platformStrong = document.createElement('strong');
                platformStrong.textContent = 'Plataforma:';
                platform.appendChild(platformStrong);
                platform.appendChild(document.createTextNode(` ${platformLabel}`));
                footer.appendChild(platform);

                card.appendChild(footer);

                orderCardsContainer.appendChild(card);
            });
        };

        const loadOrders = async (bucket) => {
            try {
                const response = await fetch(ordersEndpoint(bucket));
                if (!response.ok) {
                    throw new Error('Falha ao carregar pedidos.');
                }

                const { orders = [] } = await response.json();
                renderOrders(bucket, orders);
            } catch (error) {
                console.error('[Pedidos] Erro ao carregar pedidos:', error);
                if (orderCardsContainer) {
                    orderCardsContainer.innerHTML = '';
                    const errorMsg = document.createElement('p');
                    errorMsg.className = 'muted';
                    errorMsg.textContent = 'Não foi possível carregar os pedidos.';
                    orderCardsContainer.appendChild(errorMsg);
                }
            }
        };

        const loadSummary = async () => {
            try {
                const response = await fetch(summaryEndpoint);
                if (!response.ok) {
                    throw new Error('Falha ao carregar resumo de pedidos.');
                }

                const { cards = [] } = await response.json();
                updateSummaryCards(cards);
            } catch (error) {
                console.warn('[Pedidos] Não foi possível atualizar o resumo:', error);
            }
        };

        statusButtons.forEach((button) => {
            button.addEventListener('click', async () => {
                const bucket = button.dataset.status;
                if (!bucket || bucket === activeBucket) {
                    return;
                }

                setActiveBucket(bucket);
                await loadOrders(bucket);
            });
        });

        setActiveBucket(activeBucket);
        loadOrders(activeBucket);
        loadSummary();

        // Atualiza o resumo a cada 30 segundos
        setInterval(loadSummary, 30000);
    }
});