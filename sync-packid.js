// sync-packid.js
const db = require('./config/database'); // Certifique-se que o caminho para seu arquivo de banco está correto

// Função de extração (mesma lógica do OrderService)
function extractPackIdFromZpl(zplContent) {
    // Regex atualizada para suportar "Pack ID:" OU "Venda:"
    // (?:Pack ID|Venda) -> Grupo de não captura que aceita um ou outro
    // \s* -> Espaços opcionais
    // (\d+) -> Captura o prefixo (Ex: 20000)
    // [\s\S]*? -> Ignora tudo no meio (coordenadas, quebras de linha) até achar...
    // \^FD(\d{5,})\^FS -> O comando com o número longo subsequente
    const match = zplContent.match(/(?:Pack ID|Venda):\s*(\d+)[\s\S]*?\^FD(\d{5,})\^FS/i);
    
    if (match && match[1] && match[2]) {
        // Concatena: 20000 + 14501948080 -> 2000014501948080
        return `${match[1]}${match[2]}`;
    }
    return null;
}

async function runMigration() {
    console.log('Iniciando sincronização de Pack IDs...');

    try {
        // 1. Busca todas as etiquetas do Mercado Livre
        // (Otimização: Pegamos apenas ID, order_number e zpl_content)
        const queryLabels = `
            SELECT s.id, s.order_number, s.zpl_content 
            FROM shipping_labels s INNER JOIN mercado_livre_orders m ON s.order_number = m.numero_venda
            WHERE s.plataforma = 'mercado_livre'
            AND m.pack_id IS NULL 
        `;
        
        const { rows: labels } = await db.query(queryLabels);
        console.log(`📦 Total de etiquetas encontradas: ${labels.length}`);

        let processed = 0;
        let updated = 0;
        let skipped = 0;

        for (const label of labels) {
            const packId = extractPackIdFromZpl(label.zpl_content);

            if (packId) {
                // 2. Atualiza a tabela shipping_labels
                await db.query(
                    `UPDATE shipping_labels SET pack_id = $1 WHERE id = $2`,
                    [packId, label.id]
                );

                // 3. Atualiza a tabela mercado_livre_orders (vínculo pelo numero_venda)
                await db.query(
                    `UPDATE mercado_livre_orders SET pack_id = $1 WHERE numero_venda = $2`,
                    [packId, label.order_number]
                );

                updated++;
                
                // Feedback visual simples a cada 50 registros
                if (updated % 50 === 0) {
                    console.log(`   ... ${updated} registros atualizados até agora.`);
                }

            } else {
                skipped++;
                // console.warn(`   ⚠️  Pack ID não encontrado na etiqueta ID ${label.id} (Pedido: ${label.order_number})`);
            }

            processed++;
        }

        console.log('\n========================================');
        console.log('✅ Sincronização Finalizada!');
        console.log(`Total Processado: ${processed}`);
        console.log(`Atualizados com Sucesso: ${updated}`);
        console.log(`Sem Pack ID (Ignorados): ${skipped}`);
        console.log('========================================');

    } catch (error) {
        console.error('❌ Erro fatal durante a migração:', error);
    }
}

// Executa
module.exports = runMigration;