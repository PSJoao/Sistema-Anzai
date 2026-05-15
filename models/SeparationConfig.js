// models/SeparationConfig.js
const db = require('../config/database');

const SeparationConfig = {
    async getAll() {
        const { rows } = await db.query('SELECT filter_key, is_visible, start_time, end_time FROM separation_filter_configs');
        const tempMap = {};

        // Pega a hora atual no fuso do servidor e converte para minutos
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;

        rows.forEach(row => {
            let isActive = row.is_visible;

            // Se estiver invisível (oculto), mas tiver regra de horário, avaliamos o relógio
            if (!isActive && row.start_time && row.end_time) {
                const [sH, sM] = row.start_time.split(':').map(Number);
                const [eH, eM] = row.end_time.split(':').map(Number);
                const startMins = sH * 60 + sM;
                const endMins = eH * 60 + eM;

                if (startMins <= endMins) {
                    isActive = (currentTime >= startMins && currentTime <= endMins);
                } else {
                    // Caso o horário cruze a meia-noite (ex: 22:00 às 02:00)
                    isActive = (currentTime >= startMins || currentTime <= endMins);
                }
            }

            tempMap[row.filter_key] = {
                is_visible: row.is_visible,
                start_time: row.start_time ? row.start_time.substring(0, 5) : null,
                end_time: row.end_time ? row.end_time.substring(0, 5) : null,
                isActive: isActive
            };
        });

        const configMap = {};
        // Garante que o objeto final seja criado sempre na mesma ordem (importante para o layout do painel)
        ['atrasado', 'hoje', 'futuro'].forEach(key => {
            if (tempMap[key]) {
                configMap[key] = tempMap[key];
            } else {
                configMap[key] = { is_visible: true, start_time: null, end_time: null, isActive: true };
            }
        });

        return configMap;
    },

    async update(filterKey, isVisible, startTime, endTime) {
        const query = `
        INSERT INTO separation_filter_configs (filter_key, is_visible, start_time, end_time, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (filter_key)
        DO UPDATE SET 
            is_visible = EXCLUDED.is_visible,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            updated_at = NOW()
     `;
        const st = startTime || null;
        const et = endTime || null;
        await db.query(query, [filterKey, isVisible, st, et]);
    }
};

module.exports = SeparationConfig;