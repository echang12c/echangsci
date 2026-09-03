# Cofrin — seção Mercado

Fotografe a nota fiscal do supermercado. O Cofrin lê os itens e passa a
acompanhar **quanto cada produto custa, em cada mercado, ao longo do tempo** —
com quantidade, valor unitário, desconto, valor total e valor do kilo.

## Como rodar

```bash
npm install
cp .env.example .env        # coloque sua ANTHROPIC_API_KEY
npm run dev                 # http://localhost:3000/mercado
```

Para ver as telas com dados de exemplo antes de lançar qualquer nota real:

```bash
npm run db:seed             # 25 notas, 4 mercados, 14 produtos, 1 ano de histórico
```

`npm run db:reset` apaga o banco local (ele se recria sozinho no próximo acesso).

## O fluxo

1. **Nova nota** — tirar foto (`capture="environment"` abre a câmera no celular)
   ou anexar uma imagem já salva.
2. **Leitura** — a foto vai para o Claude, que transcreve as linhas da nota.
3. **Conferência** — a nota nasce como **rascunho**. Você revisa item por item:
   quantidade, valor unitário, desconto, total e a qual produto a linha
   pertence. Nada entra nas análises antes de você confirmar.
4. **Análise** — a partir da confirmação, o produto aparece nos gráficos e nas
   tabelas.

O passo 3 não é burocracia: OCR erra dígito, e um preço errado contamina
permanentemente o histórico daquele produto. O app checa a aritmética de cada
linha (`quantidade × unitário − desconto = total`) e destaca o que não fecha.

Sem `ANTHROPIC_API_KEY` o app continua funcionando: a leitura por foto fica
desabilitada e o lançamento manual assume.

## O modelo de dados

São **cinco tabelas** (`db/schema.sql`), não uma. A razão é a pergunta central:
*"quanto custa este produto em cada mercado"*. A descrição impressa muda de
loja para loja — `ARROZ TIO JOAO T1 5KG` no Carrefour, `ARR TIO JOAO TP1 5KG`
no Assaí. Numa tabela única de compras esses dois viram produtos distintos e a
comparação entre mercados fica impossível.

| Tabela | Papel |
|---|---|
| `markets` | onde a compra foi feita (loja e rede) |
| `receipts` | a nota fiscal — data, totais, foto, rascunho/confirmada |
| `products` | o produto **canônico**, independente de mercado |
| `product_aliases` | liga o texto cru da nota ao produto canônico |
| `receipt_items` | a linha da nota: quantidade, unitário, desconto, total |

`product_aliases` é o que faz a seção parar de dar trabalho: você liga uma
descrição a um produto **uma vez**, e toda nota futura daquele mercado casa
sozinha.

**Dinheiro é sempre `INTEGER` em centavos**, nunca float. Quantidade e peso são
`REAL`, porque 0,436 kg de tomate é uma linha legítima de nota.

### O que é derivado, não armazenado

O **valor do kilo** não é coluna — é calculado nas views (`db/views.sql`), a
partir do peso da linha:

- item a granel (`unit = 'kg'`) → a própria quantidade é a massa;
- item embalado (`unit = 'un'`) → `quantidade × pack_size` do produto.

Guardar o valor do kilo o congelaria: corrigir a embalagem de "900 ml" para
"900 g" não corrigiria o histórico. Onde não há massa conhecida, o resultado é
`NULL` — honesto — e não zero, que quebraria a divisão.

O **valor unitário líquido** também é derivado: o desconto da linha entra
rateado, porque o que interessa é o que *você* pagou por unidade, não a tabela
do mercado. Sem ratear, um "leve 3 pague 2" apareceria no histórico como preço
cheio.

Views disponíveis: `v_items`, `v_price_history`, `v_product_market_stats`,
`v_product_spread`, `v_monthly_spend`. Elas são recriadas a cada boot, então
editar `db/views.sql` basta para mudar a análise — sem migração.

**Só nota `confirmada` entra nas views.** Rascunho é dado de OCR não conferido.

## Os gráficos

