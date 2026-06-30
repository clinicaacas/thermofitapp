## A2 — Entrega Consolidada do Preview do App da Cliente

Antes de executar, preciso confirmar a arquitetura — porque há um ponto técnico crítico que muda muito o escopo e o risco da entrega. Não é microfase; é decidir o contrato antes de tocar em 16 rotas em produção.

### Situação atual

- Todas as 15+ views (`app.index.tsx`, `app.missoes.tsx`, `app.videos.tsx`, …) lêem `clientId` via `useSearch({ from: "/app/..." })`. Isso vem do URL.
- O Preview hoje usa `<iframe src="/app/missoes?clientId=…">`. Funciona porque o iframe tem URL própria.
- A2.1 já entregou: `ClientAppRuntimeProvider`, `useClientAppRuntime`, `getPreviewClientIdentity` e o layout `/app` injetando identidade em modo `client`.

### O nó técnico

Para remover o iframe e renderizar as views direto no painel admin, há dois caminhos — e eles têm custo/risco muito diferentes:

**Caminho A — Migração completa das views (o que o pedido literal descreve)**
- Criar `useResolvedClientAppIdentity()` como única fonte de `clientId/tenantId/journeyId`.
- Reescrever as 16 rotas (`app.*.tsx` + `client-app-shell.tsx`) para parar de usar `useSearch` e passar a usar o hook.
- Extrair o corpo de cada view em um componente puro (`<MissoesView/>`, `<VideosView/>`, …) para que o Preview consiga montá-los fora do roteador.
- Trocar o iframe por um seletor de tela que renderiza esses componentes dentro de `ClientAppRuntimeProvider mode="preview"`.
- Criar rota `/preview/app/cliente/$clientId` que usa o mesmo shell.
- **Custo real**: ~16 arquivos de rota reescritos + 16 componentes novos + shell + preview + rota nova. Diff de milhares de linhas. Cada view tem queries, realtime, mutations, modais — qualquer descuido quebra o App real publicado.
- **Risco**: alto. Toca todo o App real em produção (Celestina, Dona Chiquinha estão usando hoje).

**Caminho B — Preview via rota dedicada sem iframe visível**
- Manter as views como estão (continuam lendo `useSearch`).
- Criar rota `/preview/app/cliente/$clientId/*` que monta `ClientAppShell` em modo preview e renderiza as MESMAS views via `<Outlet />` do router, com a URL real do navegador refletindo o caminho.
- O painel admin abre essa rota num container in-page (sem `<iframe>` HTML, mas usando o próprio router via `<RouterProvider>` interno OU navegando programaticamente). Tecnicamente ainda existe um "sub-roteador", mas sem boundary iframe — então: sem reload de bundle, sem AuthGate admin duplicado, troca de tela sem hard reload, e o `getPreviewClientIdentity` valida tudo.
- **Custo**: 3-4 arquivos novos + ajuste em `app.tsx` + `client-app-preview.tsx` reescrito + rota nova.
- **Risco**: baixo-médio. Views reais não são tocadas. App publicado não regride.
- **Limitação honesta**: a "única fonte de verdade" exigida no item 1 vira parcial — `useResolvedClientAppIdentity` existe e é canônica para código novo, mas as views legadas continuam lendo `useSearch` (que no preview vem populado pela rota dedicada). Funcionalmente equivalente; arquiteturalmente menos puro.

### O que recomendo

**Caminho B**, e em paralelo deixo `useResolvedClientAppIdentity` pronto para que migrações futuras de view sejam triviais. Razões:

1. Atende todos os critérios visíveis: sem iframe HTML, sem tela branca, sem boot admin, troca de cliente sem hard reload, rota segura `/preview/app/cliente/$clientId`, identidade validada server-side, App real intacto.
2. Não introduz risco em código de produção que clientes reais (Celestina, Dona Chiquinha) estão usando agora.
3. Cabe em uma única entrega validada com Playwright.

O Caminho A entrega o item 3 do pedido ao pé da letra ("migrar todas as views"), mas é uma reescrita de produção do App da Cliente inteiro — não é o que costuma ser feito numa única entrega sem janela de regressão controlada.

### Pergunta única antes de executar

Confirma **Caminho B** (entrega consolidada, baixo risco, App real preservado) ou exige **Caminho A** (migração total das 16 views, risco alto no App publicado)?

Assim que responder, executo a entrega completa sem pausar — incluindo validação Playwright com as 3 clientes e relatório final de métricas.