# Entrega — Vídeo do Dia (todos os estados) + Tarefas Pós-Vídeo

Escopo grande, com mudanças de schema, backend, painel admin e App da Cliente. Nada que altere Milhas, jornadas, vídeos, fotos, conclusões ou clientes existentes (Celestina, Dona Chiquinha, E2E Missões). Tarefas legadas inválidas são preservadas em banco e apenas filtradas funcionalmente.

## 0. Convenção oficial de dias da jornada

Centralizar num único helper server-side `resolveJourneyDay(journey)` em `src/lib/journey-day.server.ts`:

- `journeyDayIndex` = `today_SP - started_on` (inteiro, base 0) — usado internamente. Mantém compatibilidade com `release_day` atual (`release_day = 0` é o primeiro dia).
- `journeyDayNumber` = `journeyDayIndex + 1` — número humano exibido à cliente (“Dia 1, Dia 2…”).
- `programDurationDays` = 84.
- `journeyStatus` = `active` | `completed` | `archived` (derivado de `client_journeys.status` + dias decorridos).

Substituir cálculos ad-hoc em `materialize_daily_missions_all`, `listClientVideos`, `listTodayVideoMissions`, `get_journey_progress`, `clientes.$id.missoes.tsx`. **Não** renumerar `release_day` em vídeos existentes — a convenção atual (base 0) permanece oficial. Apenas a exibição soma +1.

## 1. Server function unificada `getClientVideoDayState`

Novo arquivo `src/lib/thermofit-video-day.functions.ts` com `requireSupabaseAuth`. Retorna shape único consumido pelo App:

```ts
{
  journeyStatus, journeyDayNumber, programDurationDays,
  todayVideos: [{ videoId, missionId, title, miles, completed, progressPct }],
  pendingPriorVideos: number,
  nextReleaseDay: number | null,
  allPlannedCompleted: boolean,
  state: "video_available" | "video_done" | "no_video_today"
       | "prior_pending" | "all_completed" | "journey_finished"
}
```

Resolve tenant/client/journey via `clients.auth_user_id`. Materializa idempotentemente vídeos do dia (chama `ensure_video_mission` apenas se faltarem) para cobrir vídeos cadastrados após o cron.

## 2. App da Cliente — bloco Vídeo do Dia sempre visível

`src/routes/app.missoes.tsx`: remover `videoMissions.length > 0 && (...)`. Novo componente `VideoDayBlock` renderiza conforme `state`:

- `video_available` — cards atuais + player + Milhas previstas.
- `video_done` — card verde, “Milhas conquistadas”, permite rever sem novo crédito.
- `no_video_today` — card informativo (“Hoje não há um vídeo programado…” + “Seu próximo vídeo será liberado no dia X”).
- `prior_pending` — card com contagem + botão “Ver vídeos pendentes” → `/app/videos`.
- `all_completed` — card de celebração.
- `journey_finished` — card “Seu Plano de Voo foi concluído…”.

Nenhum estado informativo cria missão, botão de conclusão ou Milhas.

## 3. Materialização

Ajustar `materialize_daily_missions_all` (migration) para idempotência reforçada e usar `journeyDayIndex` consistente. Adicionar `ensure_today_video_missions(client_id, journey_id)` chamada também por `getClientVideoDayState` para cobrir vídeos recém-cadastrados sem esperar cron. Sem alteração de Milhas, sem duplicidade (índices únicos atuais já protegem).

## 4. Catálogo de Tarefas Pós-Vídeo (migration)

Nova tabela `public.video_post_tasks`:

- `id, tenant_id, video_id, journey_id (nullable), title, instruction, ordering, miles (default 10, CHECK 0..50), response_required bool, active bool, archived_at, archived_by, created_by, updated_by, created_at, updated_at`.
- Trigger valida: `video.tenant_id = task.tenant_id`; se `video.journey_id` não nulo → `task.journey_id` deve coincidir; se `task.journey_id` não nulo → mesmo tenant.
- Índice único parcial `(video_id, ordering, COALESCE(journey_id,'00000000-...'))` para evitar ordens duplicadas no mesmo escopo.
- GRANTs `authenticated` + `service_role`; RLS: SELECT para membros do tenant ou cliente dono do vídeo elegível; INSERT/UPDATE/DELETE só `is_profile_manager`.
- Estender `client_missions`: já existe `linked_video_id` e `task_ref`. `task_ref` passará a armazenar o `video_post_tasks.id`.

## 5. Admin > Missões > Tarefas Pós-Vídeo

Nova aba em `src/routes/missoes-admin.tsx` + componente `PostVideoTasksManager`:
- Listar por vídeo, filtros (vídeo, jornada, status), CRUD, arquivar (não apaga), ordenar.
- Escopo: “Catálogo da clínica” | “Exclusiva de jornada” com seletor de jornada.
- No formulário de vídeo (`src/components/video-form.tsx`): contador “N tarefas vinculadas” + link “Gerenciar tarefas”.
- Alerta admin para vídeos ativos sem tarefa: badge na listagem de vídeos.

