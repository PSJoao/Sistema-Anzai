// services/PackingService.js
// Regras de negócio para empacotamento de pedidos (Fluxo Invertido: Produto -> Pedido)

const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const OrderItem = require('../models/OrderItem');
const PackingLock = require('../models/PackingLock');
const Product = require('../models/Product');
const CitelGateway = require('./CitelGateway'); // Necessário para a validação em tempo real
const db = require('../config/database');

// Função auxiliar para normalizar SKUs/Códigos
function normalizeSku(sku) {
  if (!sku || typeof sku !== 'string') return null;
  // Remove zeros à esquerda, espaços e deixa maiúsculo
  return sku.trim().replace(/^0+/, '').toUpperCase();
}

const PackingService = {

  // Mantido para estatísticas do dashboard, se necessário
  async getPackingQueue() {
    const rawSummary = await MercadoLivreOrder.getPackingQueueSummary();
    const stats = { simple: 0, kit: 0 };
    rawSummary.forEach(row => {
      if (row.order_type === 'simple') stats.simple = Number(row.total_orders);
      else if (row.order_type === 'kit') stats.kit = Number(row.total_orders);
    });
    return stats;
  },

  /**
   * Retorna a lista detalhada de pedidos prontos para a sidebar de empacotamento.
   * Já calcula a urgência (atrasado/hoje) para o frontend pintar as cores.
   */
  async getQueueList(plataforma = 'mercado_livre') {
    const orders = await MercadoLivreOrder.getOrdersReadyToPack(plataforma);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera hora para comparar apenas datas

    return orders.map(o => {
      let urgency = 'future'; // Padrão

      if (o.data_envio_limite) {
        const limit = new Date(o.data_envio_limite);
        limit.setHours(0, 0, 0, 0);
        
        if (limit < today) {
          urgency = 'delayed'; // Vermelho (Atrasado)
        } else if (limit.getTime() === today.getTime()) {
          urgency = 'today';   // Amarelo (Para Hoje)
        }
      }

      const result = {
        ...o,
        urgency
      };

      return result;
    });
  },

  /**
   * Retorna a sessão atual do usuário, se houver.
   */
  async getCurrentAssignment(userId) {
    const lock = await PackingLock.findByUser(userId);
    if (!lock) return null;
    
    const [orderHeader, items] = await Promise.all([
      MercadoLivreOrder.findByNumeroVendas(lock.numero_venda),
      OrderItem.findAllByNumeroVenda(lock.numero_venda)
    ]);

    return { lock, order: orderHeader, items };
  },

  /**
   * PONTO DE ENTRADA PRINCIPAL: Processa o bip do usuário.
   * - Se usuário LIVRE: Busca pedido que precise do produto, VALIDA NA API, trava e bipa 1 unidade.
   * - Se usuário OCUPADO: Bipa o item dentro do pedido atual.
   */
  async processScan({ userId, sku, isAdmin, plataforma = 'mercado_livre' }) {
    const normalizedCode = normalizeSku(sku);
    if (!normalizedCode) throw new Error('Código inválido.');

    // 1. Verifica se o usuário já tem uma sessão ativa
    const currentLock = await PackingLock.findByUser(userId);

    if (currentLock) {
      // CENÁRIO A: Usuário já está num pedido -> Bipar item normal
      return this._packItemForExistingLock(userId, currentLock, normalizedCode, isAdmin);
    } else {
      // CENÁRIO B: Usuário livre -> Encontrar pedido compatível
      return this._findAndLockOrder(userId, normalizedCode, isAdmin, plataforma);
    }
  },

  /**
   * Lógica interna para encontrar, validar e travar um pedido a partir de um produto.
   */
  async _findAndLockOrder(userId, normalizedSku, isAdmin, plataforma) {
    // 1. Identificar o produto no banco
    let product = await Product.findByBarcode(normalizedSku);

    if (!product && isAdmin) {
        product = await Product.findByCodigo(normalizedSku);
    }
    
    if (!product) {
      const skuWithZero = '0' + normalizedSku;
      product = await Product.findByBarcode(skuWithZero);
      
      // REGRA: Zero à esquerda no código interno apenas se for Admin
      if (!product && isAdmin) {
         product = await Product.findByCodigo(skuWithZero);
      }
    }

    if (!product) {
      throw new Error(`Produto não encontrado com o código "${normalizedSku}".`);
    }

    // 2. Loop de busca e validação (API)
    let validOrder = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    
    // Variável para guardar o número de um pedido cancelado encontrado durante a busca
    // Isso serve para dar um feedback mais preciso ao usuário
    let cancelledOrderDetected = null;

    while (!validOrder && attempts < MAX_ATTEMPTS) {
      attempts++;

      const candidate = await MercadoLivreOrder.findBestOrderForPacking(product.codigo, plataforma);

      if (!candidate) {
        // Se na primeira tentativa não achou nada, e também não detectamos nenhum cancelamento anterior
        if (attempts === 1 && !cancelledOrderDetected) {
            throw new Error('Nenhum pedido pendente necessita deste produto no momento.');
        }
        break; // Sai do loop se não houver mais candidatos
      }

      try {
        let numeroBuscaCitel = candidate.numero_venda;
        
        const apiResponse = await CitelGateway.getPedidoPorNumero(numeroBuscaCitel);
        
        // --- NOVA VALIDAÇÃO DE CANCELAMENTO ---
        // Normaliza o objeto (pode vir direto ou dentro de .pedido)
        const p = apiResponse ? (apiResponse.pedido || apiResponse) : {};

        // 1. Flag explícita
        const explicitCancel = (apiResponse && apiResponse.cancelado) || p.cancelado === true;

        // 2. Regra de Datas Nulas (Cancelamento implícito do ML)
        // Se não tem limite de envio nem coleta agendada, o pedido não é válido para envio.
        const dateCancel = (!p.dataEnvioLimite && !p.dataColetaAgendada);

        if (explicitCancel /*|| dateCancel*/) {
          console.log(`[PackingService] Pedido ${candidate.numero_venda} detectado como CANCELADO (API) durante scan.`);
          
          // Atualiza status no banco para retirá-lo da fila imediatamente
          await MercadoLivreOrder.updateStatusByNumeroVenda(candidate.numero_venda, 'cancelado');
          
          // Guarda esse número para usar na mensagem de erro se não acharmos outro pedido
          cancelledOrderDetected = candidate.numero_venda;
          
          // Pula para a próxima iteração para tentar achar OUTRO pedido que precise desse produto
          continue; 
        }
        // --------------------------------------

      } catch (err) {
        console.warn(`[PackingService] Erro validação API ${candidate.numero_venda}:`, err.message);
        // Se der erro de conexão, assumimos que o pedido é válido para não travar a operação
      }

      validOrder = candidate;
    }

    if (!validOrder) {
      // AQUI ESTÁ A MENSAGEM PARA O SEU MODAL
      if (cancelledOrderDetected) {
          throw new Error(`ATENÇÃO: O pedido ${cancelledOrderDetected} acabou de ser identificado como CANCELADO na plataforma! Separe este item.`);
      }
      
      throw new Error('Não foi possível encontrar um pedido válido (cancelados ou indisponíveis).');
    }

    // 3. Preparar a trava (Código Original Mantido)
    const { numero_venda } = validOrder; 
    const [orderHeader, items] = await Promise.all([
      MercadoLivreOrder.findByNumeroVendas(numero_venda),
      OrderItem.findAllByNumeroVenda(numero_venda)
    ]);

    const progressData = {};
    let initialScanRegistered = false;

    items.forEach(item => {
      progressData[item.produto_codigo] = {
        needed: item.quantidade_total,
        scanned: 0,
        sku: item.sku,
        cod_fabrica: item.cod_fabrica,
        cod_barras: item.cod_barras,
        descricao: item.descricao_produto
      };

      if (!initialScanRegistered && item.produto_codigo === product.codigo) {
        if (progressData[item.produto_codigo].scanned < progressData[item.produto_codigo].needed) {
          progressData[item.produto_codigo].scanned = 1;
          initialScanRegistered = true;
        }
      }
    });

    const lock = await PackingLock.acquire({
      numeroVenda: numero_venda, 
      userId,
      progressData: JSON.stringify(progressData),
    });

    if (!lock) {
      throw new Error('Erro de concorrência (Lock). Tente novamente.');
    }

    const isComplete = this._checkIfComplete(progressData);
    
    let labelData = null;
    if (isComplete) {
        await MercadoLivreOrder.updateStatusByNumeroVenda(numero_venda, 'em_romaneio');
        await PackingLock.releaseByUser(userId);

        const { rows } = await db.query(
            'SELECT plataforma, zpl_content, pdf_file_name FROM shipping_labels WHERE order_number = $1',
            [numero_venda]
        );
        if (rows.length > 0) {
            labelData = rows[0];
        }
    }

    return { 
      lock, 
      order: orderHeader, 
      items,
      isNewSession: true,
      finished: isComplete,
      numero_venda: numero_venda,
      labelData 
    };
  },

  /**
   * Lógica interna para bipar item numa sessão já existente.
   */
  async _packItemForExistingLock(userId, lock, normalizedSku, isAdmin) {
    const progress = lock.progress;
    let foundCode = null;

    // Procura qual produto do pedido bate com o código bipado
    for (const codigo in progress) {
      const item = progress[codigo];
      
      // 1. Verifica Barras (Liberado para todos)
      const matchBarcode = normalizeSku(item.cod_barras) === normalizedSku;

      // 2. Verifica SKU/Fabrica (Apenas Admin)
      const matchSku = isAdmin && (
          normalizeSku(item.sku) === normalizedSku || 
          normalizeSku(item.cod_fabrica) === normalizedSku
      );

      if (matchBarcode || matchSku) {
        foundCode = codigo;
        break;
      }
    }

    if (!foundCode) {
        const skuWithZero = '0' + normalizedSku;
        
        for (const codigo in progress) {
            const item = progress[codigo];
            
            const rawMatchBarcode = (item.cod_barras === skuWithZero);
            
            const rawMatchSku = isAdmin && (
                (item.sku === skuWithZero) || 
                (item.cod_fabrica === skuWithZero)
            );
            
            if (rawMatchBarcode || rawMatchSku) {
                foundCode = codigo;
                break;
            }
        }
    }

    if (!foundCode) {
      throw new Error(`Este produto não pertence ao pedido atual (${lock.numero_venda}).`);
    }

    const itemProgress = progress[foundCode];
    if (itemProgress.scanned >= itemProgress.needed) {
      throw new Error(`Você já bipou todas as ${itemProgress.needed} unidades de ${itemProgress.descricao || 'produto'}.`);
    }

    // Incrementa
    itemProgress.scanned += 1;

    // Atualiza trava
    const updatedLock = await PackingLock.updateProgress(lock.numero_venda, JSON.stringify(progress));
    
    // Checa finalização
    const isComplete = this._checkIfComplete(progress);

    let labelData = null;

    if (isComplete) {
      // Finaliza o pedido no banco
      await MercadoLivreOrder.updateStatusByNumeroVenda(lock.numero_venda, 'em_romaneio');
      await PackingLock.releaseByUser(userId);
      console.log(`[PackingService] Pedido ${lock.numero_venda} finalizado por ${userId}.`);

      // Busca qual é o formato da etiqueta e o arquivo gerado
      const { rows } = await db.query(
          'SELECT plataforma, zpl_content, pdf_file_name FROM shipping_labels WHERE order_number = $1',
          [lock.numero_venda]
      );
      if (rows.length > 0) {
          labelData = rows[0];
      }

    }

    return {
      finished: isComplete,
      progress: updatedLock.progress,
      numero_venda: lock.numero_venda,
      labelData
    };
  },

  /**
   * Auxiliar para checar se todo o progresso está 100%
   */
  _checkIfComplete(progress) {
    for (const codigo in progress) {
      if (progress[codigo].scanned < progress[codigo].needed) {
        return false;
      }
    }
    return true;
  },

  /**
   * Cancela a sessão atual (Botão Cancelar).
   * Destrava o pedido sem finalizá-lo, permitindo que volte para a fila.
   */
  async cancelCurrentSession(userId) {
    const lock = await PackingLock.findByUser(userId);
    if (!lock) return { success: false, message: 'Nenhuma sessão ativa.' };

    await PackingLock.releaseByUser(userId);
    console.log(`[PackingService] Sessão do pedido ${lock.numero_venda} cancelada pelo usuário ${userId}. Pedido devolvido à fila.`);
    
    return { success: true };
  }
};

module.exports = PackingService;