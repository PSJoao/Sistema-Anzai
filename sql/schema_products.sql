-- ==================================================================
-- Schema complementar para produtos, vínculos de pedidos e separação
-- Executar manualmente no PostgreSQL antes de rodar o novo módulo.
-- ==================================================================

CREATE TABLE IF NOT EXISTS departments (
    code                INTEGER PRIMARY KEY,
    name                TEXT        NOT NULL
);

INSERT INTO departments (code, name) VALUES
    (2,  'Veterinária'),
    (3,  'Agrícola'),
    (5,  'Hidráulica'),
    (6,  'Ferragens'),
    (7,  'Imobilizado'),
    (9,  'Brinde'),
    (10, 'Despesa e Consumo'),
    (11, 'Material de Construção'),
    (22, 'Pet')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

CREATE TABLE IF NOT EXISTS products (
    codigo                      BIGINT PRIMARY KEY,
    cod_fabrica                 TEXT,
    descricao                   TEXT NOT NULL,
    referencia                  TEXT,
    unidade                     TEXT,
    item_ativo                  BOOLEAN,
    cod_grupo                   BIGINT,
    grupo                       TEXT,
    cod_departamento            INTEGER REFERENCES departments(code),
    departamento                TEXT,
    cod_marca                   BIGINT,
    marca                       TEXT,
    cod_fornecedor              BIGINT,
    fornecedor                  TEXT,
    nivel_de_giro               TEXT,
    preco_custo_ultima_compra   NUMERIC(18,4),
    ativo                       BOOLEAN,
    ativo_compra                BOOLEAN,
    ite_precom_liq              NUMERIC(18,4),
    ipi_entrada                 NUMERIC(18,4),
    frete                       NUMERIC(18,4),
    valor_frete                 NUMERIC(18,4),
    acrescimo_financeiro        NUMERIC(18,4),
    substituicao_tributaria     NUMERIC(18,4),
    diferencial_aliquota        NUMERIC(18,4),
    preco_custo                 NUMERIC(18,4),
    icms_saida                  NUMERIC(18,4),
    imposto_federal_entrada     NUMERIC(18,4),
    imposto_federal_saida       NUMERIC(18,4),
    despesas_operacionais       NUMERIC(18,4),
    boca_de_caixa               NUMERIC(18,4),
    preco_custo_real            NUMERIC(18,4),
    classificacao_ipi           TEXT,
    abreviacao_fiscal           TEXT,
    abreviacao_pis              TEXT,
    abreviacao_cofins           TEXT,
    cest                        TEXT,
    tipo_produto                TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT      NOT NULL REFERENCES mercado_livre_orders(id) ON DELETE CASCADE,
    produto_codigo      BIGINT      NOT NULL REFERENCES products(codigo),
    sku                 TEXT        NOT NULL,
    descricao_produto   TEXT,
    quantidade_total    INTEGER     NOT NULL,
    quantidade_separada INTEGER     NOT NULL DEFAULT 0,
    status              TEXT        NOT NULL DEFAULT 'pendente',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, produto_codigo, sku)
);

CREATE INDEX IF NOT EXISTS order_items_produto_status_idx
    ON order_items (produto_codigo, status);

CREATE INDEX IF NOT EXISTS order_items_order_idx
    ON order_items (order_id);

CREATE TABLE IF NOT EXISTS picking_locks (
    produto_codigo          BIGINT PRIMARY KEY REFERENCES products(codigo),
    departamento            INTEGER     NOT NULL REFERENCES departments(code),
    user_id                 INTEGER     NOT NULL REFERENCES users(id),
    quantidade_meta         INTEGER     NOT NULL,
    quantidade_concluida    INTEGER     NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS picking_locks_user_idx
    ON picking_locks (user_id);

-- Atualiza o timestamp automaticamente ao modificar registros críticos
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'order_items_set_updated_at'
    ) THEN
        CREATE TRIGGER order_items_set_updated_at
            BEFORE UPDATE ON order_items
            FOR EACH ROW
            EXECUTE PROCEDURE set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'picking_locks_set_updated_at'
    ) THEN
        CREATE TRIGGER picking_locks_set_updated_at
            BEFORE UPDATE ON picking_locks
            FOR EACH ROW
            EXECUTE PROCEDURE set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'products_set_updated_at'
    ) THEN
        CREATE TRIGGER products_set_updated_at
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE PROCEDURE set_updated_at();
    END IF;
END;
$$;

