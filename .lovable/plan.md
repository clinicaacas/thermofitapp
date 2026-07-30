# Conectar um Supabase externo (cliente secundário)

## Contexto importante

Este projeto roda no Lovable Cloud. O backend gerenciado **não pode ser substituído** aqui: todas as tabelas, RLS, storage, triggers e server functions do ThermoFit dependem dele. Desativar o Cloud não é possível neste projeto.

O que dá para fazer sem quebrar nada: adicionar o seu Supabase externo como uma **segunda conexão**, usada apenas onde você indicar. O backend atual continua intacto.

## O que será implementado

1. **Cliente externo isolado**
   - Novo módulo `src/integrations/supabase-external/client.ts` com a URL e a chave anon do seu projeto.
   - Sessão não persistida e sem auto-refresh, para não conflitar com o login atual do app.
   - Nome de export distinto (`supabaseExternal`) para nunca ser confundido com o cliente do Cloud.

2. **Acesso pelo servidor**
   - Módulo `src/lib/external-supabase.functions.ts` com uma server function de teste (`pingExternalSupabase`) que valida a conexão e retorna sucesso/erro legível.
   - Nenhuma chave privilegiada em código; se depois for preciso service role, ela entra como secret do projeto.

3. **Tela de verificação**
   - Um bloco simples em Configurações mostrando o status da conexão externa (URL do projeto, conectado/erro), sem expor chaves.

4. **Sem alterações no restante**
   - Nenhuma migração no banco atual, nenhum módulo existente (Missões, Vídeos, Nutrição, Treinos, Suporte) é tocado.

## O que preciso de você

- **URL do projeto externo** (ex.: `https://xxxx.supabase.co`)
- **Chave anon / publishable** do mesmo projeto

A chave anon é pública por design, então pode ser colada no chat. Não envie a service role no chat — se for necessária, eu abro o formulário seguro de secret.

## Detalhes técnicos

- Chave anon vai para variáveis `VITE_EXTERNAL_SUPABASE_URL` / `VITE_EXTERNAL_SUPABASE_ANON_KEY` no código do cliente externo.
- O cliente externo usa `persistSession: false` e `storageKey` próprio, evitando colisão de sessão com o Cloud no `localStorage`.
- As leituras externas respeitam a RLS do **seu** projeto; políticas e grants lá são responsabilidade do seu Supabase.
- Depois disso, você me diz quais telas/dados devem passar a ler do externo e eu migro caso a caso.