| Tela | Gráfico | Pergunta que responde |
|---|---|---|
| Visão geral | barras empilhadas por mês | quanto gastei, com quê |
| Visão geral | tabela de oportunidades | onde estou pagando mais caro |
| Produto | linhas, uma por mercado | este produto subiu? onde é mais barato? |
| Produto | barras horizontais | quanto custa em cada mercado |

Decisões que valem manter:

- **Uma linha de filtros acima de tudo.** Filtro dentro do cartão faria dois
  gráficos vizinhos mostrarem fatias diferentes sem o leitor perceber. O
  seletor "unitário / valor do kilo" também é único para os dois gráficos do
  produto.
- **Cor segue a entidade, não a posição.** O mercado tem cor estável; filtrar a
  lista não repinta os sobreviventes.
- **A comparação entre mercados usa ênfase, não paleta.** Um mercado é o ponto
  (o mais barato), os outros são contexto. Pintar cada um de uma cor gastaria o
  canal de cor com informação que o comprimento da barra já dá.
- **Todo gráfico tem uma visão de tabela.** Não é enfeite: no modo claro, três
  cores da paleta ficam abaixo de 3:1 de contraste contra a superfície, e a
  regra de alívio exige um caminho sem cor para o mesmo dado. Os rótulos
  diretos existem pelo mesmo motivo.
- **Passando de 6 categorias**, o excedente vira "Outras" em cinza. Uma sétima
  cor gerada seria indistinguível das outras sob daltonismo.

A paleta em `src/app/globals.css` foi validada nos dois modos (faixa de
luminosidade, piso de croma, separação para daltonismo, contraste). **Ao trocar
um hex, rode o validador de novo** em vez de confiar no olho.

## Testes

```bash
npm test          # conversões de dinheiro/unidade + schema e views em SQLite
npm run test:e2e  # fluxo rascunho -> confirmar -> análise (precisa do servidor no ar)
```

`npm test` cobre o ponto onde centavos se perdem em silêncio: `"1.234"` é mil
duzentos e trinta e quatro reais, `"12.99"` é doze e noventa e nove, e
`"0.436"` como *quantidade* é fração de quilo — apagar esse ponto viraria
436 kg de tomate.

## Limites conhecidos

- **A chamada de visão não foi exercitada contra a API real** — este ambiente
  não tinha credencial. A camada de transformação (transcrição → centavos →
  avisos) tem teste; a requisição em si, não. Rode com uma nota de verdade
  antes de confiar nela.
- A foto vai para `public/notas/`. Serve para uso local; num deploy de verdade
  troque por armazenamento de objetos, porque `public/` é servido a qualquer um
  que saiba a URL.
- SQLite com um arquivo local pressupõe um único processo. Para várias
  instâncias, migre para Postgres — o schema é portátil, mudam os tipos de
  chave (`INTEGER PRIMARY KEY` → `GENERATED ALWAYS AS IDENTITY`) e
  `datetime('now')` → `now()`.
- Cupom muito longo pode não caber numa foto legível; fotografe em partes e
  envie uma por vez.
- A NFC-e traz uma chave de acesso de 44 dígitos que aponta para o portal da
  SEFAZ, onde os itens estão estruturados. Ler dali seria mais exato que OCR —
  fica como próximo passo natural; o campo `receipts.access_key` já existe e é
  `UNIQUE`, o que também impede importar a mesma nota duas vezes.

## `public/calendario.html`

Página estática à parte (HTML/JS puro, sem build, com Firebase Auth +
Firestore direto no cliente) — um calendário de tarefas por equipe, servido
em `/calendario.html`. Não integra com o app Next.js/SQLite acima; é mantida
neste repositório apenas por conveniência de deploy.

No modo admin (aba **Configurações** → **📥 Importar tarefas via Excel**), dá
para subir uma planilha (.xlsx/.xls/.csv), mapear cada coluna para um campo
do calendário — inclusive para a coluna especial "Aba", que decide em qual
aba a tarefa aparece — e gravar tudo em lote no Firestore. Campos com mais de
um valor na célula usam `;` como separador, igual ao resto do app (tags,
abas, campos de múltipla escolha).
