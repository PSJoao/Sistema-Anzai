// services/BatchReportService.js
// Gera o PDF do Romaneio de Expedição (A4)

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Configurações A4 (em points: 1pt = 1/72 inch)
// A4 = 595.28 x 841.89 points
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

const BatchReportService = {

    async generatePdf(batchData, res) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: MARGIN,
            info: {
                Title: `Romaneio ${batchData.batch_number}`,
                Author: 'Casa Anzai System'
            }
        });

        doc.pipe(res);

        // Caminho da Logo
        const logoPath = path.join(__dirname, '../public/images/logo-resumo.png');
        const hasLogo = fs.existsSync(logoPath);

        // Dados
        const orders = batchData.orders || [];
        const totalPedidos = orders.length;
        const totalVolumes = orders.reduce((sum, o) => sum + (Number(o.total_unidades) || 0), 0);

        // Helper para desenhar Cabeçalho em cada página
        const drawHeader = () => {
            // Logo
            if (hasLogo) {
                doc.image(logoPath, MARGIN, MARGIN, { width: 80 });
            } else {
                doc.font('Helvetica-Bold').fontSize(14).text('CASA ANZAI', MARGIN, MARGIN);
            }

            // Título e Info do Lote (Lado Direito)
            doc.font('Helvetica-Bold').fontSize(16).text('ROMANEIO DE EXPEDIÇÃO', 0, MARGIN, { align: 'right' });
            
            doc.moveDown(0.5);
            doc.font('Helvetica').fontSize(10);
            doc.text(`Lote: ${batchData.batch_number}`, { align: 'right' });
            
            const dataFmt = new Date(batchData.created_at).toLocaleDateString('pt-BR');
            const horaFmt = new Date(batchData.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            doc.text(`Data: ${dataFmt} às ${horaFmt}`, { align: 'right' });
            doc.text(`Responsável: ${batchData.responsavel || 'Sistema'}`, { align: 'right' });

            // Linha separadora
            doc.moveDown(1);
            doc.lineWidth(1).moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).stroke();
            doc.moveDown(0.5);
        };

        // Helper para Tabela
        const drawTableHeaders = (y) => {
            doc.font('Helvetica-Bold').fontSize(9);
            // Colunas: Pedido (15%), Produtos (55%), Qtd (10%), Canal (20%)
            doc.text('PEDIDO', MARGIN, y, { width: CONTENT_WIDTH * 0.15 });
            doc.text('PRODUTOS', MARGIN + (CONTENT_WIDTH * 0.15), y, { width: CONTENT_WIDTH * 0.55 });
            doc.text('QTD', MARGIN + (CONTENT_WIDTH * 0.70), y, { width: CONTENT_WIDTH * 0.10, align: 'center' });
            doc.text('CANAL', MARGIN + (CONTENT_WIDTH * 0.80), y, { width: CONTENT_WIDTH * 0.20, align: 'right' });
            
            doc.lineWidth(0.5).moveTo(MARGIN, y + 12).lineTo(PAGE_WIDTH - MARGIN, y + 12).stroke();
            return y + 18;
        };

        // --- INÍCIO DO DESENHO ---
        drawHeader();
        
        // Resumo do Lote
        let currentY = doc.y;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text(`Resumo: ${totalPedidos} Pedidos | ${totalVolumes} Volumes Totais`, MARGIN, currentY);
        doc.moveDown(1.5);
        currentY = doc.y;

        // Cabeçalho da Tabela
        currentY = drawTableHeaders(currentY);

        // Iterar Pedidos
        doc.font('Helvetica').fontSize(8);
        
        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            
            // Verifica espaço na página (Footer precisa de uns 50pts)
            if (currentY > PAGE_HEIGHT - 60) {
                doc.addPage();
                drawHeader();
                currentY = doc.y + 20; // Espaço após header
                currentY = drawTableHeaders(currentY);
                doc.font('Helvetica').fontSize(8); // Restaura fonte
            }

            // Zebra Striping (Cinza claro nas linhas pares)
            if (i % 2 === 0) {
                doc.fillColor('#f9f9f9');
                doc.rect(MARGIN, currentY - 4, CONTENT_WIDTH, 14).fill();
                doc.fillColor('#000000'); // Restaura preto para texto
            }

            // Dados da Linha
            const pedidoX = MARGIN;
            const prodX = MARGIN + (CONTENT_WIDTH * 0.15);
            const qtdX = MARGIN + (CONTENT_WIDTH * 0.70);
            const canalX = MARGIN + (CONTENT_WIDTH * 0.80);

            // Pedido
            doc.text(order.numero_venda, pedidoX, currentY, { width: CONTENT_WIDTH * 0.15 });

            // Produtos (Trunca se for muito grande para manter linha única ou dupla)
            const produtosTexto = order.produtos || 'Sem descrição';
            doc.text(produtosTexto, prodX, currentY, { 
                width: CONTENT_WIDTH * 0.55,
                height: 10, // Altura fixa para manter a linha compacta
                ellipsis: true
            });

            // Qtd
            doc.text(String(order.total_unidades || 0), qtdX, currentY, { 
                width: CONTENT_WIDTH * 0.10, 
                align: 'center' 
            });

            // Canal
            let canalLabel = order.plataforma || '';
            if (canalLabel === 'mercado_livre') canalLabel = 'Mercado Livre';
            doc.text(canalLabel, canalX, currentY, { 
                width: CONTENT_WIDTH * 0.20, 
                align: 'right' 
            });

            currentY += 14; // Altura da linha
        }

        // Rodapé com Assinatura (Apenas na última página ou adicionar nova se não couber)
        if (currentY > PAGE_HEIGHT - 100) {
            doc.addPage();
            currentY = MARGIN + 50;
        } else {
            currentY += 40;
        }

        doc.lineWidth(1).moveTo(PAGE_WIDTH / 2 - 100, currentY).lineTo(PAGE_WIDTH / 2 + 100, currentY).stroke();
        doc.font('Helvetica').fontSize(8).text('Assinatura do Transportador / Conferente', MARGIN, currentY + 5, { align: 'center' });

        doc.end();
    }
};

module.exports = BatchReportService;