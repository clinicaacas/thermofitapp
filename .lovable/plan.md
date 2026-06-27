
# Plano — Módulo Prêmios e Conquistas (entrega única)

## 1. Banco de dados (migração única)

**`rewards`** — adicionar colunas se faltarem: `reward_type` (mimo|sessao|voucher|ensaio), `milestone_miles` (int), `sort_order`.

**`reward_redemptions`** — adicionar:
- `journey_id uuid` (preencher para registros existentes via `clients.active_journey_id`)
- `status` ampliado para enum textual: `bloqueado | liberado | solicitado | entregue | cancelado`
- UNIQUE `(client_id, reward_id, journey_id)` parcial onde `status <> 'cancelado'`
- `decided_by`, `decided_at`, `justification`

**Audit:** reuso de `miles_audit_log` com `source_kind='reward_status_change'`.

**Seed idempotente** (`ON CONFLICT (tenant_id, reward_type) DO UPDATE`) dos 4 prêmios oficiais por tenant:
- Mimo 300 | Sessão 600 | Voucher R$300 900 | Ensaio 1200

**Marco Check-in (0):** ajustar `evaluate_client_milestones` para incluir threshold 0 + código `milestone_checkin` (concede registro sem milhas extras, idempotente).

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE` para `miles_ledger`, `client_seals`, `client_journey_milestones`, `reward_redemptions`.

## 2. Backend (`thermofit-client-app.functions.ts` e `thermofit-content.functions.ts`)

- `getClientMiles`: SOMENTE `SUM(miles)` de `miles_ledger` filtrado por `journey_id = clients.active_journey_id`. Remover subtração de spent.
- `listClientRewards`: retornar prêmios + estado computado por cliente (`bloqueado | liberado | solicitado | entregue`) baseado em saldo + `reward_redemptions` da jornada ativa, ordenados por `milestone_miles`.
- `requestRewardRedemption`: validar `saldo >= milestone_miles`, upsert em `reward_redemptions` com status `solicitado` (sem débito), respeitando UNIQUE; gravar audit.
- `decideRedemption` (admin): aceitar `entregue | cancelado`, gravar `decided_by/at`, `justification`, audit.
- `listClientNotifications` (novo, stub real): retorna últimos eventos relevantes do ledger/selos/marcos/redemptions; vazio = vazio.

## 3. App da Cliente — `src/routes/app.premios.tsx`

Reescrever para layout das referências:
- Cabeçalho ThermoFit + data + sino funcional (popover com lista ou "Você não tem notificações no momento.")
- Card premium "Saldo de Milhas" com saldo real
- Tabs segmentadas **Prêmios** / **Conquistas**
- Aba Prêmios: cards com ícone por tipo, nome, milhas, badge de estado (Faltam X / Liberado / Solicitado / Entregue). Botão "Solicitar prêmio" só quando `liberado`.
- Aba Conquistas: grade circular dourado/cinza, Selos (7/14/21/Programa) + Marcos (Check-in 0, 300, 600, 900, 1300) com estado real de `client_seals` e `client_journey_milestones`.

## 4. Realtime + invalidação cruzada

Hook `useRewardsRealtime(clientId)` em `app.premios.tsx`:
- `supabase.channel` em `miles_ledger`, `client_seals`, `client_journey_milestones`, `reward_redemptions` filtrado por `client_id`
- Em qualquer evento, `qc.invalidateQueries` para `client-miles`, `client-rewards`, `client-redemptions`, `client-achievements`, `journey-progress`, `today-mission-summary`.

Adicionar invalidação cruzada nas mutações já existentes (missões, hidratação, vídeos) para incluir `client-rewards` e `client-achievements`.

## 5. Painel Admin (`src/routes/premios.tsx` + perfil da cliente)

- Catálogo: manter CRUD existente, adicionar campo `reward_type` e `milestone_miles`.
- Lista de redenções: mostrar todos status, ação "Marcar entregue" / "Cancelar" com modal de justificativa.
- Perfil da cliente: nova seção "Prêmios e Conquistas" com saldo, lista por status, selos, marcos, histórico do ledger com origem.

## 6. `mission_settings`

Não destrutivo: garantir 8 chaves oficiais via `ensure_mission_settings` (já existe). Marcar chaves não oficiais como `active=false` apenas se forem aliases conhecidos; deixar não-listadas intactas.

## 7. Testes runtime

Script `bun` server-side em tenant de teste:
1. Conceder milhas → saldo refletido.
2. Solicitar prêmio → sem alteração de saldo.
3. UNIQUE bloqueia duplicata.
4. Admin entrega → audit gravado, saldo intacto.
5. Marco Check-in registrado em journey nova.
6. Selo 7 dias gera milhas via `award_miles`.

## Arquivos a alterar

- `supabase/migrations/*` (1 migração)
- `src/lib/thermofit-client-app.functions.ts`
- `src/lib/thermofit-content.functions.ts`
- `src/lib/thermofit-missions.functions.ts` (invalidação)
- `src/routes/app.premios.tsx` (reescrita)
- `src/routes/premios.tsx` (CRUD + redenções)
- `src/routes/clientes.$id.tsx` (seção)
- script `/tmp/rewards-e2e.ts`

## Limitações conhecidas

- Sino: implementa popover com lista derivada de eventos reais (sem tabela `notifications` dedicada); marcar-como-lido será visual local até o usuário pedir persistência.
- Imagens de prêmios: usar ícones Lucide (Gift/Sparkles/Ticket/Camera) — sem upload de imagem nesta entrega.
- Reativação administrativa pós-`entregue`: disponível via "Cancelar" + nova solicitação, conforme regra de unicidade parcial.

Confirma para eu executar tudo em uma única rodada?
