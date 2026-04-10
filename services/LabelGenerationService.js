// services/LabelGenerationService.js
// Gera etiquetas convertidas em Imagem (PNG) usando Puppeteer para rasterização

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const { PDFDocument: PDFLibDoc, StandardFonts, rgb } = require('pdf-lib');

const db = require('../config/database');
//const { width } = require('pdfkit/js/page');

// Conversão: 1 cm ~= 28.35 points (72 DPI standard do PDF)
const CM_TO_PT = 28.3465;

// Configurações de Dimensões (10cm x 15cm)
const LABEL_WIDTH = 10 * CM_TO_PT;  // ~283 pts
const LABEL_HEIGHT = 15 * CM_TO_PT; // ~425 pts

const LabelGenerationService = {

    /**
     * Gera uma Imagem (Base64) da etiqueta montada.
     * @param {string} numeroVenda 
     * @returns {Promise<string>} String base64 da imagem PNG
     */
    async generateLabelImageBase64(numeroVenda) {
        // 1. Busca dados do Pedido
        const orderData = await this._fetchOrderData(numeroVenda);
        if (!orderData) throw new Error('Pedido ou etiqueta não encontrados.');

        return new Promise(async (resolve, reject) => {
            try {
                // 2. Inicializa o PDFKit (Mesma lógica visual original)
                const doc = new PDFDocument({
                    size: [LABEL_WIDTH, LABEL_HEIGHT],
                    margin: 0,
                    info: { Title: `Etiqueta ${numeroVenda}` }
                });

                // Captura o buffer do PDF
                const buffers = [];
                doc.on('data', (chunk) => buffers.push(chunk));
                
                doc.on('end', async () => {
                    try {
                        const pdfBuffer = Buffer.concat(buffers);
                        
                        if (orderData.plataforma === 'shopee' && orderData.pdf_file_name) {
                            // Pega o template perfeito que o PDFKit acabou de gerar e 
                            // estampa a etiqueta vetorial da Shopee no espaço em branco!
                            const finalPdfBuffer = await this._mergeShopeePdfVector(pdfBuffer, orderData.pdf_file_name);
                            resolve({ type: 'pdf', data: finalPdfBuffer });
                        } else {
                            // Fluxo Normal (Mercado Livre): Converte para Imagem com Puppeteer
                            const imageBase64 = await this._convertPdfToImgWithPuppeteer(pdfBuffer);
                            resolve({ type: 'image', data: imageBase64 });
                        }

                    } catch (conversionErr) {
                        reject(conversionErr);
                    }
                });

                // CAMADA 2.5: LOGO
                const logoPath = path.join(__dirname, '../public/images/logo-anzai-desktop.png');
                if (fs.existsSync(logoPath)) {
                    doc.save();
                    
                    // X: Mesma linha da DANFE (borda direita)
                    const logoX = LABEL_WIDTH - (0.1 * CM_TO_PT);
                    
                    // Y: Começa em 11.5cm (A DANFE ocupa de 2.5cm até ~11cm)
                    const logoY = 10 * CM_TO_PT; 
                    
                    //doc.translate(logoX, logoY);
                    //doc.rotate(90); // Gira 90 graus horário
                    
                    // Desenha a imagem
                    // width: 2.5cm (agora na vertical). O PDFKit ajusta a altura proporcionalmente.
                    doc.image(logoPath, 2 * CM_TO_PT, 0.15 * CM_TO_PT, { width: 2.5 * CM_TO_PT });
                    
                    doc.restore();
                }

                if (orderData.mlb_anuncio) {
                    doc.font('Helvetica').fontSize(6.2).text(orderData.mlb_anuncio, 5 * CM_TO_PT, 0.25 * CM_TO_PT, {
                        width: 55, align: 'center'
                    });
                }

                if (orderData.total_itens) {
                    doc.font('Helvetica-Bold').fontSize(12) // Fonte grande e negrito
                       .text(`QTD: ${orderData.total_itens}`, 0, 0.5 * CM_TO_PT, {
                           width: LABEL_WIDTH - (0.5 * CM_TO_PT), // Vai até a margem direita
                           align: 'right' // Alinha à direita
                       });
                }

                // --- DESENHO DA ETIQUETA (Lógica Original Intacta) ---

                // CAMADA 1: LOGO
                /*const logoPath = path.join(__dirname, '../public/images/logo-resumo.png');
                if (fs.existsSync(logoPath)) {
                    doc.image(logoPath, 0.5 * CM_TO_PT, 0.5 * CM_TO_PT, { width: 2.5 * CM_TO_PT });
                } else {
                    doc.fontSize(10).text('CASA ANZAI', 0.5 * CM_TO_PT, 0.5 * CM_TO_PT);
                }*/

                // Definições de posição
                const textStartX = 0.5 * CM_TO_PT; 
                const textStartY = 0.8 * CM_TO_PT; 
                const textMaxWidth = (LABEL_WIDTH - textStartX) - (2.2 * CM_TO_PT); 

                const textMaxHeight = 1.8 * CM_TO_PT; 

                if (orderData.lista_produtos) {
                    doc.font('Helvetica-Bold').fontSize(6.2)
                       .text('Itens:', textStartX, textStartY);

                    doc.font('Helvetica').fontSize(6.2)
                       .text(orderData.lista_produtos, textStartX, doc.y, {
                           width: textMaxWidth,
                           height: textMaxHeight,   // Respeita a nova altura segura
                           ellipsis: true,          // Adiciona "..." se passar do limite
                           align: 'left',
                           lineGap: 1
                       });
                }

                // CAMADA 2: DANFE
                if (orderData.chave_acesso || orderData.mlb_anuncio) {
                    await this._drawSideBarCodes(doc, orderData.chave_acesso, orderData.mlb_anuncio);
                } else {
                    doc.save();
                    doc.rotate(90, { origin: [LABEL_WIDTH - 20, 100] });
                    doc.fontSize(8).text('SEM CHAVE DE ACESSO', LABEL_WIDTH - 20, 100);
                    doc.restore();
                }

                if (orderData.altura || orderData.peso) {

                    let volume = 0;

                    if (orderData.altura)
                    {
                        volume = parseFloat(orderData.altura) * parseFloat(orderData.largura) * parseFloat(orderData.comprimento);
                    }

                    const medidasTexto = `CAIXA: ${orderData.altura || '?'} x ${orderData.largura || '?'} x ${orderData.comprimento || '?'} cm - VOL: ${volume || '?'}cm³ |  PESO: ${orderData.peso || '?'}`;
                    
                    // Posiciona logo abaixo da área de itens (aprox 2.6 cm do topo)
                    const medidasY = 2.6 * CM_TO_PT; 
                    
                    doc.font('Helvetica-Bold').fontSize(5.8).fillColor('#000000')
                       .text(medidasTexto, 0.5 * CM_TO_PT, medidasY, {
                           width: LABEL_WIDTH - (1.5 * CM_TO_PT), // Respeita a margem lateral
                           align: 'left'
                       });
                }

                if (orderData.altura || orderData.peso || orderData.frete_envio) {

                    let volume = 0;

                    if (orderData.altura)
                    {
                        volume = parseFloat(orderData.altura) * parseFloat(orderData.largura) * parseFloat(orderData.comprimento);
                    }

                    let medidasTexto = null;

                    if (orderData.altura || orderData.peso && orderData.frete_envio) {
                        medidasTexto = `CAIXA: ${orderData.altura || '?'} x ${orderData.largura || '?'} x ${orderData.comprimento || '?'} cm - VOL: ${volume || '?'}cm³ |  PESO: ${orderData.peso || '?'} | FRETE: ${orderData.frete_envio || '?'}`;
                    } else if (!orderData.altura || !orderData.peso && orderData.frete_envio) {
                        medidasTexto = `FRETE: ${orderData.frete_envio || '?'}`;
                    } else if (orderData.altura || orderData.peso && !orderData.frete_envio) {
                        medidasTexto = `CAIXA: ${orderData.altura || '?'} x ${orderData.largura || '?'} x ${orderData.comprimento || '?'} cm - VOL: ${volume || '?'}cm³ |  PESO: ${orderData.peso || '?'}`;
                    }
                    
                    // Posiciona logo abaixo da área de itens (aprox 2.6 cm do topo)
                    const medidasY = 2.6 * CM_TO_PT; 
                    
                    doc.font('Helvetica-Bold').fontSize(5.8).fillColor('#000000')
                       .text(medidasTexto, 0.5 * CM_TO_PT, medidasY, {
                           width: LABEL_WIDTH - (1.5 * CM_TO_PT), // Respeita a margem lateral
                           align: 'left'
                       });
                }

                // CAMADA 3: ETIQUETA PLATAFORMA (ZPL ou PDF)
                if (orderData.zpl_content || orderData.pdf_file_name) {
                    try {
                        let labelImageBuffer;

                        // 1. Verifica se é Shopee e tem PDF guardado
                        if (orderData.plataforma === 'shopee' && orderData.pdf_file_name) {
                            // --- ALTERADO: Ignoramos o desenho da imagem aqui! ---
                            // O PDFKit vai deixar o espaço em branco, e o nosso método
                            // _mergeShopeePdfVector vai colar o vetor perfeitamente lá dentro.
                            labelImageBuffer = null;
                        } 
                        // 2. Fluxo Normal (ML / Amazon) com ZPL
                        else if (orderData.zpl_content && orderData.zpl_content !== '[PDF_SHOPEE]') {
                            labelImageBuffer = await this._convertZplToPng(orderData.zpl_content);
                        }

                        // 3. Aplica a imagem no PDFKit (Só vai rodar se for ML/Amazon)
                        if (labelImageBuffer) {
                            const yPos = 3 * CM_TO_PT;
                            const availableHeight = ((12 * CM_TO_PT) - 10);
                            doc.image(labelImageBuffer, -0.1 * CM_TO_PT, yPos, {
                                width: (LABEL_WIDTH - (1 * CM_TO_PT)) + 30, 
                                height: availableHeight + 10,
                                align: 'center', valign: 'center'
                            });
                        }
                    } catch (err) {
                        console.error('Erro ao gerar etiqueta da plataforma:', err.message);
                        doc.fontSize(10).fillColor('red').text('ERRO NA ETIQUETA DA PLATAFORMA', 1 * CM_TO_PT, 5 * CM_TO_PT);
                    }
                }

                doc.end();

            } catch (err) {
                reject(err);
            }
        });
    },

    /**
     * NOVO: Abordagem Híbrida.
     * Pega o PDF "Template" gerado pelo PDFKit (com a Logo Anzai, QR Code e Textos)
     * e estampa a etiqueta da Shopee vetorial no espaço exato sem perder a qualidade.
     */
    async _mergeShopeePdfVector(basePdfBuffer, shopeeFileName) {
        const pdfPath = path.join(__dirname, '..', 'pdfEtiquetas', shopeeFileName);
        if (!fs.existsSync(pdfPath)) {
            throw new Error('Ficheiro PDF da etiqueta Shopee não encontrado no servidor.');
        }

        // 1. Carrega o nosso PDF base recém criado (O Template da Casa Anzai)
        const baseDoc = await PDFLibDoc.load(basePdfBuffer);
        const basePage = baseDoc.getPages()[0];

        // 2. Carrega a etiqueta original e vetorial da Shopee
        const shopeePdfBytes = await fs.promises.readFile(pdfPath);
        const shopeeDoc = await PDFLibDoc.load(shopeePdfBytes);

        // 3. Extrai a página da Shopee
        const [embeddedShopeePage] = await baseDoc.embedPdf(shopeeDoc, [0]);

        // 4. Mapeamento Matemático exato das medidas do PDFKit
        // O espaço que deixamos lá em cima tinha exatamente essas dimensões:
        const targetWidth = (LABEL_WIDTH - (1 * CM_TO_PT)) + 30;
        const targetHeight = ((12 * CM_TO_PT) - 10) + 10; // Resulta em 12 * CM_TO_PT

        // Escala para caber no "buraco" sem distorcer
        const scaleX = targetWidth / embeddedShopeePage.width;
        const scaleY = targetHeight / embeddedShopeePage.height;
        const scale = Math.min(scaleX, scaleY);

        const finalWidth = embeddedShopeePage.width * scale;
        const finalHeight = embeddedShopeePage.height * scale;

        // Posição da "Bounding Box" que definimos no PDFKit (A partir do topo/esquerda)
        const boxX = -0.1 * CM_TO_PT;
        const boxYTop = 3 * CM_TO_PT;

        // Converte o Y para o pdf-lib (que desenha a partir do fundo/esquerda)
        const boxYBottom = LABEL_HEIGHT - boxYTop - targetHeight;

        // Centraliza a imagem da Shopee dentro dessa Bounding Box (Mimetiza o align: center)
        const imgX = boxX + (targetWidth - finalWidth) / 2;
        const imgY = boxYBottom + (targetHeight - finalHeight) / 2;

        // 5. Estampa o vetor da Shopee por cima do nosso Template!
        basePage.drawPage(embeddedShopeePage, {
            x: imgX,
            y: imgY,
            width: finalWidth,
            height: finalHeight
        });

        // Isso faz com que o leitor de PDF do navegador (Chrome, Edge, etc.)
        // abra a tela de impressão automaticamente assim que a aba for carregada!
        baseDoc.addJavaScript(
            'AutoPrint',
            'this.print({bUI: true, bSilent: false, bShrinkToFit: true});'
        );
        // ------------------------------------------

        // 6. Retorna o PDF finalizado e polido
        const finalPdfBytes = await baseDoc.save();
        return Buffer.from(finalPdfBytes);
    },

    /**
     * Função auxiliar que usa o Puppeteer para renderizar o PDFBuffer em PNG.
     * Injeta PDF.js na página para fazer a renderização canvas.
     */
    async _convertPdfToImgWithPuppeteer(pdfBuffer) {
        let browser = null;
        try {
            // Converte o buffer para base64 para passar para o navegador
            const pdfBase64 = pdfBuffer.toString('base64');

            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] // Importante para rodar em servidores
            });
            const page = await browser.newPage();

            // Define o tamanho da viewport para garantir qualidade (2x o tamanho original para nitidez)
            await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 2 });

            // HTML Mágico: Usa CDN do PDF.js para desenhar o PDF num canvas
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
                    <style>body { margin: 0; overflow: hidden; } canvas { display: block; }</style>
                </head>
                <body>
                    <canvas id="the-canvas"></canvas>
                    <script>
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                        async function render() {
                            const pdfData = atob("${pdfBase64}");
                            const loadingTask = pdfjsLib.getDocument({data: pdfData});
                            const pdf = await loadingTask.promise;
                            const page = await pdf.getPage(1);
                            
                            const scale = 2; // Qualidade
                            const viewport = page.getViewport({scale: scale});

                            const canvas = document.getElementById('the-canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;

                            const renderContext = {
                                canvasContext: context,
                                viewport: viewport
                            };
                            await page.render(renderContext).promise;
                            return 'done'; // Sinal para o Puppeteer
                        }
                        render().then(() => { window.renderDone = true; });
                    </script>
                </body>
                </html>
            `;

            await page.setContent(htmlContent);

            // Espera a variável window.renderDone ser true
            await page.waitForFunction('window.renderDone === true', { timeout: 10000 });

            // Tira screenshot apenas do canvas
            const element = await page.$('#the-canvas');
            const imageBuffer = await element.screenshot({ type: 'png' });
            
            return imageBuffer.toString('base64');

        } catch (error) {
            console.error('Puppeteer Error:', error);
            throw new Error('Falha ao rasterizar PDF com Puppeteer.');
        } finally {
            if (browser) await browser.close();
        }
    },

    // --- MÉTODOS ORIGINAIS DE APOIO ---

    /**
     * Desenha a barra lateral com DOIS QR Codes:
     * 1. DANFE (Topo)
     * 2. ANÚNCIO (Baixo)
     */
    async _drawSideBarCodes(doc, chaveAcesso, mlbAnuncio) {
        const qrSize = 32; 
        const qrSizeMLB = 25;
        const gap = 30; // Espaço entre os dois QRs
        
        // Coordenadas Base (Faixa lateral direita)
        // LABEL_WIDTH e CM_TO_PT são constantes globais do arquivo
        const xOrigin = LABEL_WIDTH - (1 * CM_TO_PT); 
        
        // Centro vertical da etiqueta
        const centerY = LABEL_HEIGHT / 2;
        
        // Define posições Y para os dois códigos ficarem centralizados verticalmente no total
        const yTop = centerY - (qrSize / 2) - (gap / 2) - 125; 
        const yBottom = centerY + (qrSize / 2) + (gap / 2) - 125; 

        // --- 1. QR CODE DANFE (CIMA) ---
        if (chaveAcesso) {
            const textDanfe = chaveAcesso.replace(/[^0-9]/g, '');
            try {
                const pngDanfe = await bwipjs.toBuffer({
                    bcid: 'qrcode',
                    text: textDanfe,
                    scale: 5,
                });

                doc.save();
                doc.translate(xOrigin, yTop); // Vai para a posição superior

                // Texto "DANFE"
                doc.fontSize(7).font('Helvetica-Bold').fillColor('black');
                doc.text('DANFE', -(qrSize/2), -(qrSize/2) - 10, {
                    width: qrSize, align: 'center'
                });

                // Imagem QR Code
                doc.image(pngDanfe, -(qrSize/2), -(qrSize/2), {
                    fit: [qrSize, qrSize],
                    align: 'center'
                });
                doc.restore();

            } catch (err) {
                console.error('[LabelService] Erro QR DANFE:', err);
            }
        }

        // --- 2. QR CODE MLB (BAIXO) ---
        /*if (mlbAnuncio) {
            try {
                const pngMlb = await bwipjs.toBuffer({
                    bcid: 'qrcode',
                    text: mlbAnuncio, // O código MLB (ex: MLB123456)
                    scale: 5,
                });

                doc.save();
                doc.translate(xOrigin, yBottom); // Vai para a posição inferior

                // Texto "ANÚNCIO"
                doc.fontSize(7).font('Helvetica-Bold').fillColor('black');
                doc.text('MLB', -(qrSizeMLB/2), -(qrSizeMLB/2) - 10, {
                    width: qrSizeMLB, align: 'center'
                });

                // Imagem QR Code
                doc.image(pngMlb, -(qrSizeMLB/2), -(qrSizeMLB/2), {
                    fit: [qrSizeMLB, qrSizeMLB],
                    align: 'center'
                });
                doc.restore();

            } catch (err) {
                console.error('[LabelService] Erro QR MLB:', err);
            }
        }*/
    },

    /**
     * Converte ZPL para PNG usando API externa com Retry System para evitar erro 429.
     */
    async _convertZplToPng(zpl, tentativas = 5) {
        const url = 'http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/';
        
        try {
            const response = await axios.post(url, zpl, {
                responseType: 'arraybuffer',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return Buffer.from(response.data);

        } catch (error) {
            // Se for erro 429 (Too Many Requests) e ainda tiver tentativas
            if (error.response && error.response.status === 429 && tentativas > 0) {
                console.warn(`[Labelary] Limite atingido (429). Tentando novamente em 2s... Restam: ${tentativas}`);
                
                // Espera 2 segundos antes de tentar de novo
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Chama a função recursivamente
                return this._convertZplToPng(zpl, tentativas - 1);
            }
            
            // Se for outro erro ou acabaram as tentativas, explode o erro
            throw error;
        }
    },

    // services/LabelGenerationService.js

    /**
     * Busca os dados brutos no banco com as colunas corretas das tabelas fornecidas
     */
    async _fetchOrderData(numeroVenda) {
        const query = `
            SELECT 
                mlo.id, 
                mlo.chave_acesso,
                mlo.numero_venda,
                mlo.mlb_anuncio,
                sl.zpl_content,
                mlo.frete_envio,
                sl.pdf_file_name,
                sl.plataforma,
                -- --- NOVAS COLUNAS (Medidas) ---
                pm.altura,
                pm.largura,
                pm.comprimento,
                pm.peso,

                -- 1. TOTALIZADOR
                (
                    SELECT COALESCE(SUM(quantidade_total), 0) 
                    FROM order_items oi 
                    WHERE oi.order_id = mlo.id
                ) as total_itens,

                -- 2. LISTA DE PRODUTOS
                (
                    SELECT STRING_AGG(
                        CONCAT(sku, ' - ', descricao_produto, ' = ', quantidade_total), 
                        ', '
                    )
                    FROM order_items oi
                    WHERE oi.order_id = mlo.id
                ) as lista_produtos

            FROM mercado_livre_orders mlo
            LEFT JOIN shipping_labels sl ON sl.order_number = mlo.numero_venda
            -- JOIN COM A TABELA DE MEDIDAS (Usando o MLB como chave)
            LEFT JOIN packaging_measures pm ON pm.mlb_anuncio = mlo.mlb_anuncio
            WHERE mlo.numero_venda = $1
            LIMIT 1;
        `;
        
        const { rows } = await db.query(query, [numeroVenda]);
        return rows[0];
    }
};

module.exports = LabelGenerationService;