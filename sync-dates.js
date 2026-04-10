// sync-dates.js
const db = require('./config/database');

function toLocalDateString(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0'); // Meses começam em 0
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function analyzeLabelData(zplContent) {
    if (!zplContent) return { date: null, isFlex: 'f' };

    // 1. Detecta se é Flex
    const isFlex = /Envio Flex/i.test(zplContent) ? 't' : 'f';

    // 2. Extração de Data
    let date = null;
    let match = null;

    // TENTATIVA A: Padrão "Despachar:" (Etiqueta Normal/Coleta)
    // Ex: Despachar: 30/dec
    match = zplContent.match(/Despachar:[\s\S]*?(\d{1,2})\/([a-zç]{3})/i);

    // TENTATIVA B: Padrão "Entrega:" (Etiqueta Flex)
    // Ex: Entrega: ... ^FD12-Jan^FS
    if (!match) {
        // Procura pela tag ZPL específica que contém a data no formato dia-Mês
        match = zplContent.match(/\^FD(\d{1,2})-([a-zç]{3})\^FS/i);
    }

    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase();

        const months = {
            // Português
            'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
            // Inglês (comum em ZPLs gerados globalmente)
            'feb': 1, 'apr': 3, 'may': 4, 'aug': 7, 'sep': 8, 'oct': 9, 'dec': 11
        };

        if (months[monthStr] !== undefined) {
            // --- LÓGICA DE ANO INTELIGENTE ---
            const now = new Date();
            let year = now.getFullYear();
            const currentMonth = now.getMonth();
            const labelMonth = months[monthStr];

            // Virada de ano: Se estamos em Dezembro e etiqueta é Janeiro -> Ano + 1
            if (currentMonth === 11 && labelMonth === 0) {
                year++;
            }
            // Virada de ano retroativa: Se estamos em Janeiro e etiqueta é Dezembro -> Ano - 1
            else if (currentMonth === 0 && labelMonth === 11) {
                year--;
            }

            date = new Date(Date.UTC(year, labelMonth, day, 12, 0, 0));
        }
    }

    return { date, isFlex };
}

async function runDateMigration() {
    console.log('Iniciando sincronização retroativa de Datas e Flex...');

    try {
        // Busca etiquetas do ML.
        // Removi o filtro "AND mlo.data_envio_limite IS NULL" para garantir que
        // passaremos por todas as etiquetas para marcar o is_flex corretamente,
        // mesmo as que já tinham data (mas podiam estar sem a flag).
        const queryLabels = `
            SELECT 
                sl.id, 
                sl.order_number, 
                sl.zpl_content, 
                sl.data_envio_limite AS label_date,
                sl.mlb_item, 
                mlo.data_envio_limite, 
                mlo.is_flex,
                mlo.mlb_anuncio
            FROM shipping_labels sl
            JOIN mercado_livre_orders mlo ON sl.order_number = mlo.numero_venda
            WHERE sl.plataforma = 'mercado_livre'
              AND mlo.status_bucket != 'cancelado'
        `;
        
        const { rows: labels } = await db.query(queryLabels);
        console.log(`Encontradas ${labels.length} etiquetas para analisar.`);

        let updatedDate = 0;
        let updatedFlex = 0;
        let updatedMlb = 0;
        let skipped = 0;

        for (const label of labels) {
            let needsUpdate = false;
            let fields = [];
            let values = [];
            let idx = 1;

            // 1. Detecta IsFlex usando a função existente
            const isFlex = analyzeLabelData(label.zpl_content).isFlex;

            // 2. A MÁGICA AQUI: Prioriza a data que já está na shipping_labels (label.label_date)
            // Se não tiver, aí sim ele tenta extrair do ZPL como fallback.
            let dateStrFromLabel = null;
            if (label.label_date) {
                // Se já tem data na shipping_labels, usa ela!
                dateStrFromLabel = toLocalDateString(label.label_date);
            } else {
                // Se não tem, tenta extrair do ZPL
                const extractedDate = analyzeLabelData(label.zpl_content).date;
                if (extractedDate) {
                    dateStrFromLabel = toLocalDateString(extractedDate);
                    
                    // Como a shipping_labels estava vazia e achamos no ZPL, atualizamos ela
                    await db.query(`UPDATE shipping_labels SET data_envio_limite = $1 WHERE id = $2`, [extractedDate, label.id]);
                }
            }

            const currentDateStr = label.data_envio_limite ? toLocalDateString(label.data_envio_limite) : null;

            //console.log(`PEDIDO: ${label.order_number}`);
            //console.log(`Data Extraída/Formatada Corretamente: ${toLocalDateString(label.label_date) || 'N/A'}`);
            // 3. Verifica se precisa atualizar a data no pedido (mercado_livre_orders)
            if (dateStrFromLabel && currentDateStr !== dateStrFromLabel) {
                console.log("VAI ATUALIZAR A DATA");
                fields.push(`data_envio_limite = $${idx++}`);
                values.push(dateStrFromLabel);
                updatedDate++;
                needsUpdate = true;
            }

            // 4. Lógica de Atualização do Flex (Mantida igual)
            if (isFlex !== label.is_flex) {
                fields.push(`is_flex = $${idx++}`);
                values.push(isFlex); 
                updatedFlex++;
                needsUpdate = true;
            }

            if (label.mlb_item && label.mlb_anuncio === null) {
                fields.push(`mlb_anuncio = $${idx++}`);
                values.push(label.mlb_item);
                updatedMlb++;
                needsUpdate = true;
            }

            // Executa Update na tabela principal de pedidos
            if (needsUpdate) {
                values.push(label.order_number);
                await db.query(
                    `UPDATE mercado_livre_orders SET ${fields.join(', ')} WHERE numero_venda = $${idx}`,
                    values
                );
            } else {
                skipped++;
            }
            
            if ((updatedDate + updatedFlex + updatedMlb + skipped) % 100 === 0) process.stdout.write('.');
        }

        console.log('Sincronização Finalizada!');
        console.log(`Resumo -> Datas: ${updatedDate} | Flex: ${updatedFlex} | Anúncios (MLB): ${updatedMlb} | Ignorados: ${skipped}`);

    } catch (error) {
        console.error('❌ Erro fatal:', error);
    }
}

module.exports = runDateMigration;