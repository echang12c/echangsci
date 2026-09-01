-- ============================================================================
-- Cofrin :: Seção Mercado
-- Modelo de dados para notas fiscais de supermercado.
--
-- Decisão de modelagem: 5 tabelas em vez de uma só.
-- Uma tabela única de "compras" não responde à pergunta central do usuário
-- ("quanto custa CADA produto e como ele varia POR MERCADO"), porque a
-- descrição impressa na nota muda de mercado para mercado
-- ("ARROZ TIO JOAO T1 5KG" vs "ARR TIO JOAO TP1 5KG"). Sem um produto
-- canônico + tabela de apelidos, o mesmo item vira N produtos distintos e a
-- comparação entre mercados fica impossível.
--
-- Dinheiro é sempre INTEGER em CENTAVOS. Nunca float — 0.1 + 0.2 != 0.3.
-- Quantidade e peso são REAL (0.436 kg de tomate é legítimo).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. markets — onde a compra foi feita.
--    `chain` separa a rede (Carrefour) da loja (Carrefour Vila Mariana), para
--    o usuário comparar tanto "rede x rede" quanto "loja x loja".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS markets (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  chain       TEXT,
  cnpj        TEXT    UNIQUE,
  city        TEXT,
  state       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_name ON markets(name);

-- ---------------------------------------------------------------------------
-- 2. receipts — a nota fiscal em si (o "cabeçalho" da compra).
--    `access_key` é a chave de acesso de 44 dígitos da NFC-e; sendo UNIQUE,
--    ela impede que a mesma nota seja importada duas vezes se o usuário
--    fotografar de novo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id              INTEGER PRIMARY KEY,
  market_id       INTEGER NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  purchase_date   TEXT    NOT NULL,               -- 'YYYY-MM-DD'
  access_key      TEXT    UNIQUE,                 -- chave NFC-e (44 dígitos)
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,     -- soma dos itens, antes do desconto
  discount_cents  INTEGER NOT NULL DEFAULT 0,     -- desconto do cupom inteiro
  total_cents     INTEGER NOT NULL DEFAULT 0,     -- valor efetivamente pago
  image_path      TEXT,                           -- foto original da nota
  source          TEXT    NOT NULL DEFAULT 'foto' CHECK (source IN ('foto','manual')),
  -- 'rascunho' = extraído da foto, aguardando conferência do usuário.
  -- Só nota 'confirmada' entra nas análises: OCR erra, e um preço errado
  -- contamina todo o histórico do produto.
  status          TEXT    NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','confirmada')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipts_date   ON receipts(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_market ON receipts(market_id);

-- ---------------------------------------------------------------------------
-- 3. products — o produto canônico, independente de mercado.
--    O tamanho da embalagem faz parte da IDENTIDADE do produto: arroz 1kg e
--    arroz 5kg são produtos diferentes e comparar o preço unitário deles seria
--    mentira. É `pack_size`/`pack_unit` que permitem derivar o valor do kilo
--    de um item vendido por unidade.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,                   -- 'Arroz branco tipo 1'
  brand       TEXT,                               -- 'Tio João'
  category    TEXT    NOT NULL DEFAULT 'Outros',
  pack_size   REAL,                               -- 5      (NULL p/ granel)
  pack_unit   TEXT    CHECK (pack_unit IN ('kg','g','l','ml','un')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_identity
  ON products(name, COALESCE(brand,''), COALESCE(pack_size,-1), COALESCE(pack_unit,''));
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ---------------------------------------------------------------------------
-- 4. product_aliases — a ponte entre o texto cru da nota e o produto canônico.
--    Esta é a tabela que faz a seção funcionar sem trabalho manual repetido:
--    o usuário liga "ARR TIO JOAO TP1 5KG" ao produto UMA vez, e toda nota
--    futura daquele mercado casa sozinha.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_aliases (
  id               INTEGER PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  market_id        INTEGER REFERENCES markets(id) ON DELETE CASCADE, -- NULL = vale p/ todo mercado
  raw_description  TEXT    NOT NULL,              -- exatamente como sai na nota
  market_code      TEXT,                          -- código interno do mercado, quando existe
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_desc
  ON product_aliases(raw_description, COALESCE(market_id,-1));
CREATE INDEX IF NOT EXISTS idx_alias_code ON product_aliases(market_id, market_code);

-- ---------------------------------------------------------------------------
-- 5. receipt_items — cada linha da nota. É aqui que moram os campos pedidos:
--    quantidade, valor unitário, desconto e valor total.
--    O valor do kilo NÃO é coluna: é derivado (view v_items), porque depende
--    do produto ligado e mudaria sozinho se o usuário corrigir a embalagem.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_items (
  id               INTEGER PRIMARY KEY,
  receipt_id       INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL, -- NULL até ser casado
  line_no          INTEGER NOT NULL,
  raw_description  TEXT    NOT NULL,
  market_code      TEXT,
  quantity         REAL    NOT NULL CHECK (quantity > 0),
  unit             TEXT    NOT NULL DEFAULT 'un' CHECK (unit IN ('kg','g','l','ml','un')),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),  -- valor unitário
  discount_cents   INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents      INTEGER NOT NULL CHECK (total_cents >= 0),       -- valor total já com desconto
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_receipt ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON receipt_items(product_id);
