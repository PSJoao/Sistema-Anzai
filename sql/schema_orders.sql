-- ------------------------------------------------------------------
-- 1. LIMPA AS TABELAS DE TESTE (PARA PODER EXECUTAR VÁRIAS VEZES)
-- RESTART IDENTITY zera os IDs (1, 2, 3...)
-- CASCADE apaga 'order_items' e 'picking_locks' dependentes
-- ------------------------------------------------------------------
TRUNCATE 
  public.mercado_livre_orders, 
  public.order_items, 
  public.picking_locks 
RESTART IDENTITY CASCADE;

-- ------------------------------------------------------------------
-- 2. CRIA OS 6 KITS (Múltiplos produtos no mesmo 'numero_venda')
-- Todos os SKUs são do seu CSV
-- ------------------------------------------------------------------

-- KIT 001 (Produto 9576 + 67705)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-001', '9576', '(BARRA) TIGRE TUBO SOLDÁVEL MARROM 3/4 25MM', 5, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 9576, '9576', '(BARRA) TIGRE TUBO SOLDÁVEL MARROM 3/4 25MM', 5 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-001', '67705', '(BONIFICAÇÃO PARA VENDEDORES) KIT CHURRASCO', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 67705, '67705', '(BONIFICAÇÃO PARA VENDEDORES) KIT CHURRASCO', 1 FROM new_order;


-- KIT 002 (Produto 61589 + 56231) - Ambos são 'PET' (Dep 22)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-002', '61589', '(A GRANEL - 58349) STYLOSSO BIFINHO MACIO PALITO CARNE', 3, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 61589, '61589', '(A GRANEL - 58349) STYLOSSO BIFINHO MACIO PALITO CARNE', 3 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-002', '56231', '(A GRANEL - 48614) FÓRM. NATURAL LIFE RAÇÃO CÃES FILHOTE', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 56231, '56231', '(A GRANEL - 48614) FÓRM. NATURAL LIFE RAÇÃO CÃES FILHOTE', 1 FROM new_order;


-- KIT 003 (Produto 30256 + 38518 + 39340) - Todos 'Hidráulica' (Dep 5)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-003', '30256', '(CONJ IRR) TIGRE JOELHO 90 025MM TIGRE SOLDA', 10, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 30256, '30256', '(CONJ IRR) TIGRE JOELHO 90 025MM TIGRE SOLDA', 10 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-003', '38518', '(CONJ IRR) TIGRE TE SOLDÁVEL 32MM', 5, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 38518, '38518', '(CONJ IRR) TIGRE TE SOLDÁVEL 32MM', 5 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-003', '39340', '(CONJ IRR) TIGRE SAIDA ASPERSOR EP 2X1', 2, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 39340, '39340', '(CONJ IRR) TIGRE SAIDA ASPERSOR EP 2X1', 2 FROM new_order;


-- KIT 004 (Produto 68347 + 50903) - Ambos 'PET' (Dep 22)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-004', '68347', '(BONIFICAÇÃO) RAGUIFE BANDANA PARA PET', 4, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 68347, '68347', '(BONIFICAÇÃO) RAGUIFE BANDANA PARA PET', 4 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-004', '50903', '(A GRANEL - 49946) MAGNUS RAÇÃO TODO DIA CÃO ADULTO', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 50903, '50903', '(A GRANEL - 49946) MAGNUS RAÇÃO TODO DIA CÃO ADULTO', 1 FROM new_order;


-- KIT 005 (Produto 14585 + 31362) - 'Despesa e Consumo' (Dep 10)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-005', '14585', '(DESPESA) TAMBOR', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 14585, '14585', '(DESPESA) TAMBOR', 1 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-005', '31362', '(DESPESA) CAIXA DE PAPELÃO CORREIO SEDEX PAC (20X20X20)', 10, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 31362, '31362', '(DESPESA) CAIXA DE PAPELÃO CORREIO SEDEX PAC (20X20X20)', 10 FROM new_order;


-- KIT 006 (Produto 39621 + 46436) - 'Material de Construção' (Dep 11)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-006', '39621', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.073', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 39621, '39621', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.073', 1 FROM new_order;

WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('KIT-006', '46436', '(AMOSTRA) PORCELANATO LAMINATO 25X104', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 46436, '46436', '(AMOSTRA) PORCELANATO LAMINATO 25X104', 1 FROM new_order;


-- ---------------------------------
-- 3. CRIA OS 14 PEDIDOS SIMPLES
-- ---------------------------------

-- ORD 001
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-001', '49706', '(AMOSTRA) ELIZABETH REVEST. PORCELANATO WIRE BEIGE', 2, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 49706, '49706', '(AMOSTRA) ELIZABETH REVEST. PORCELANATO WIRE BEIGE', 2 FROM new_order;

-- ORD 002 (Produto que existe em KIT-002, para testar acumulação)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-002', '56231', '(A GRANEL - 48614) FÓRM. NATURAL LIFE RAÇÃO CÃES FILHOTE', 3, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 56231, '56231', '(A GRANEL - 48614) FÓRM. NATURAL LIFE RAÇÃO CÃES FILHOTE', 3 FROM new_order;

-- ORD 003
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-003', '49567', '(AMOSTRA) PISO MAGMA LUX 25X25 -CERAMICA PORTO FERREIRA', 8, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 49567, '49567', '(AMOSTRA) PISO MAGMA LUX 25X25 -CERAMICA PORTO FERREIRA', 8 FROM new_order;

-- ORD 004
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-004', '38819', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.055', 3, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 38819, '38819', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.055', 3 FROM new_order;

-- ORD 005
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-005', '61590', '(BWM 3F97) CAMINHÃO M BENZ L 1218 CHASSI 9BM384009NB953114', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 61590, '61590', '(BWM 3F97) CAMINHÃO M BENZ L 1218 CHASSI 9BM384009NB953114', 1 FROM new_order;

-- ORD 006
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-006', '45316', '(AMOSTRA) PORC REGUA 30X120 EXTINT WOOD PLUS 130029', 5, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 45316, '45316', '(AMOSTRA) PORC REGUA 30X120 EXTINT WOOD PLUS 130029', 5 FROM new_order;

-- ORD 007
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-007', '58529', '(DESPESA) PERFURADOR DE SOLO A GASOLINA', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 58529, '58529', '(DESPESA) PERFURADOR DE SOLO A GASOLINA', 1 FROM new_order;

-- ORD 008
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-008', '40588', '(DESPESA) ÁLCOOL', 12, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 40588, '40588', '(DESPESA) ÁLCOOL', 12 FROM new_order;

-- ORD 009 (Outro produto PET para testar acumulação - Dep 22)
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-009', '68347', '(BONIFICAÇÃO) RAGUIFE BANDANA PARA PET', 2, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 68347, '68347', '(BONIFICAÇÃO) RAGUIFE BANDANA PARA PET', 2 FROM new_order;

-- ORD 010
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-010', '45339', '(AMOSTRA) DELTA PORC RT 63X120 TOQUIO-R63', 2, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 45339, '45339', '(AMOSTRA) DELTA PORC RT 63X120 TOQUIO-R63', 2 FROM new_order;

-- ORD 011
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-011', '44857', '(AMOSTRA) LEF VA25316 RANCH - PISO ACET. RET.', 4, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 44857, '44857', '(AMOSTRA) LEF VA25316 RANCH - PISO ACET. RET.', 4 FROM new_order;

-- ORD 012
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-012', '58667', '(AMOSTRA DE PISO) PISO POL 85X85 BRONZE ARMANI LUX', 1, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 58667, '58667', '(AMOSTRA DE PISO) PISO POL 85X85 BRONZE ARMANI LUX', 1 FROM new_order;

-- ORD 013
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-013', '40472', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.087', 6, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 40472, '40472', '(AMOSTRA) INCOPISOS PISO HD 57X57 170.087', 6 FROM new_order;

-- ORD 014
WITH new_order AS (
    INSERT INTO public.mercado_livre_orders (numero_venda, sku, titulo_anuncio, unidades, estado, variacao, import_batch_id)
    VALUES ('ORD-014', '26468', '(CONJ IRR) TIGRE TUBO ESG PRIM 150MM 6MT', 2, 'Pagamento aprovado', '-', gen_random_uuid())
    RETURNING id
)
INSERT INTO public.order_items (order_id, produto_codigo, sku, descricao_produto, quantidade_total)
SELECT id, 26468, '26468', '(CONJ IRR) TIGRE TUBO ESG PRIM 150MM 6MT', 2 FROM new_order;