Server functions em `src/lib/thermofit-post-video-tasks.functions.ts`: `listPostVideoTasks`, `savePostVideoTask`, `archivePostVideoTask`, `applyTaskToCompletedClients` (idempotente, sem Milhas).

## 6. Materialização e execução de tarefas

Em `saveVideoProgress` (já existe em `thermofit-client-app.functions.ts`):
- Quando vídeo atinge `min_completion_pct` e conclui → buscar `video_post_tasks` ativas elegíveis (mesmo tenant + (journey nula ou = jornada da cliente)) → criar missões `post_video_task` via `ensure_post_video_task` passando `task_ref = task.id`.
- Milhas da tarefa **não** são concedidas aqui.

Nova função `completePostVideoTask({ missionId, response? })`:
- Valida ownership (client/tenant/journey), busca tarefa via `task_ref`, exige resposta se `response_required`.
- Insere `client_task_responses` (idempotente), conclui missão, chama `award_miles` com `miles` lidas da tarefa (nunca do payload), `idempotency_key = "post_video_task:" || mission_id`.

## 7. App da Cliente — Tarefas Pós-Vídeo

Em Missões, abaixo do `VideoDayBlock`, novo `PostVideoTasksList`:
- Lista missões `post_video_task` do dia/jornada com `linked_video_id` válido e `task_ref` resolvendo para tarefa ativa.
- Filtra tarefas legadas: missões com `task_ref IN ('daily', NULL)` ou `task_ref` que não bate com `video_post_tasks.id` ficam ocultas e excluídas dos contadores.
- Render: nome do vídeo, título, instrução, Milhas, textarea (se obrigatório), botão “Concluir/Enviar”.
- Tarefas concluídas continuam visíveis (estado verde).

Componente atual `post-video-task-card.tsx` é genérico (sem `linked_video_id`) — será desativado e substituído pelo novo fluxo. Dados antigos permanecem em banco.

## 8. Segurança

Toda função respeita `tenant_id + client_id + journey_id + video_id + task_ref` simultaneamente. Trigger de integridade na tabela + validação em servidor. Sem leitura de `miles`/`client_id`/`journey_id` a partir do payload do cliente.

## 9. Filtragem de tarefas legadas

`listTodayMissions` e contadores do admin ignoram missões `post_video_task` com `task_ref` inválido (não-UUID ou sem match em `video_post_tasks`). Registros preservados para auditoria.

## 10. Testes runtime

Após deploy, executar via Playwright em cliente técnica isolada:
1. Dia ativo com vídeo → conclui 1x, Milhas creditadas.
2. Dia ativo sem vídeo → card informativo, sem missão/Milhas.
3. Vídeo futuro não aparece antes; aparece no dia certo.
4. Todos concluídos → card celebração.
5. Jornada encerrada → estado final.
6. Vídeo técnico + 2 tarefas → tarefas aparecem só após `min_completion_pct`.
7. Conclui tarefa 1 → +10 Milhas, 2ª permanece pendente.
8. Re-conclusão não duplica Milhas/resposta.
9. Outra cliente não enxerga vídeo/tarefa técnica.

E validação visual na Celestina:
- Vídeo do Dia visível no dia 13 com mensagem correta.
- Tarefas legadas não aparecem.

## Arquivos previstos

**Migrations:**
- `video_post_tasks` (tabela + trigger + RLS + GRANTs + índice único)
- ajuste `materialize_daily_missions_all` (idempotência reforçada)

**Backend:**
- `src/lib/journey-day.server.ts` (novo)
- `src/lib/thermofit-video-day.functions.ts` (novo — `getClientVideoDayState`)
- `src/lib/thermofit-post-video-tasks.functions.ts` (novo — CRUD + apply-to-completed)
- `src/lib/thermofit-client-app.functions.ts` (estender `saveVideoProgress` + nova `completePostVideoTask`)

**Frontend:**
- `src/routes/app.missoes.tsx` (substituir bloco vídeo + integrar tarefas)
- `src/components/video-day-block.tsx` (novo)
- `src/components/post-video-tasks-list.tsx` (novo)
- `src/routes/missoes-admin.tsx` (nova aba)
- `src/components/post-video-tasks-manager.tsx` (novo)
- `src/components/video-form.tsx` (contador + atalho)
- `src/routes/videos.index.tsx` (badge “sem tarefa”)

## Limitações conhecidas

- `release_day` permanece base 0 internamente; exibição soma +1. Vídeos já cadastrados não se deslocam.
- Tarefas legadas em `client_missions` com `task_ref` genérico não são apagadas — apenas ocultas.
- `applyTaskToCompletedClients` é manual (botão admin), não automático, para evitar surpresas em massa.

Aprova para implementar?
