-- ============================================================================
-- Cofrin :: Seção Mercado — views de análise
-- Toda pergunta de tela sai daqui, para que a lógica de preço exista em UM
-- lugar só. Views são recriadas a cada boot (DROP + CREATE), então editar
-- este arquivo basta para mudar a análise.
--
-- Regra transversal: apenas notas 'confirmada' entram. Rascunho é dado de OCR
-- não conferido e não pode mexer em média de preço.
-- ============================================================================

DROP VIEW IF EXISTS v_product_spread;
DROP VIEW IF EXISTS v_product_market_stats;
DROP VIEW IF EXISTS v_price_history;
DROP VIEW IF EXISTS v_monthly_spend;
DROP VIEW IF EXISTS v_items;

-- ---------------------------------------------------------------------------
-- v_items — a linha da nota já enriquecida: mercado, data, produto, e as
-- grandezas derivadas (peso, volume, preço unitário líquido, valor do kilo).
--
-- Por que o desconto é rateado no preço unitário: o usuário quer saber o que
-- ELE pagou por unidade, não a tabela do mercado. Sem ratear, uma promoção
-- "leve 3 pague 2" apareceria como preço cheio no histórico.
-- ---------------------------------------------------------------------------
CREATE VIEW v_items AS
SELECT
  ri.id,
  ri.receipt_id,
  ri.product_id,
  ri.line_no,
  ri.raw_description,
  ri.quantity,
  ri.unit,
  ri.unit_price_cents,
  ri.discount_cents,
  ri.total_cents,

  r.purchase_date,
  substr(r.purchase_date, 1, 7)          AS purchase_month,   -- 'YYYY-MM'
  r.market_id,
  m.name                                  AS market_name,
  COALESCE(m.chain, m.name)               AS market_chain,

  p.name                                  AS product_name,
  p.brand,
  COALESCE(p.category, 'Outros')          AS category,
  p.pack_size,
  p.pack_unit,

  -- Valor unitário LÍQUIDO (com o desconto da linha já rateado), em centavos.
  -- CAST para inteiro só na apresentação; aqui fica REAL para não perder
  -- centavo em item fracionado.
  (CAST(ri.total_cents AS REAL) / ri.quantity)      AS net_unit_price_cents,

  -- Peso total da linha em kg.
  --   granel  -> a própria quantidade é a massa
  --   embalado-> quantidade × tamanho da embalagem
  -- NULL quando o produto não tem massa conhecida (ex.: sabão em barra sem
  -- embalagem cadastrada). NULL é honesto; 0 seria mentira e explodiria a
  -- divisão do preço por kilo.
  CASE
    WHEN ri.unit = 'kg' THEN ri.quantity
    WHEN ri.unit = 'g'  THEN ri.quantity / 1000.0
    WHEN p.pack_unit = 'kg' THEN ri.quantity * p.pack_size
    WHEN p.pack_unit = 'g'  THEN ri.quantity * p.pack_size / 1000.0
  END                                                AS weight_kg,

  -- Volume total da linha em litros (mesma lógica, para bebidas/limpeza).
  CASE
    WHEN ri.unit = 'l'  THEN ri.quantity
    WHEN ri.unit = 'ml' THEN ri.quantity / 1000.0
    WHEN p.pack_unit = 'l'  THEN ri.quantity * p.pack_size
    WHEN p.pack_unit = 'ml' THEN ri.quantity * p.pack_size / 1000.0
  END                                                AS volume_l
FROM receipt_items ri
JOIN receipts  r ON r.id = ri.receipt_id AND r.status = 'confirmada'
JOIN markets   m ON m.id = r.market_id
LEFT JOIN products p ON p.id = ri.product_id;

-- ---------------------------------------------------------------------------
-- v_price_history — uma observação de preço por compra. É a série temporal
-- que alimenta o gráfico "preço deste produto ao longo do tempo, por mercado".
-- ---------------------------------------------------------------------------
CREATE VIEW v_price_history AS
SELECT
  product_id,
  product_name,
  brand,
  category,
  market_id,
  market_name,
  purchase_date,
  quantity,
  unit,
  discount_cents,
  total_cents,
  net_unit_price_cents,
  weight_kg,
  -- Valor do kilo: o único número que compara honestamente marcas com
  -- embalagens diferentes.
  CASE WHEN weight_kg > 0 THEN CAST(total_cents AS REAL) / weight_kg END AS price_per_kg_cents,
  CASE WHEN volume_l  > 0 THEN CAST(total_cents AS REAL) / volume_l  END AS price_per_l_cents
FROM v_items
WHERE product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- v_product_market_stats — resumo por produto × mercado.
-- Alimenta o gráfico de barras "o mesmo produto custa quanto em cada mercado".
-- ---------------------------------------------------------------------------
CREATE VIEW v_product_market_stats AS
SELECT
  product_id,
  product_name,
  brand,
  category,
  market_id,
  market_name,
  COUNT(*)                        AS purchases,
  MIN(purchase_date)              AS first_purchase,
  MAX(purchase_date)              AS last_purchase,
  AVG(net_unit_price_cents)       AS avg_unit_price_cents,
  MIN(net_unit_price_cents)       AS min_unit_price_cents,
  MAX(net_unit_price_cents)       AS max_unit_price_cents,
  AVG(price_per_kg_cents)         AS avg_price_per_kg_cents,
  SUM(total_cents)                AS spent_cents
FROM v_price_history
GROUP BY product_id, market_id;

-- ---------------------------------------------------------------------------
-- v_product_spread — a resposta direta a "vale a pena trocar de mercado?".
-- Para cada produto comprado em 2+ mercados, o mais barato, o mais caro e a
-- diferença. `savings_cents` é a economia por unidade ao migrar do mercado
-- mais caro para o mais barato.
-- ---------------------------------------------------------------------------
CREATE VIEW v_product_spread AS
WITH per_market AS (
  SELECT product_id, product_name, brand, category,
         market_id, market_name, avg_unit_price_cents, purchases
  FROM v_product_market_stats
),
agg AS (
  SELECT product_id,
         MIN(avg_unit_price_cents) AS cheapest_cents,
         MAX(avg_unit_price_cents) AS priciest_cents,
         COUNT(DISTINCT market_id) AS market_count,
         SUM(purchases)            AS purchases
  FROM per_market GROUP BY product_id
)
SELECT
  a.product_id,
  lo.product_name,
  lo.brand,
  lo.category,
  a.market_count,
  a.purchases,
  a.cheapest_cents,
  a.priciest_cents,
  lo.market_name            AS cheapest_market,
  hi.market_name            AS priciest_market,
  (a.priciest_cents - a.cheapest_cents) AS savings_cents,
  CASE WHEN a.cheapest_cents > 0
       THEN (a.priciest_cents - a.cheapest_cents) * 100.0 / a.cheapest_cents
  END                       AS spread_pct
FROM agg a
JOIN per_market lo ON lo.product_id = a.product_id AND lo.avg_unit_price_cents = a.cheapest_cents
JOIN per_market hi ON hi.product_id = a.product_id AND hi.avg_unit_price_cents = a.priciest_cents
WHERE a.market_count > 1;

-- ---------------------------------------------------------------------------
-- v_monthly_spend — gasto por mês × categoria, para a visão de orçamento.
-- ---------------------------------------------------------------------------
CREATE VIEW v_monthly_spend AS
SELECT
  purchase_month,
  category,
  market_name,
  SUM(total_cents)     AS spent_cents,
  SUM(discount_cents)  AS saved_cents,
  COUNT(*)             AS item_count
FROM v_items
GROUP BY purchase_month, category, market_name;
