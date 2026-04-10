// sync-products.js
// Importa a planilha de produtos para a base de dados

require('dotenv').config();

const ProductService = require('./services/ProductService');

(async () => {
  try {
    console.log('[SyncProdutos] Iniciando importação...');
    const result = await ProductService.importFromSpreadsheet();
    console.log('[SyncProdutos] Ficheiro:', result.filePath);
    console.log('[SyncProdutos] Registos processados:', result.total);
    console.log('[SyncProdutos] Inseridos:', result.inserted);
    console.log('[SyncProdutos] Atualizados:', result.updated);
    console.log('[SyncProdutos] Concluído.');
    process.exit(0);
  } catch (error) {
    console.error('[SyncProdutos] Falha ao importar produtos:', error.message);
    process.exit(1);
  }
})();

