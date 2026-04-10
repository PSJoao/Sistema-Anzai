// services/CitelDbGateway.js
// Gateway responsável por conectar diretamente ao Banco de Dados MySQL do ERP (Citel).
// Utilizado para obter a lista base de produtos (SKUs) via View.

const mysql = require('mysql2/promise');
const db = require('../config/database');

const DB_CONFIG = {
    host: '10.64.0.250',
    port: 47658,
    user: 'casa_anzai',
    password: 'i<5C9B5(v45M',
    database: 'AUTCOM', 
    connectTimeout: 20000 // 20 segundos de timeout
};

const CitelDbGateway = {

    /**
     * Busca TODOS os códigos de produtos disponíveis na View VW_CAD_PRODUTO.
     * @returns {Promise<string[]>} Array com os códigos (SKUs) dos produtos.
     */
    async getAllProductCodes() {
        let connection;
        try {
            console.log('[CitelDbGateway] Conectando ao MySQL do ERP...');
            connection = await mysql.createConnection(DB_CONFIG);

           try {
                console.log('[CitelDbGateway] Buscando dados da VW_ESTRUTURA...');
                const [estruturaRows] = await connection.query(`SELECT * FROM VW_ESTRUTURA`);
                
                console.log(`[CitelDbGateway] VW_ESTRUTURA - Total carregado do ERP: ${estruturaRows.length}`);

                if (estruturaRows.length > 0) {
                    console.log('[CitelDbGateway] Iniciando gravação no PostgreSQL...');

                    // 1. Limpa a tabela antiga para evitar duplicidade (Sincronização total)
                    await db.query('TRUNCATE TABLE produtos_estrutura RESTART IDENTITY');
                    
                    // 2. Função auxiliar para gerar os placeholders ($1, $2, etc)
                    // Isso é necessário para inserção em massa segura
                    const insertQueryBase = `
                        INSERT INTO produtos_estrutura 
                        (item_principal, descri_principal, ref_principal, subitem, descri_subitem, ref_subitem, qtd_subitem)
                        VALUES 
                    `;

                    // Tamanho do lote (Batch Size). 2000 costuma ser seguro para o driver do PG.
                    const CHUNK_SIZE = 2000;
                    
                    for (let i = 0; i < estruturaRows.length; i += CHUNK_SIZE) {
                        const chunk = estruturaRows.slice(i, i + CHUNK_SIZE);
                        
                        const values = [];
                        const placeholders = [];
                        let paramCount = 1;

                        chunk.forEach(row => {
                            // Monta ($1, $2, $3, $4, $5, $6, $7)
                            placeholders.push(`($${paramCount}, $${paramCount+1}, $${paramCount+2}, $${paramCount+3}, $${paramCount+4}, $${paramCount+5}, $${paramCount+6})`);
                            
                            // Adiciona os valores no array flat
                            values.push(
                                row.ITEM_PRINCIPAL,
                                row.DESCRI_PRINCIPAL,
                                row.REF_PRINCIPAL,
                                row.SUBITEM,
                                row.DESCRI_SUBITEM,
                                row.REF_SUBITEM,
                                row.QTD_SUBITEM
                            );
                            
                            paramCount += 7; // Pula 7 parâmetros por linha
                        });

                        const finalQuery = insertQueryBase + placeholders.join(', ');
                        
                        // Executa o insert do lote
                        await db.query(finalQuery, values);
                        console.log(`[CitelDbGateway] Lote processado: ${Math.min(i + CHUNK_SIZE, estruturaRows.length)} / ${estruturaRows.length}`);
                    }
                    console.log('[CitelDbGateway] Sincronização da VW_ESTRUTURA concluída com sucesso!');
                }

            } catch (errEstrutura) {
                console.error('[CitelDbGateway] ERRO CRÍTICO ao salvar VW_ESTRUTURA no Postgres:', errEstrutura);
                // Não damos throw aqui para não impedir o sistema de rodar a parte de produtos abaixo,
                // mas fica o log do erro.
            }

            console.log('[CitelDbGateway] Buscando produtos na view VW_CAD_PRODUTO...');
            
            const [rows] = await connection.query(`SELECT CODIGO, PRECO_CUSTO, PRECO_CUSTO_REAL FROM VW_CAD_PRODUTO WHERE ATIVO = 'S'`);

            console.log(`[CitelDbGateway] Encontrados ${rows.length} produtos na View.`);
            
            // Retorna um array de objetos contendo o código e os preços
            return rows.map(row => ({
                codigo: String(row.CODIGO),
                preco_custo: row.PRECO_CUSTO,
                preco_custo_real: row.PRECO_CUSTO_REAL
            }));

        } catch (error) {
            console.error('[CitelDbGateway] Erro ao buscar códigos no MySQL:', error.message);
            throw error;
        } finally {
            if (connection) {
                await connection.end();
            }
        }
    }
};

module.exports = CitelDbGateway;