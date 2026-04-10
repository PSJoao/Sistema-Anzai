// public/scripts/handlebars-helpers.js (ou o caminho onde fica seu arquivo helpers)

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const platformLabels = {
    mercado_livre: 'Mercado Livre'
};

const helpers = {
    // --- Comparadores Lógicos ---
    eq: (v1, v2) => v1 === v2,
    
    neq: (v1, v2) => v1 !== v2,
    
    // [NOVO] Greater Than (Maior que)
    gt: (v1, v2) => v1 > v2,

    // [NOVO] Less Than (Menor que)
    lt: (v1, v2) => v1 < v2,

    // [NOVO] Greater Than or Equal (Maior ou igual)
    gte: (v1, v2) => v1 >= v2,

    // [NOVO] Less Than or Equal (Menor ou igual)
    lte: (v1, v2) => v1 <= v2,

    or: (...args) => {
        args.pop(); // Remove o último argumento (options do handlebars)
        return args.some(Boolean);
    },

    and: (...args) => {
        args.pop();
        return args.every(Boolean);
    },

    // --- Operações Matemáticas (Necessário para Paginação) ---
    
    // [NOVO] Adição
    add: (v1, v2) => {
        return Number(v1) + Number(v2);
    },

    // [NOVO] Subtração
    subtract: (v1, v2) => {
        return Number(v1) - Number(v2);
    },

    // --- Formatadores e Utilitários ---

    lookup: (obj, field) => obj && obj[field],

    length: (collection) => {
        if (Array.isArray(collection)) {
            return collection.length;
        }
        return 0;
    },

    formatCurrency: (value) => {
        if (value === null || value === undefined || value === '') {
            return '0,00';
        }

        const num = Number(value);
        if (Number.isNaN(num)) {
            return '0,00';
        }

        return currencyFormatter.format(num);
    },

    formatDate: (value) => {
        if (!value) {
            return '-';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }

        return date.toLocaleDateString('pt-BR');
    },

    platformLabel: (platformKey) => {
        if (!platformKey) {
            return '-';
        }
        return platformLabels[platformKey] || platformKey;
    },

    includes: (array, value) => {
        if (!array || !Array.isArray(array)) {
            return false;
        }
        return array.includes(value);
    },

    sum: (collection, field) => {
        if (!Array.isArray(collection)) {
            return 0;
        }
        
        return collection.reduce((total, item) => {
            const value = Number(item[field]) || 0;
            return total + value;
        }, 0);
    },

    json: (context) => {
        try {
            return JSON.stringify(context ?? {});
        } catch (error) {
            return '{}';
        }
    }
};

module.exports = helpers;