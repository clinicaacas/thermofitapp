# Central Administrativa de Missões

Apesar do prefixo "For the code present, I get the error below", a solicitação é uma feature grande (nova rota administrativa + aba no perfil da cliente + função consolidada de backend). Vou planejar antes de implementar para evitar retrabalho.

## 1. Menu lateral
- Adicionar item `Missões` em `src/components/app-sidebar.tsx` entre **Clientes** e **Alertas**, ícone `Target` (lucide). Sem duplicar.

## 2. Backend — função consolidada (sem novas tabelas)
Criar `src/lib/thermofit-missions-admin.functions.ts` com:

- `listMissionsCentral({ tenantId, filters })` — server fn protegida com `requireSupabaseAuth` + `is_profile_manager`. Une registros das fontes existentes em linhas com formato canônico:
  ```
  { clientId, clientName, journeyId, journeyDay, week, type, title, status, date, miles, origin, updatedAt, refId }
  ```
  Fontes:
  - `client_missions` + `client_mission_completions` (vídeos, tarefas, foto semanal, manuais, daily templates já gerados)
  - `client_daily_responses` (check-in, alimentação, treino, foto treino) — projetar uma "linha" por flag concluída
  - `client_hydration_logs` (agregado por dia → status hidratação)
  - `client_video_progress` (progresso de vídeos não materializados ainda em missão)
  - `client_progress_photos` (foto evolução)
  - `miles_ledger` para `miles` reais por evento
  Deduplica por chave `(clientId, journeyDay, type, refId)`.

- `getMissionsOverview({ tenantId, date })` — agrega contadores do topo (jornadas ativas, missões hoje, concluídas, pendentes, milhas hoje, baixa adesão = clientes com <50% últimos 7 dias).

- `getClientMissionsDetail({ clientId })` — consolida missões do dia, vídeos, tarefas, rotinas, milhas, selos, marcos, histórico, respostas, fotos. Usa `get_today_mission_summary` + `get_journey_progress` já existentes.

- `createManualMission({ ... })` — insere em `client_missions` com `mission_type='manual'`, validando que não colide com automática (índices parciais já cuidam dos demais tipos).

- `adjustMissionStatus({ missionId, status, justification })` — somente missões manuais; grava em `miles_audit_log`.

- `adjustMilesManual({ clientId, miles, reason })` — escreve em `miles_ledger` via `award_miles` com idempotency único + `miles_audit_log`.

Todas as funções: ler com `context.supabase` (RLS do gestor) ou validar role via `has_role` e usar `supabaseAdmin` (dynamic import) apenas para escrita auditada.

## 3. Rotas frontend
- `src/routes/missoes-admin.tsx` (URL `/missoes-admin` — `missoes` colidiria com possível rota cliente; uso `missoes-admin` para evitar conflito). Layout: header com 6 KPIs, filtros (cliente, status, tipo, data, semana), tabela consolidada. Clique → `/clientes/$id?tab=missoes`.
- `src/routes/missoes-admin.configuracoes.tsx` — aba Configurações reutilizando `mission_settings` (CRUD via server fn já parcial em `thermofit-missions.functions.ts`; estender se faltar).
- Atualizar `src/routes/clientes.$id.tsx` para incluir aba **Missões** mostrando blocos de detalhe + ações (criar manual, ajustar status/milhas com justificativa).

## 4. Permissões
- Em cada server fn admin: `requireSupabaseAuth` + checagem `has_role(admin|dono|super_admin)`; equipe somente leitura.
- Cliente final nunca vê: rota fora de `/app`, sidebar admin não é renderizada para `kind=client` (já é).

## 5. Validações & testes
- Smoke runtime via `supabase--read_query` para conferir agregação esperada para a tenant ACAS (Celestina).
- Build/typecheck automático.
- Nenhum dado existente é modificado (todas as escritas novas são `INSERT` em `client_missions`, `miles_ledger`, `miles_audit_log`).

## Limitações esperadas
- "Baixa adesão" e "atrasada" são derivações em runtime (sem coluna persistida).
- Edição de missões automáticas continua bloqueada por design.
- Não vou cobrir E2E navegacional automatizado nesta entrega; apenas smoke SQL + typecheck.

## Arquivos a alterar/criar
- editar: `src/components/app-sidebar.tsx`, `src/routes/clientes.$id.tsx`
- criar: `src/lib/thermofit-missions-admin.functions.ts`, `src/routes/missoes-admin.tsx`, `src/routes/missoes-admin.configuracoes.tsx`
- possível extensão pequena em `src/lib/thermofit-missions.functions.ts` para reuso de settings CRUD
