## Objetivo

Separar com segurança **equipe interna** (painel admin) e **cliente final** (app de acompanhamento). Hoje só existe o papel `profile_role = super_admin|dono|admin|equipe` e o app da cliente é acessado por `?clientId=` (preview), sem login da cliente. Vamos adicionar um papel **cliente** real, com login próprio, criado dentro do perfil da cliente, com redirecionamento e guards corretos.

---

## 1. Banco de dados (migração)

- Adicionar enum value `cliente` em `public.profile_role` (`ALTER TYPE ... ADD VALUE 'cliente'`).
- Tabela `clients`: adicionar
  - `auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`
  - `access_email text`
  - `access_status text DEFAULT 'sem_acesso'` (`ativo|inativo|bloqueado|sem_acesso`)
  - `last_access_at timestamptz`
- Function SECURITY DEFINER `public.client_id_for_user(uuid)` → retorna `clients.id` do `auth_user_id`.
- RLS nas tabelas do app da cliente (`client_missions`, `client_mission_completions`, `client_hydration_logs`, `client_letters`, `client_progress_photos`, `client_vacuum_sessions`, `client_weekly_pulse`, `client_nutrition_plans`, `client_workout_plans`): adicionar policy `SELECT/INSERT/UPDATE` para o próprio usuário cliente via `client_id_for_user(auth.uid()) = client_id`.
- Manter policies existentes da equipe (via `is_tenant_member`).

## 2. Auth / criação de acesso

Novas server functions em `src/lib/thermofit-data.functions.ts` (auth + admin):

- `adminCreateClientAccess({ clientId, email, password })` — usa `supabaseAdmin.auth.admin.createUser` com `email_confirm: true` e `user_metadata: { profile: 'cliente', client_id }`, cria/atualiza `profiles` com `profile='cliente'`, atualiza `clients.auth_user_id/access_email/access_status='ativo'`.
- `adminResetClientPassword({ clientId, password })` — gera senha temporária via `auth.admin.updateUserById`.
- `adminSetClientAccessStatus({ clientId, status })` — atualiza status (`ativo|inativo|bloqueado`); `bloqueado` chama `auth.admin.updateUserById` com `ban_duration` ou `app_metadata.banned`.
- Todas com `requireSupabaseAuth` + checagem `is_profile_manager` do tenant da cliente.

## 3. Login e redirecionamento

`src/lib/thermofit-auth.functions.ts > getCurrentUserProfile`:

- Se `profiles.profile === 'cliente'`, retornar `{ kind: 'client', clientId, tenantId }` em vez do `TeamUser` interno.

`src/lib/auth-context.tsx`:

- Estado `user` ganha discriminador `kind: 'team' | 'client'`.
- Após `signIn` bem-sucedido, retornar também `kind` para o login decidir destino.

`src/routes/login.tsx`: após `signIn` ok, `navigate({ to: kind === 'client' ? '/app' : '/dashboard' })`.

`src/components/auth-gate.tsx`:

- Se `user.kind === 'client'` e pathname não começa com `/app` → redirecionar para `/app`.
- Se `user.kind === 'team'` e pathname começa com `/app` sem `?previewClientId` → redirecionar para `/dashboard`.
- Manter rotas públicas atuais.

## 4. App da cliente sem `?clientId`

Hoje todas as rotas `/app/*` recebem `clientId` pela URL. Vamos:

- Novo hook `useCurrentClientId()` que devolve, na ordem:
  1. `previewClientId` da query (apenas se `user.kind === 'team'` e is_profile_manager — modo preview admin)
  2. `clientId` do `user` quando `kind === 'client'`
- Trocar `useSearch({ from: '/app/' }).clientId` por esse hook em todas as rotas `/app/*` (mantendo compat: a rota ainda aceita `clientId`/`previewClientId` no `validateSearch`).

## 5. UI — perfil da cliente (`src/routes/clientes.$id.tsx`)

Novo card **"Acesso da Cliente"**:

- Mostra: email de acesso, status (badge), último acesso, link `/login`.
- Botões: **Criar acesso** (dialog com email + senha + confirmar) · **Redefinir senha** · **Copiar dados de acesso** (gera o texto do brief) · **Inativar acesso** / **Reativar**.
- Usa as server fns do passo 2 + invalida `['client', id]`.

## 6. UI — Configurações > Usuários e Equipe

- `src/routes/configuracoes.tsx` (modal Adicionar usuário): remover qualquer opção "cliente" do select; manter só perfis internos. Filtrar listagem por `profile != 'cliente'` (defensivo — server fn já deveria, mas conferir).

## 7. Preview do App

`src/components/client-app-preview.tsx`:

- "Abrir em nova aba" passa a usar `?previewClientId=<id>` em vez de `?clientId=<id>` (combina com o guard no passo 3/4).
- Iframe interno usa o mesmo parâmetro.

## 8. Testes manuais (validar após)

Os 10 cenários do pedido do usuário (criar interno, criar cliente, criar acesso, login da cliente vai para `/app`, cliente bloqueada de `/dashboard`, admin não cai em `/app`, preview abre cliente certa, etc.).

---

## Detalhes técnicos relevantes

- `profile_role` é enum Postgres → `ADD VALUE 'cliente'` precisa ser feito antes de qualquer policy/função que faça cast para o tipo; rodar em migração isolada antes das policies (mesma migração funciona se a referência ao novo valor estiver em DO block).
- `clients.auth_user_id` precisa ser nullable e único parcial (`UNIQUE` aceita múltiplos NULL no Postgres, ok).
- `client_id_for_user` deve ser SECURITY DEFINER e SET search_path = public para não recursar nas policies.
- Função `adminCreateClientAccess` precisa carregar `supabaseAdmin` dentro do `.handler()` (regra de import-graph).
- `auth-context` atualmente assume `TeamUser`; será preciso ajustar tipos sem quebrar telas que leem `user.profile`/`user.name` (cliente também terá `name`/`email`, mas `profile = 'cliente'`).
- Manter compat: rotas `/app/*` ainda funcionam com `?clientId=` para não quebrar links já abertos; só priorizar `previewClientId` quando admin logado.

## Fora de escopo

- Trocar texto/branding do login para clientes.
- Auto-envio de email com credenciais (continua sendo "copiar e enviar manualmente").
- Tela `/app/login` separada (login único em `/login` redireciona por papel, conforme item 5 do pedido).
