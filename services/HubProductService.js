// services/HubProductService.js
// Responsável pela sincronização de PRODUTOS usando estratégia Híbrida:
// 1. Lista códigos via MySQL (View)
// 2. Detalha produtos via API (Endpoint por código)

const CitelGateway = require('./CitelGateway');
const CitelDbGateway = require('./CitelDbGateway');
const Product = require('../models/Product');
const dbProd = require('../config/dbProduto');

const HubProductService = {

    /**
     * Executa a sincronização completa de produtos.
     * Estratégia: MySQL (Lista) -> API (Detalhe) -> Postgres (Salvar)
     */
    async syncAllProducts() {
        console.log(`[HubProduct] Iniciando sincronização HÍBRIDA de produtos...`);
        const startTime = Date.now();
        
        // 1. Carrega departamentos válidos para validação
        const validDepartments = await Product.getValidDepartmentCodes();
        console.log(`[HubProduct] Departamentos válidos carregados: ${validDepartments.size}`);

        try {
            // 2. Busca TODOS os códigos no MySQL
            const itensBase = await CitelDbGateway.getAllProductCodes();
            const total = itensBase.length;
            console.log(`[HubProduct] Total de SKUs para processar: ${total}`);
            console.log(itensBase);
            if (total === 0) {
                console.log('[HubProduct] Nenhum produto encontrado na View. Encerrando.');
                return { success: true, total: 0 };
            }

            // Variáveis de controle
            let processados = 0;
            let erros = 0;
            let bufferProdutos = [];
            const BATCH_SIZE = 50; // Salva no banco a cada 50 produtos

            // 3. Loop um a um (Conforme solicitado)
            for (const item of itensBase) {
                try {
                    // Consulta API individualmente
                    const dadosProduto = await CitelGateway.getProdutoPorCodigo(item.codigo);

                    await dbProd.query(`
                        INSERT INTO produto_custos (sku, preco_custo, preco_custo_real)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (sku) 
                        DO UPDATE SET 
                            preco_custo = EXCLUDED.preco_custo,
                            preco_custo_real = EXCLUDED.preco_custo_real
                        `, [item.codigo, item.preco_custo, item.preco_custo_real]);
                    
                    if (dadosProduto) {
                        // Mapeia e Valida
                        const produtoMapeado = this.mapProductData(dadosProduto, validDepartments, item.preco_custo, item.preco_custo_real);
                        
                        if (produtoMapeado) {
                            bufferProdutos.push(produtoMapeado);
                        }
                    }

                    // Se o buffer encheu, salva no banco
                    if (bufferProdutos.length >= BATCH_SIZE) {
                        await Product.bulkUpsert(bufferProdutos);
                        processados += bufferProdutos.length;
                        bufferProdutos = []; // Limpa buffer
                        
                        // Log de progresso a cada 500 itens
                        if (processados % 500 === 0) {
                            const percent = ((processados / total) * 100).toFixed(1);
                            console.log(`[HubProduct] Progresso: ${processados}/${total} (${percent}%)`);
                        }
                    }

                } catch (err) {
                    console.error(`[HubProduct] Erro ao processar SKU ${item.codigo}: ${err.message}`);
                    erros++;
                    // Continua para o próximo produto mesmo com erro
                }
            }

            // 4. Salva o restante do buffer (se sobrou algo)
            if (bufferProdutos.length > 0) {
                await Product.bulkUpsert(bufferProdutos);
                processados += bufferProdutos.length;
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[HubProduct] Sincronização finalizada em ${duration}s.`);
            console.log(`[HubProduct] Processados: ${processados} | Erros: ${erros}`);

            return { success: true, total: processados, time: duration };

        } catch (error) {
            console.error('[HubProduct] Erro fatal na sincronização:', error);
            throw error;
        }
    },

    /**
     * Converte o JSON da API para o formato da tabela 'products'.
     * @param {Object} data - Objeto produto cru da API
     * @param {Set} validDepartments - Set de códigos de departamentos válidos
     */
    mapProductData(data, validDepartments, precoCusto, precoCustoReal) {
        if (!data.codigoProduto) return null;
        const codigoInt = parseInt(data.codigoProduto, 10);
        if (isNaN(codigoInt)) return null;

        // --- LÓGICA DE VALIDAÇÃO DE DEPARTAMENTO ---
        let deptoCod = data.departamento ? parseInt(data.departamento.codigo, 10) : null;
        
        if (deptoCod !== null && validDepartments && !validDepartments.has(deptoCod)) {
            deptoCod = null; // Departamento inválido vira NULL
        }

        // Mapeamento dos outros códigos
        const grupoCod = data.grupo ? parseInt(data.grupo.codigo, 10) : null;
        const marcaCod = data.marca ? parseInt(data.marca.codigo, 10) : null;
        const fornecedorCod = data.fornecedor ? parseInt(data.fornecedor.codigo, 10) : null;

        // Extração das descrições
        const grupoDesc = data.grupo ? data.grupo.descricao : null;
        const deptoDesc = data.departamento ? data.departamento.descricao : null;
        const marcaDesc = data.marca ? data.marca.descricao : null;
        const fornecedorDesc = data.fornecedor ? data.fornecedor.nomeFornecedor : null;

        const ativo = data.ativo === true;

        return {
            codigo: codigoInt,
            descricao: data.nome || data.descricaoCadastro || 'SEM DESCRIÇÃO',
            preco_custo: precoCusto,
            preco_custo_real: precoCustoReal,
            referencia: data.referencia,
            unidade: data.unidade || data.siglaUnidade,
            
            // Códigos Formatados e Validados
            cod_departamento: deptoCod,
            cod_grupo: isNaN(grupoCod) ? null : grupoCod,
            cod_marca: isNaN(marcaCod) ? null : marcaCod,
            cod_fornecedor: isNaN(fornecedorCod) ? null : fornecedorCod,
            cod_fabrica: data.codigoFabrica || null,

            // Novos Dados
            cod_barras: data.codigoBarra, 
            peso: data.pesoBruto,         

            // Descrições
            grupo: grupoDesc,
            departamento: deptoDesc,
            marca: marcaDesc,
            fornecedor: fornecedorDesc,
            
            item_ativo: ativo,
            ativo: ativo,
            
            classificacao_ipi: data.classificacaoIPI,
            cest: data.classificacaoCest,
            
            updated_at: new Date()
        };
    }
};

module.exports = HubProductService;