# Migração para outro Supabase — pacote de exportação seguro

## Por que não vou construir o "Painel de Migração" como especificado

A especificação pede três coisas que entregam controle total do banco a qualquer pessoa com o link:

- Uma página pública que exibe a **service role key** e todos os secrets do projeto.
- Uma função `exec_sql` que executa SQL arbitrário no banco.
- Uma função pública que devolve `Deno.env.toObject()` (todos os secrets).

Publicado, isso permite ler, alterar e apagar qualquer dado ignorando RLS. Apagar a página depois não resolve: as chaves expostas continuam válidas até serem rotacionadas.

Dois pontos de fato deste projeto: no Lovable Cloud a service role key e a senha do banco não são acessíveis, e este stack é TanStack Start (não há `App.tsx` nem `ProtectedRoute`), então a rota especificada não se aplica como escrita.

## O que entrego no lugar (mesmo objetivo, sem exposição)

### 1. Dump completo do schema
Arquivo `.sql` gerado no ambiente de trabalho, contendo, na ordem correta de aplicação:
- tipos/enums, tabelas do schema `public` e constraints
- GRANTs, `ENABLE ROW LEVEL SECURITY` e todas as policies
- funções e triggers
- definição dos buckets de storage e suas policies

### 2. Dump de dados
Arquivo `.sql` com `INSERT`s das tabelas do `public`, respeitando ordem de dependência de chaves estrangeiras.

### 3. Usuários de autenticação
Exportação dos usuários com senhas em hash bcrypt — as senhas continuam válidas no destino. Sessões antigas caem quando o JWT secret muda; é esperado.

### 4. Lista de secrets a recriar
Apenas os **nomes** dos secrets usados pelo backend, para você recadastrar manualmente no destino. Nenhum valor é impresso, salvo ou versionado.

### 5. Inventário do backend em código
As funções de servidor já vivem no repositório (`src/lib/*.functions.ts`, `src/routes/api/*`). Entrego um índice do que existe e do que precisa de variável de ambiente no destino, sem extrair nada novo.

## Como você usa

1. Baixa os arquivos gerados.
2. Aplica `schema.sql` e depois `data.sql` no Supabase de destino.
3. Importa os usuários.
4. Recadastra os secrets pela lista de nomes.
5. Aponta as variáveis de ambiente do app para o novo projeto.

## Detalhes técnicos

- A geração é feita por leitura direta do catálogo do Postgres (`pg_catalog`/`information_schema`) a partir do ambiente de build, sem criar nenhuma função `exec_sql` nem endpoint público.
- Nenhuma rota nova é adicionada ao app; nada fica publicado.
- Nenhum arquivo com valor de credencial é escrito no repositório — apenas os artefatos de saída em `/mnt/documents`.
- Nenhuma alteração é feita no banco atual.
