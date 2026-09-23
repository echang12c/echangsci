# Instruções para o Claude

- Responder sempre em português.
- **Fluxo de publicação:** toda novidade ou melhoria vai primeiro para o site de teste
  (push no branch de trabalho → https://teste.seucofrin.pages.dev e https://teste.ericzin.pages.dev,
  via `.github/workflows/publicar.yml`). Só abrir/mesclar no `Main` (site principal) depois
  que o Eric der o ok depois de ver o site de teste.
- `meucofrin/index.html` é a fonte; depois de editar, rodar
  `node ericzin-life-plan/tools/sincronizar-cofrin.mjs`.
- Pets: `meucofrin/pets/` e `ericzin-life-plan/pets/` precisam ficar idênticos
  (`*.glb`, `silhouettes/*.png`, `thumbs/*.webp` usado no Admin).
