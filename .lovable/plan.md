# Plano — Jornada de Vídeos + Missões do Dia + Execução Guiada (Vacuum)

Escopo grande. Divido em **7 entregas sequenciais**, cada uma testável de ponta a ponta. Cada entrega abre uma migration própria (você aprova antes de rodar) e só depois mexo no código que depende dela.

Nada de mexer em login, permissões, rotas principais ou sidebar.

---

## Entrega 1 — Fundação da jornada (Fases 1 + 6)

Objetivo: ter o "dia da jornada" funcionando de ponta a ponta e garantir que o admin já salva tudo certo.

- Util `getClientJourneyDay(startDate)` em `src/lib/journey.ts` usando timezone `America/Sao_Paulo` (dia 0 = data de início; dia 1 = dia seguinte; etc.).
- Garantir em `clients` um campo de data de início da jornada (`journey_start_date`); se não existir, migration adicionando com default `created_at::date`. Backfill nas clientes existentes.
- Revisar o form de vídeo (`video-form.tsx`) para que o campo "Liberar no dia da jornada" aceite **0** como valor válido (não tratar como vazio), placeholder "Ex: 0 para o primeiro dia, 1 para o segundo dia". Confirmar persistência de `release_day`, `min_watch_percent` (default 90) e `miles_on_complete`.

## Entrega 2 — Aba Vídeos como biblioteca (Fase 2)

- Ajustar `listClientVideos` em `thermofit-client-app.functions.ts` para filtrar `release_day <= dia_atual_da_jornada` (usando `journey_start_date` da cliente).
- Em `src/routes/app.videos.tsx`, manter cards atuais, mas agrupar por `release_day` ("Dia 00", "Dia 01"…) com filtro por categoria preservado.

## Entrega 3 — Progresso e conclusão (Fase 4)

- Migration: tabela `client_video_progress` (`tenant_id`, `client_id`, `video_id`, `progress_percent`, `watched_seconds`, `last_position_seconds`, `is_completed`, `completed_at`, timestamps), com unique `(client_id, video_id)`. GRANTs + RLS (cliente só lê/escreve o próprio; admins do tenant leem).
- Server fns: `saveVideoProgress({ clientId, videoId, positionSeconds, durationSeconds })` — calcula `%`, marca `is_completed=true` ao atingir `min_watch_percent`, credita milhas **uma vez** (idempotente via `completed_at IS NULL`).
- No player (`app.videos.tsx`), salvar progresso a cada ~10s e ao fechar; auto-conclusão ao atingir o percentual mínimo.

## Entrega 4 — Aba Missões do dia (Fases 3 + 5)

- Server fn `listTodayMissions({ clientId })`: vídeos com `status=ativo`, `release_day = dia_atual` e sem `client_video_progress.is_completed`.
- Card da missão: thumbnail, título, categoria, milhas, % mínima, botão "Assistir" abrindo o mesmo player da aba Vídeos. Concluir o vídeo remove da lista automaticamente.

## Entrega 5 — Admin de exercícios do Vacuum (Fases 8 + 9 parte admin)

- Migration: adicionar em `vacuum_exercises` os campos `media_url`, `media_type` (`gif|video|lottie|image`), `instruction_text`, `duration_seconds`, `sets`, `reps`, `miles_reward`. Bucket `vacuum-assets` já existe e é reutilizado.
- Em `admin-vacuum-settings.tsx`: editar mídia (upload GIF/WebM/MP4/Lottie), instrução, tempo, séries, reps, milhas. Botão "Gerar animação" fica para depois (Fase 9 completa) — por ora upload manual + placeholder.

## Entrega 6 — Execução guiada + Respiração (Fases 7 + 10 + 11)

- Migration: tabela `client_exercise_progress` (`tenant_id`, `client_id`, `exercise_id`, `module='vacuum'`, `status`, `started_at`, `completed_at`, `duration_seconds`, `miles_awarded`, timestamps) + GRANTs + RLS. Constraint para evitar duplicar milhas no mesmo dia.
- Nova rota `src/routes/app.vacuum.treino.tsx`: tela guiada com `nome`, mídia, instrução, timer (séries × duração), botões iniciar/pausar/próximo, barra de progresso do treino.
- Primeiro exercício (Respiração Diafragmática): timer com texto dinâmico "Inspire 4s / Expire 6s" sobreposto à animação. Ao concluir, registra progresso + milhas e libera o próximo.
- Botão "Começar Treino" em `app.vacuum.tsx` passa a navegar para essa nova rota.

## Entrega 7 — Geração automática da mídia (Fase 9 completa, opcional)

- Botão "Gerar animação do movimento" no admin chama uma server fn que usa `imagegen` para gerar uma imagem-referência (ou sequência curta) da execução; salva no bucket e associa.
- Se a geração falhar, mantém upload manual. Não bloqueia cadastro.

---

## Detalhes técnicos

- Server fns novas/alteradas ficam em `src/lib/thermofit-client-app.functions.ts` e `src/lib/thermofit-vacuum.functions.ts` (já existentes).
- Progresso de vídeo é escrito via `requireSupabaseAuth` validando que `auth.uid()` corresponde ao `client_id` (mesma checagem usada em `logVacuumEvent`).
- Milhas: incrementa `clients.miles_total` (ou tabela equivalente já usada) dentro da mesma transação da conclusão, e só quando `completed_at` muda de `NULL` para timestamp.
- Loaders das rotas `/app/*` continuam públicas pelo `clientId` na URL (padrão do app da cliente).

---

## Confirmações antes de começar

1. Posso seguir nas **7 entregas em sequência** nesta mesma conversa, cada uma com a migration própria para você aprovar?
2. Confirmo que **`clients.journey_start_date`** é a fonte da verdade do dia da jornada (com fallback para `created_at` quando vazio). Ok?
3. A **Entrega 7 (geração automática de animação)** é opcional e pode ficar para depois — posso entregar Entregas 1–6 primeiro e só fazer a 7 se você pedir?
