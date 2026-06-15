## ThermoFit Acas — Plano de Implementação por Fases

Esta é uma reconstrução grande dos módulos operacionais. Vou trabalhar em **5 fases independentes**, validando cada uma antes de avançar. Nenhuma fase mexe em login, Super Admin, autenticação ou Configurações já corrigidas.

### Princípios
- **Banco como fonte da verdade** — nada de localStorage/mock como destino final.
- **Tudo via `createServerFn`** (RPC tipado) + RLS por `tenant_id`.
- **Reaproveitar** componentes da área da cliente no preview do admin.
- **Não tocar**: `/login`, `/setup-admin`, `auth-gate`, `auth-context`, Super Admin, white label.

---

### FASE 1 — Painel Administrativo Básico

**Migração de banco (uma migração só):**
- `clients` (tenant_id, name, email, phone, birth_date, start_date, plan, goal, complaint, clinical_notes, hydration_goal_ml, status, days_in_program, …)
- `risk_alerts` (tenant_id, client_id, type, description, severity, resolved_at, …)
- `messages` (tenant_id, client_id?, template, body, channel='manual', sent_by, …)
- `approvals` (tenant_id, client_id, type, status, responsible_id, …)
- `consents` (tenant_id, client_id, terms, privacy, data_processing, photos_internal, photos_marketing)
- `audit_logs` (tenant_id, actor_id, action, entity, entity_id, metadata)
- GRANTs + RLS via `is_profile_manager(auth.uid(), tenant_id)`.

**Server fns:** `clients.list/create/get/update/resetPassword`, `alerts.list/resolve`, `messages.list/create`, `approvals.list/approve/reject`.

**Rotas:**
- `/dashboard` — cards reais (ativas, alertas, aprovações) + alertas recentes
- `/clientes` — listagem + botão Nova
- `/clientes/nova` — formulário completo (dados, plano, hidratação, LGPD) → cria cliente + consents + audit log
- `/clientes/$id` — perfil (topo, cards, ações). Botão WhatsApp abre apenas template (sem envio real)
- `/alertas`, `/mensagens` (templates rápidos, contador, salva manual), `/aprovacoes`

**Teste:** criar cliente, atualizar página, ver persistência.

---

### FASE 2 — Conteúdos e Relatórios

**Migração:**
- `videos` (title, type, release_day, phase, miles_on_complete, min_pct, description, file_url, active)
- `exercises` (category, name, description, instructions, active)
- `rewards` (name, description, type, miles_cost, stock, status, rules, image_url)
- `reward_redemptions` (client_id, reward_id, status)
- Seed inicial: categorias e exercícios listados no prompt.

**Rotas:** `/videos`, `/videos/nova`, `/exercicios`, `/premios`, `/premios/catalogo`, `/relatorios` (filtros 7/30/Tudo + tabela engajamento), `/lgpd` (consents + audit_logs).

Aviso amigável quando upload R2 não configurado (não quebra a tela).

---

### FASE 3 — App da Cliente (Mobile)

- Layout mobile-first separado (`/app/*` ou subdomínio interno), header ThermoFit, bottom nav.
- Módulos: Início, Missões, Vídeos, Água, Vacuum, Fotos, Pulso, Milhas, Passaporte, Prêmios, Nutrição, Treino, Cartas, Ajuda, Privacidade.
- Tela **Falar com a equipe** completa conforme print (botões rápidos, textarea 500, envio salva em `help_messages` + cria alerta quando aplicável).
- Sem WhatsApp real.

**Migração:** `help_messages`, regras de criação de alerta.

---

### FASE 4 — Preview do App no Admin

- Local: **Configurações → Preview do App da Cliente**.
- Seletor de cliente, moldura mobile (iframe ou componente embutido), navegação entre módulos.
- **Reaproveita** componentes da Fase 3 em modo somente-leitura.
- Atualização em tempo real conforme a equipe edita textos (estado local → persistência ao salvar).

---

### FASE 5 — Configurações do App da Cliente

**Migração:**
- `client_app_settings` (tenant_id, identity jsonb, colors jsonb, welcome_text, …)
- `app_module_settings` (tenant_id, module_key, enabled)
- `app_templates` (tenant_id, kind, key, content)
- Regras de alerta por botão rápido.

**Nova aba "App da Cliente"** em Configurações:
- Identidade (nome, subtítulo, cores, boas-vindas)
- Toggle de módulos
- Textos da tela "Falar com a equipe"
- Templates (mensagem, ajuda, pulso, alertas)
- Regras (botões → alerta de alta prioridade, máx caracteres, responsável padrão)

App da cliente e Preview leem desses registros — nada hardcoded.

---

### Auditoria / LGPD (transversal a todas as fases)
`audit_logs` registrando: criar/editar cliente, ver dados sensíveis, alterar consentimentos, mensagens, alertas, aprovações, abrir preview, editar configurações/textos/templates/permissões.

---

### Como avançar
Cada fase = um lote de migração + servidor + rotas + teste. **Começo pela Fase 1**. Só vou para a Fase 2 quando você confirmar que clientes/alertas/mensagens/aprovações persistem corretamente.

**Confirma para eu iniciar pela Fase 1 (migração + módulos do painel)?**
