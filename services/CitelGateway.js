// services/CitelGateway.js
// Central de comunicação com a API do ERP Citel.
// Responsável por padronizar requisições e tratar erros de conexão.

const axios = require('axios');

// Configuração base da API com Autenticação Basic
const API_CONFIG = {
    baseURL: 'http://10.64.0.250:8181', // IP fixo conforme documentação
    timeout: 1000000, // Timeout alto para evitar travamentos em cargas grandes
    
    // Autenticação Basic (Usuário e Senha)
    auth: {
        username: 'TESTE',
        password: '123'
    },

    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
};

// Criação da instância do Axios
const apiClient = axios.create(API_CONFIG);

const CitelGateway = {

    /**
     * Busca uma página de produtos do ERP.
     * Endpoint: /produtoCadastro
     * @param {number} pagina - Número da página (começa em 0)
     * @param {number} quantidade - Registros por página
     * @returns {Promise<Array>} - Retorna o array de produtos.
     */
    async getProdutos(pagina = 0, quantidade = 10000) {
        try {
            const response = await apiClient.get('/produtoCadastro', {
                params: {
                    numeroPagina: pagina,
                    quantidadeRegistro: quantidade
                }
            });
            return response.data; 
        } catch (error) {
            console.error(`[CitelGateway] Erro ao buscar produtos (Pág: ${pagina}):`, error.message);
            throw error;
        }
    },

    /**
     * Busca o XML da Nota Fiscal Eletrônica.
     * Endpoint: /xmlnfe/{chaveAcesso}
     * @param {string} chaveAcesso - Chave de 44 dígitos
     * @returns {Promise<string>} - String contendo o XML
     */
    async getXmlNfe(chaveAcesso) {
        try {
            // A API espera a chave na URL
            // CORREÇÃO 406: Sobrescrevemos o header Accept para aceitar XML explicitamente
            const response = await apiClient.get(`/xmlnfe/${chaveAcesso}`, {
                headers: {
                    'Accept': 'application/xml, text/xml, */*'
                }
            });
            
            // Retorna o dado (espera-se uma string XML)
            return response.data;
        } catch (error) {
            // Se for 404, apenas retorna null (nota não existe ainda)
            if (error.response && error.response.status === 404) {
                return null;
            }
            // Loga erro mas não trava a aplicação
            // console.error(`[CitelGateway] Erro ao buscar XML NFe ${chaveAcesso}:`, error.message);
            throw error;
        }
    },

    /**
     * Busca uma página de pedidos de venda (Método antigo/genérico).
     * Endpoint: /consultapedidovenda
     */
    async getPedidos(dataHora, page = 0, size = 500, codigoOrigem = '012') {
        try {
            const params = {
                'codigoOrigem': codigoOrigem,
                'data-hora': dataHora,
                'especieDocumento': 'PD',
                'ja-faturado': 'true',
                'page': page,
                'size': size
            };

            const response = await apiClient.get('/consultapedidovenda', { params });
            return response.data;
        } catch (error) {
            console.error(`[CitelGateway] Erro ao buscar lista de pedidos:`, error.message);
            throw error;
        }
    },

    /**
     * Busca um pedido específico pelo número (ID completo).
     * Endpoint: /consultapedidovenda/{numeroPedido}
     * @param {string} numeroPedido - Ex: "MLB_SHML46077316603"
     * @returns {Promise<Object>} - Objeto do pedido detalhado.
     */
    async getPedidoPorNumero(numeroPedido) {
        try {
            // A API espera o ID direto na URL
            // codificamos o componente URI apenas por segurança, caso haja caracteres especiais
            const encodedId = encodeURIComponent(numeroPedido);
            const response = await apiClient.get(`/consultapedidovenda/${encodedId}`);
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.warn(`[CitelGateway] Pedido ${numeroPedido} não encontrado no ERP.`);
                return null;
            }
            console.error(`[CitelGateway] Erro ao buscar pedido individual ${numeroPedido}:`, error.message);
            throw error;
        }
    },

    async getProdutoPorCodigo(codigo) {
        try {
            const response = await apiClient.get(`/produtoCadastroCodigo/${codigo}`);
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // console.warn(`[CitelGateway] Produto ${codigo} não encontrado na API.`);
                return null;
            }
            console.error(`[CitelGateway] Erro ao buscar produto ${codigo}:`, error.message);
            throw error;
        }
    },

    /**
     * Busca a imagem de um produto pelo código de imagem (autoincrem).
     * Endpoint: /produtoImagem/{codImagem}
     * @param {string} codImagem - Código autoincrem da imagem
     * @returns {Promise<{data: Buffer, contentType: string}|null>}
     */
    async getProdutoImagem(codImagem) {
        try {
            const response = await apiClient.get(`/produtoImagem/${codImagem}`, {
                responseType: 'arraybuffer',
                headers: {
                    'Accept': '*/*' // CORREÇÃO 406: Accept genérico para evitar rejeição do ERP
                }
            });

            return {
                data: response.data,
                contentType: response.headers['content-type'] || 'image/jpeg'
            };
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            console.error(`[CitelGateway] Erro ao buscar imagem ${codImagem}:`, error.message);
            return null; // Falha silenciosa para não travar o fluxo
        }
    }
};

module.exports = CitelGateway;