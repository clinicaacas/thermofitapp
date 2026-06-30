## Módulo Nutrição — Plano de Entrega

Entrega isolada, espelhando a arquitetura de Treinos sem tocá-lo. Não cria Milhas, pontos, check-ins ou gamificação. Treinos permanece pausado.

### 1. Banco (migrations)

**Tabelas novas (public):**
- `nutrition_plans` — `id, tenant_id, client_id, journey_id, title, general_guidance, status ('rascunho'|'publicado'|'arquivado'), created_by, updated_by, published_at, archived_at, created_at, updated_at`. Único parcial: `(client_id, journey_id) WHERE status='publicado'`.
- `nutrition_library_materials` — `id, tenant_id, title, category, description, storage_path, mime_type, size_bytes, status ('ativo'|'arquivado'), created_by, created_at, updated_at`.
- `nutrition_plan_materials` — `id, tenant_id, plan_id, library_material_id (nullable), storage_path (nullable, exclusivo), display_title, note, sort_order, origin ('exclusivo'|'biblioteca'), created_at, updated_at`. Check: exatamente um entre `library_material_id` e `storage_path`.
- Coluna `main_pdf_path` em `nutrition_plans` (PDF principal).

**RLS:**
- Staff do tenant: full access (via `is_tenant_member`).
- Super admin: global (via `is_super_admin`).
- Cliente final: SELECT no próprio `nutrition_plans` quando `status='publicado'` (via `client_id_for_user`); SELECT em `nutrition_plan_materials` do próprio plano publicado; SELECT em `nutrition_library_materials` referenciados pelos próprios materiais.
- GRANTs explícitos para `authenticated` e `service_role`.

**Triggers:**
- `nutrition_plans_archive_previous` — ao publicar, arquiva o publicado anterior da mesma (client, journey). Espelha `workout_plans_archive_previous`.
- `update_updated_at_column` em todas as tabelas.
- `validate_nutrition_material_tenant` — garante coerência tenant/plan.

**Função SECURITY DEFINER:**
- `can_access_nutrition_material(_user uuid, _name text)` — espelha `can_access_workout_material`. Path: `{tenantId}/plans/{planId}/...` ou `{tenantId}/library/{materialId}/...`. Bloqueia exclusivos para clientes apenas se o plano dela for publicado.

**Bucket:**
- `nutrition-materials` privado. Policies em `storage.objects` chamando `can_access_nutrition_material`.

### 2. Server functions (`src/lib/thermofit-nutrition.functions.ts`)

Todas com `requireSupabaseAuth`. Espelham `thermofit-workout-plans.functions.ts`.

- `listNutritionClientsOverview` — central admin: lista clientes com plano atual + status.
- `getNutritionPlanForAdmin({clientId})` — retorna plano publicado/rascunho + histórico arquivado + materiais.
- `upsertNutritionPlan` — cria/edita rascunho (title, guidance).
- `publishNutritionPlan({planId})` — valida (PDF OU guidance OU 1 material), publica, arquiva anterior via trigger.
- `archiveNutritionPlan({planId})`.
- `duplicateNutritionPlanAsDraft({planId})`.
- `uploadNutritionMainPdf({planId, base64, filename})` — valida MIME `application/pdf`, tamanho ≤15MB, grava em `{tenant}/plans/{planId}/main-{uuid}.pdf` via `supabaseAdmin` (dynamic import dentro do handler).
- `removeNutritionMainPdf({planId})`.
- `listNutritionLibrary({status?})`.
- `upsertNutritionLibraryMaterial`.
- `uploadNutritionLibraryFile({materialId, base64, filename})`.
- `archiveNutritionLibraryMaterial` / `restoreNutritionLibraryMaterial`.
- `attachLibraryMaterialToPlan({planId, libraryMaterialId, displayTitle?, note?, sortOrder?})`.
- `attachExclusiveMaterialToPlan({planId, base64, filename, displayTitle, note?})`.
- `updatePlanMaterial({planMaterialId, ...overrides})`.
- `removePlanMaterial({planMaterialId})`.
- `reorderPlanMaterials({planId, ids[]})`.
- `getClientNutritionPlanForApp({clientId})` — usado pelo App; só plano publicado da própria cliente; valida `clientId === client_id_for_user(auth.uid())` OU staff do tenant (preview).
- `fetchNutritionMaterial({kind:'plan-main'|'plan-material'|'library', id, planId?})` — autoriza por sessão, lê via `supabaseAdmin`, retorna `{base64, mime, filename}`. Espelha `fetchWorkoutMaterial`.

### 3. Frontend admin

- `src/routes/nutricao.tsx` — central admin com abas `Planos das clientes` (default) e `Biblioteca de materiais`.
- `src/routes/nutricao.cliente.$clientId.tsx` — editor do plano (rascunho, materiais, publicar, histórico).
- Componente `src/components/nutrition-plan-pdf-viewer.tsx` — wrapper sobre `react-pdf` (reusar pdfjs worker já configurado em `workout-plan-pdf-viewer.tsx`).
- `src/components/admin-client-nutrition-panel.tsx` — usado em `clientes.$id.tsx` para exibir status + botão `Gerenciar plano` (link para a rota acima).
- Item de menu em `src/components/app-sidebar.tsx`: `{ to: "/nutricao", label: "Nutrição", icon: Apple }`.

### 4. App da Cliente

- Reescrever `src/routes/app.nutricao.tsx`: consumir `getClientNutritionPlanForApp` com `useClientIdentity` e query key `["client-nutrition", tenantId, clientId, journeyId]`.
- Estados: sem plano / publicado.
- Botões `Ver plano` e `Ver material` abrem o `NutritionPlanPdfViewer` interno (fullscreen overlay mobile).
- `Baixar PDF` usa `fetchNutritionMaterial` + blob + `download` attribute (sem nova aba).
- Realtime: invalidar query em changes de `nutrition_plans` / `nutrition_plan_materials` filtrados pelo `client_id`.

### 5. Segurança

- Nenhuma URL assinada ou pública é retornada ao cliente.
- Validação MIME por header bytes (`%PDF-`) no servidor além da extensão.
- `fetchNutritionMaterial` aplica headers `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` quando ler via server function (retornamos base64, headers aplicados ao response da rota de download — usaremos a server fn diretamente, mesma estratégia do módulo Treinos).
- `journey_id` opcional; quando presente, valida pertencimento ao cliente/tenant.

### 6. Não escopo

- Sem alterações em `workout_plans`, `plan_exercises`, `exercises`, rotas `/exercicios`, `/treinos.cliente.*`, `app.treino.tsx` ou bucket `workout-materials`.
- Sem Milhas/missões/seals/check-ins de nutrição.
- Sem cálculo de dieta, prescrição automática ou cardápio padrão distribuído.

### 7. Testes runtime

Executados via Playwright + psql na cliente técnica isolada após a entrega (não nos pacientes reais). Cobrem A (rascunho), B (publicação + arquivamento anterior), C (App + visualizador interno + download), D (isolamento entre clientes + bloqueio de fetch cross-client).

### Detalhes técnicos

- Server fns ficam em `src/lib/thermofit-nutrition.functions.ts` (client-safe; `supabaseAdmin` é importado dinamicamente dentro de cada handler).
- `react-pdf` e `pdfjs-dist` já instalados (módulo Treinos).
- Migration única com 3 CREATE TABLE + GRANTs + RLS + policies + função + trigger.
- Bucket criado via `supabase--storage_create_bucket` separado da migration.
