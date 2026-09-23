# echangsci

Os apps pessoais do Eric, num repositório só.

| Pasta | App | No ar em |
|---|---|---|
| [`ericzin-life-plan/`](ericzin-life-plan/) | Ericzin's Life Plan: painel semanal com os 6 pilares da vida, incluindo a seção Meu Cofrin | https://ericzin.pages.dev |
| [`meucofrin/`](meucofrin/) | Meu Cofrin: finanças da casa (lançamentos, metas, Mercado, Contas da casa, Relatórios) | https://seucofrin.pages.dev |

Os dois são sites estáticos (HTML + JS, sem build) hospedados no Cloudflare Pages.

## Como as duas pastas se relacionam

- **`meucofrin/` é a fonte do Cofrin.** Toda mudança no Cofrin é feita aqui.
  A pasta também guarda as regras do Firestore (`firestore.rules`) e o worker
  de notificações push (`notifier/`, Cloudflare Worker `cofre-notifier`).
- **A seção Meu Cofrin do LifePlan é gerada a partir dela.** Depois de mexer no
  Cofrin, rode:

  ```bash
  node ericzin-life-plan/tools/sincronizar-cofrin.mjs
  ```

  Isso regenera `ericzin-life-plan/cofrin.css`, `cofrin.js` e o trecho entre
  `<!-- COFRIN:INICIO -->` e `<!-- COFRIN:FIM -->` do `index.html`. Não edite
  esses arquivos à mão. Detalhes em [`ericzin-life-plan/README.md`](ericzin-life-plan/README.md).
- Os dados do Cofrin ficam no Firebase `moneyericana` e os do LifePlan no
  `ericzinlifeplan`. Os dois apps não compartilham login nem dados.

## Rodar localmente

Qualquer servidor estático serve, por exemplo:

```bash
npx serve ericzin-life-plan   # LifePlan
npx serve meucofrin           # Cofrin
```

## Publicar

- LifePlan: `npx wrangler pages deploy <pasta> --project-name ericzin --branch main`,
  com o conteúdo de `ericzin-life-plan/` sem a pasta `tools/`.
- Cofrin sozinho (seucofrin.pages.dev): publicado a partir da pasta `meucofrin/`.
- Worker de push: `cd meucofrin/notifier && npx wrangler deploy`.
