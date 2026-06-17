# Plano — Vacuum / Cintura Ativa

Escopo grande. Vou dividir em 4 fases entregáveis em sequência, cada uma testável.

## Fase A — Banco + Storage

Novas tabelas (mantendo `client_vacuum_sessions` existente):

- `vacuum_settings` (por tenant): title, subtitle, practice_tab_label, guide_tab_label, card_eyebrow, card_title, card_subtitle, estimated_time, button_text, skip_guide_text.
- `vacuum_exercises` (por tenant): order_index, name, short_description, prescription_text, thumbnail_url, status.
- `vacuum_guide_pages` (por tenant): order_index, title, image_url, alt_text, status.
- `client_vacuum_events` (por tenant + client): event_type, metadata, created_at.

Bucket de storage `vacuum-assets` (público) para miniaturas dos exercícios e imagens das páginas do guia. RLS: leitura pública; escrita só para `admin/dono/super_admin` do tenant.

Seed automático na primeira leitura por tenant: 5 exercícios e 12 páginas (com `image_url` vazia até admin subir).

## Fase B — App da Cliente `/app/vacuum`

Reescrever a rota com a paleta bege/dourada existente (`ClientAppShell` já usa essa paleta):

- Header "MÉTODO THERMOFIT" + "Cintura" (preto) + "Ativa" (dourado) + subtítulo.
- Tabs: **Praticar** | **Guia Completo**.
- **Praticar**: card protocolo + lista dos 5 exercícios (vindos do banco) + botão "Começar Treino" que registra `client_vacuum_events { event_type: 'treino_iniciado' }` e mostra feedback "Treino iniciado."
- **Guia Completo**: visualizador paginado 1/12 com barra de progresso dourada, imagem central, botões Anterior/Próximo (último vira "Começar a Praticar" e troca aba), dots indicadores, link "Pular guia e ir direto para a prática".

## Fase C — Admin (Configurações > App da Cliente > Vacuum / Cintura Ativa)

Nova sub-seção dentro de `app-client-settings.tsx`:

- Bloco **Praticar**: editar textos + CRUD/reordenar/ativar exercícios + upload de thumbnail.
- Bloco **Guia Completo**: lista das 12 páginas, editar título/alt, substituir imagem (upload), reordenar, ativar/inativar. Aviso de fallback para upload de imagens individuais (sem conversão automática de PDF nesta fase).

## Fase D — Preview do App

Garantir que o componente Preview renderize a mesma rota `/app/vacuum` (mesmo componente). Atualizar lista de telas do preview para incluir "Vacuum" se ainda não estiver.

## Detalhes técnicos

- Server fns em `src/lib/thermofit-vacuum.functions.ts` (público de leitura via publishable client; mutações via `requireSupabaseAuth` + check de papel).
- RLS: leitura por `is_tenant_member` ou pelo cliente vinculado (`tenant_id_for_client_user`); escrita por `is_profile_manager`.
- Eventos: insert via `requireSupabaseAuth` validando que o `auth.uid()` corresponde ao `client_id`.
- Não toco no menu lateral nem crio rota nova; apenas reescrevo `src/routes/app.vacuum.tsx`.

## Confirmações antes de começar

1. Posso seguir com **4 PRs internos** (A→D) nesta mesma conversa, em sequência? Cada fase deixa o sistema funcional.
2. **Conversão automática de PDF**: confirmo que NÃO será implementada agora (runtime serverless não suporta libs nativas). Admin sobe as 12 imagens manualmente — ok?
3. Posso criar o bucket `vacuum-assets` como **público** (leitura)? É o padrão para imagens de guia exibidas no app.
