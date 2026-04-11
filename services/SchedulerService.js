// services/SchedulerService.js
// Gerenciador de Rotinas Automáticas (Cron Jobs) do Hub de Integração.
// Responsável por disparar as atualizações de Pedidos e Produtos nos intervalos definidos.

const cron = require('node-cron');
const HubProductService = require('./HubProductService');
const HubOrderService = require('./HubOrderService');
let trava = false;
let travaPedidos = false;

const SchedulerService = {
    
    /**
     * Inicializa todos os agendamentos do sistema.
     */
    start() {
        console.log('[Scheduler] Inicializando rotinas de automação do Hub Citel...');

        // ==============================================================================
        // ROTINA 1: Sincronização de PEDIDOS (Mercado Livre)
        // Frequência: A cada 50 minutos
        // Expressão Cron: "*/1 * * * *"
        // ==============================================================================
        cron.schedule('*/50 * * * *', async () => {
            // 1. Verifica se já está rodando
            if (travaPedidos) {
                console.log('[Scheduler] Sincronização de PEDIDOS abortada: Rotina anterior ainda em execução.');
                return;
            }

            // 2. Bloqueia a execução
            travaPedidos = true;

            console.log(`[Scheduler] Iniciando rotina automática de PEDIDOS (${new Date().toLocaleTimeString()})...`);
            
            try {
                // O HubOrderService já possui a lógica de pegar D-1 (Ontem) até Agora.
                const resultado = await HubOrderService.syncOrders();
                console.log(`[Scheduler] Rotina de PEDIDOS finalizada. Importados: ${resultado.imported}.`);
            } catch (error) {
                console.error('[Scheduler] Erro crítico na rotina de PEDIDOS:', error.message);
            } finally {
                // 3. Libera a execução (Sempre executa, dando erro ou sucesso)
                travaPedidos = false;
            }
        });

        // ==============================================================================
        // ROTINA 2: Sincronização de PRODUTOS
        // Frequência: Todos os dias às 4 horas
        // Expressão Cron: "0 */2 * * *"
        // ==============================================================================
        cron.schedule('0 */2 * * *', async () => {
            console.log(`[Scheduler] Iniciando rotina automática de PRODUTOS (${new Date().toLocaleTimeString()})...`);
            try {
                // Atualiza o cadastro completo (preços, estoque, códigos de barras)
                const resultado = await HubProductService.syncAllProducts();
                console.log(`[Scheduler] Rotina de PRODUTOS finalizada. Total: ${resultado.total}.`);
            } catch (error) {
                console.error('[Scheduler] Erro crítico na rotina de PRODUTOS:', error.message);
            }
        });

        //cron.schedule('0 * * * *', async () => {
        /*    await HubOrderService.processAutomaticStatusUpdates();
        });*/

        console.log('[Scheduler] Agendamentos configurados: Pedidos (5min) | Produtos (1h).');
    }
};

module.exports = SchedulerService;