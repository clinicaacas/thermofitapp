## Escopo e ordem de execução

Vou tratar as 10 frentes como uma única entrega coesa. Antes de codar, abro com um mapa de auditoria do estado atual (ledger da Celestina, sumário get_today_mission_summary, vídeos com >=90% sem crédito, tarefas pós-vídeo órfãs) e só depois aplico as correções.

### 1. Auditoria inicial (somente leitura, ~6 queries)
- Snapshot do `miles_ledger` da Celestina por `source_kind` x `occurred_on` para detectar gaps reais.
- Lista de `client_video_progress` com `progress_percent >= 90` sem linha correspondente em `client_mission_completions` de `video_complete`.
- Conferência das chaves idempotentes em uso (`award_miles`) para garantir formato único.
- Inventário de `mission_settings` e `client_missions` ativas para validar a fonte única do contador.

### 2. Migração única (estrutura + reconciliação)
- `mission_settings`: garantir 8 chaves oficiais via `ensure_mission_settings` (já existe) e ativar `weekly_photo=15`, `post_video_task=10`, `hydration_goal=10`.
- `mission_settings`: travar `default_miles` nos valores oficiais (5/5/10/5/10/5/15/10) por tenant.
- Coluna `client_task_responses.miles_awarded boolean default false` se ainda não existir (idempotência).
- View materializada NÃO — manter `get_today_mission_summary` como fonte única.
- Reescrever `get_today_mission_summary` para considerar: vídeos do dia, tarefas pós-vídeo, check-in, refeição, treino, foto treino, hidratação 2L, foto semanal quando dia==release_day.
- Função `reconcile_client_video_miles(_client_id, _journey_id)` que, para cada `client_video_progress` >=90% sem crédito, chama `award_miles` com `source_kind='video_complete'` e `idempotency_key='video:'||video_id||':'||occurred_on`. Roda 1x para a Celestina via migração (DO block ao final).
- Trigger `BEFORE UPDATE` em `client_video_progress` para emitir `award_miles` quando `progress_percent` cruza 90% pela primeira vez (idempotência via chave única).

### 3. Backend (server functions)
- `thermofit-missions.functions.ts`:
  - `markVideoProgress`: passa a chamar a nova RPC com `progress` real do player; concede +5 só ao cruzar 90%, idempotente.
  - `submitPostVideoConfirm`: requer vídeo concluído antes; concede +10 1x por (cliente, task, jornada).
  - `submitHydrationGoal`: detecta cruzamento de 2L (lê `client_hydration_logs` do dia), idempotente.
  - `submitWeeklyPhoto`: já existe — garantir +15 1x via idempotency `weekly_photo:journey:week`.
  - `submitCheckin/submitMeal/submitWorkout/submitWorkoutPhoto`: revisar idempotência e travar regra de "treino → libera foto", "descanso → bloqueia foto, sem milhas, sem penalidade".
- `thermofit-missions-admin.functions.ts`:
  - Novas funções `listPostVideoTasks`, `upsertPostVideoTask`, `togglePostVideoTask` (tipo fixo "confirmação simples" nesta entrega).
- `thermofit-client-app.functions.ts`: garantir que `getHomeBundle` NÃO retorna mais o bloco de check-in/rotina (Home limpa).

### 4. App da Cliente
- `app.missoes.tsx`:
  - Vídeo do Dia: registra 90% via `timeupdate` (não só `ended`); mostra check verde persistente; reassistir não credita.
  - Tarefa pós-vídeo: só renderiza quando há registros em `client_missions` tipo `post_video_task` ativos do dia E vídeo concluído.
  - Rotina: refeição/treino com seleção única (radio behavior); foto treino oculta até treino registrado.
  - Hidratação: barra ligada ao `client_hydration_logs` e mostra "+10 ao atingir 2L".
  - Foto semanal: mantém upload, mostra check verde e Milhas creditadas; mensagens de erro humanas.
