# ThermoFit Base

Crie a estrutura visual inicial de um sistema web chamado “ThermoFit — Clínica Acas”, seguindo exatamente o estilo do print enviado: layout limpo, moderno, com menu lateral fixo à esquerda, fundo claro no light mode e preto no dark mode.

IMPORTANTE:

- Não crie conteúdo interno nos módulos.

- Não crie cards, gráficos, tabelas, textos explicativos, dados fictícios ou dashboards preenchidos.

- Cada módulo deve existir apenas como rota/tela vazia, com o título discreto da página se necessário.

- O foco desta tarefa é criar somente a estrutura base do sistema: layout, menu lateral, topo, alternância de tema e área de usuário.

ESTRUTURA DO SISTEMA:

1. Nome do sistema:

No topo do menu lateral, colocar:

- Ícone quadrado escuro com símbolo minimalista relacionado ao ThermoFit.

- Texto principal: “ThermoFit”

- Texto secundário menor: “Clínica Acas”

2. Menu lateral:

Criar um sidebar fixo à esquerda, com largura parecida com o print, visual leve, espaçamento confortável e ícones minimalistas.

Os itens do menu devem ser:

- Dashboard

- Clientes

- Alertas

- Mensagens

- Aprovações

- Vídeos

- Exercícios

- Prêmios

- Relatórios

- LGPD

- Configurações

Cada item deve ter:

- Ícone à esquerda

- Nome do módulo

- Estado ativo com fundo azul bem claro no light mode

- Estado ativo no dark mode com fundo cinza escuro/preto mais claro

- Texto do item ativo em azul

- Hover suave

O item “Exercícios” deve vir ativo inicialmente, igual ao print.

3. Rotas / páginas:

Criar uma rota para cada módulo:

- /dashboard

- /clientes

- /alertas

- /mensagens

- /aprovacoes

- /videos

- /exercicios

- /premios

- /relatorios

- /lgpd

- /configuracoes

Dentro de cada rota, não adicionar conteúdo funcional.

Apenas deixar a área principal vazia ou com um título simples e discreto do módulo, sem cards e sem dados.

4. Área superior:

Criar uma barra superior no conteúdo principal, alinhada à direita, contendo:

- Um botão/ícone de alerta/notificações

- Um botão para alternar entre light mode e dark mode

O botão de tema deve alternar corretamente:

- Light mode: fundo branco/cinza claro, textos escuros

- Dark mode: fundo preto real, sidebar preta/cinza muito escura, conteúdo preto, textos claros

IMPORTANTE SOBRE DARK MODE:

O dark mode deve ser preto ou quase preto.

Não usar azul como fundo principal.

Pode usar azul apenas em pequenos detalhes, como item ativo ou ícones.

5. Rodapé do menu lateral:

Na parte inferior do sidebar, adicionar a área da usuária logada:

Nome:

“Dra. Cynara Acas”

Cargo:

“Super Admin”

Adicionar também um botão pequeno de sair com texto:

“Sair”

O botão de sair deve ter ícone e visual discreto.

6. Estilo visual:

Seguir o visual do print:

- Minimalista

- Profissional

- Espaçamento limpo

- Bordas suaves

- Ícones finos

- Fonte moderna

- Sem poluição visual

- Sem excesso de cores

- Sidebar clara no light mode

- Sidebar preta/cinza escura no dark mode

7. Responsividade:

O sistema deve funcionar bem em desktop.

Em telas menores, o sidebar pode recolher ou se adaptar, mas a prioridade é desktop.

8. Restrições:

- Não implementar login agora.

- Não implementar banco de dados agora.

- Não implementar funcionalidades internas dos módulos agora.

- Não adicionar dados fictícios.

- Não criar gráficos.

- Não criar tabelas.

- Não criar cards de dashboard.

- Não alterar o nome do sistema.

- Não usar fundo azul no dark mode.

Resultado esperado:

Entregar a base visual navegável do sistema “ThermoFit — Clínica Acas”, com menu lateral, rotas dos módulos, modo claro/escuro, topo com alerta e alternância de tema, e rodapé do sidebar com “Dra. Cynara Acas”, “Super Admin” e botão “Sair”.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://thermofitapp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1dc001d0-eeec-4792-b760-f885d722c014).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