- `app.index.tsx`: remover bloco "Me conta como foi a sua jornada hoje". Manter Suporte e atalhos.
- `app.videos.tsx`: idem player com 90% + status verde persistente.
- `app.premios.tsx`, `app.passaporte.tsx`: já consomem `client-miles` — adicionar invalidação cruzada.

### 5. Painel Admin
- `missoes-admin.tsx`: nova aba **Tarefas pós-vídeo** dentro do mesmo módulo, com CRUD por vídeo (lista de vídeos do tenant + tarefas vinculadas + toggle ativo + Milhas fixas 10).
- `clientes.$id.missoes.tsx`: já existe — adicionar coluna de origem real (vídeo X, tarefa Y).
- `clientes.$id.premios.tsx`: já reflete ledger; só revisar invalidação Realtime.

### 6. Realtime e invalidação cruzada
- Hook `useMissionsRealtime(clientId)` em `app.missoes.tsx` e `app.index.tsx` escutando `miles_ledger`, `client_mission_completions`, `client_video_progress`, `client_hydration_logs`, `client_progress_photos`, `client_task_responses` filtrados por cliente.
- Em cada evento, invalidar: `mission-summary`, `daily-routine`, `client-miles`, `client-home`, `today-mission-summary`, `client-rewards`, `client-achievements`, `journey-progress`.
- Adicionar `ALTER PUBLICATION` para tabelas que ainda não estão no Realtime.

### 7. Reconciliação Celestina (automática, conforme aprovado)
- Bloco DO ao fim da migração que:
  1. Para cada `client_video_progress` da Celestina com `progress_percent >= 90` e sem linha em `miles_ledger` com `source_ref` correspondente, chama `award_miles` com `source_kind='video_complete'` e key idempotente.
  2. Grava 1 linha em `miles_audit_log` por crédito com `source_kind='reconciliation'` e justificativa "Reconciliação técnica Entrega 1".
- Não toca em refeição/treino/hidratação/foto (não temos comprovação binária sem timestamp confiável).

### 8. Teste runtime E2E
- Script `bun /tmp/missions-e2e.ts` que, autenticado como admin via service role, executa para a Celestina:
  1. Marca progresso de vídeo 95% → confere +5.
  2. Repete → confere idempotência.
  3. Marca tarefa pós-vídeo → confere +10 1x.
  4. Check-in/refeição/treino/foto → confere +5/+5/+10/+5.
  5. Hidratação 2L → confere +10 1x.
  6. Snapshot final do ledger e do `get_today_mission_summary`.
- Resultado anexado na resposta final.

### Arquivos a alterar
- `supabase/migrations/<timestamp>_missions_delivery_1.sql` (única)
- `src/lib/thermofit-missions.functions.ts`
- `src/lib/thermofit-missions-admin.functions.ts`
- `src/lib/thermofit-client-app.functions.ts`
- `src/routes/app.missoes.tsx`
- `src/routes/app.index.tsx`
- `src/routes/app.videos.tsx`
- `src/routes/missoes-admin.tsx`
- `src/components/post-video-task-card.tsx`
- `src/components/weekly-photo-card.tsx`
- `src/components/daily-routine-card.tsx`
- novo `src/hooks/use-missions-realtime.ts`
- `/tmp/missions-e2e.ts` (script)

### Limitações conhecidas
- Tarefas pós-vídeo entram apenas com tipo "confirmação simples" (conforme aprovado); texto curto e seleção ficam para entrega futura.
- Reconciliação automática cobre apenas vídeos (única ação com timestamp e percentual auditáveis). Refeições/treinos/hidratação dependem de auto-relato e não são reconciliados retroativamente.
- Selos/Marcos seguem regras já implementadas via triggers — não serão alterados nesta entrega, apenas validados.
- Detecção de 2L na hidratação considera a soma do dia local (`America/Sao_Paulo`), não o instante exato em que o usuário cruzou — credita no primeiro evento que totaliza >=2000ml.

Posso executar tudo nesta ordem agora?