# Picanha Tournament — Design da demo

## Objetivo

Criar uma demonstração local-first para torneios informais de pool português. O organizador usa um laptop; uma TV 16:9 em ecrã estendido apresenta sorteios, jogos e resultados. O produto substitui a folha Excel sem tornar a operação pesada e oferece momentos curtos de apresentação desportiva.

## Plataforma e limites

- Windows, distribuído como um único executável portátil, sem instalação e sem internet.
- React + TypeScript + Tauri; SQLite e backups em `data` junto ao executável.
- Idioma visível: português europeu.
- Ecrã de apresentação de referência: 2560×1440; operação funcional também a 1920×1080.
- A demo é para 4–32 jogadores.
- O fluxo, estados e informação são aprovados. A arte final, gráficos decorativos e direção de motion pormenorizada ficam deliberadamente para uma iteração posterior.

## Fluxo de ecrãs

1. **Início** — duas ações: `Novo torneio` e `Continuar torneio`; inclui `Carregar demonstração` determinística.
2. **Criar torneio** — formulário curto com nome, logótipo opcional, lista de jogadores, número de apurados e proposta automática de formato. A aplicação privilegia grupos de quatro e bracket com potência de dois; mostra alternativas justificadas e pré-eliminatória quando necessária.
3. **Sorteio** — todos os jogadores começam num pote único. A apresentação TV revela grupo e jogador; o laptop permite saltar a animação. A composição dos grupos e a hora do sorteio ficam gravadas.
4. **Fase de grupos** — o organizador abre qualquer jogo pendente a partir de uma ordem sugerida. O ecrã de resultado seleciona vencedor e bolas deixadas pelo derrotado; confirmar atualiza a classificação e disponibiliza `Apresentar resultado` na TV.
5. **Eliminatórias** — bracket estilo Mundial, com cruzamentos pré-definidos entre grupos. Apenas as vagas já decididas podem avançar. Resultados podem ser corrigidos até isso afetar partidas concluídas em rondas posteriores; nesse caso é necessária confirmação explícita para recalcular/remover o impacto.
6. **Campeão** — apresentação final curta, arquivamento do torneio e início de outro torneio.

## Modos de ecrã

| Modo | Laptop do organizador | TV em ecrã estendido |
|---|---|---|
| Operação | Formulários, estado dos jogos, classificação, ações de correção e botão `Apresentar` | Não abre conteúdo próprio |
| Apresentação | Controlos privados: saltar, mute e voltar à operação | Conteúdo fullscreen: sorteio, resultado confirmado e campeão |

O som inicia a 40%. A TV tem mute sempre acessível. Animações duram 2–5 segundos e são saltáveis pelo organizador.

## Regras do torneio

- Grupos iguais de 3, 4 ou 5 jogadores; grupos de quatro são a recomendação preferencial.
- Todos contra todos, sem empate, uma partida por confronto no MVP.
- Vitória: três pontos.
- Desempate: pontos, menos bolas deixadas na mesa pelo jogador derrotado, confronto direto, sorteio.
- Uma desistência mantém jogos anteriores; os jogos futuros tornam-se vitórias administrativas, registadas com todas as bolas deixadas pelo desistente.
- Quando não houver formato justo, a aplicação propõe uma pré-eliminatória transparente. Sem ranking, os participantes dessa ronda são sorteados; um ranking futuro pode isentar cabeças de série.
- A fase final usa bracket de potência de dois e emparelhamentos estilo Mundial.

## Dados e segurança operacional

- SQLite local guarda torneios, jogadores, sorteios, grupos, jogos, correções e estado atual.
- Autosave depois de cada ação; ao reabrir, a aplicação oferece retomar o torneio em curso.
- Exportação manual de backup para transporte/arquivo.
- A demo retém todos os torneios, mas a interface inicial só expõe `Novo torneio` e `Continuar torneio`; uma página de histórico é fase posterior.

## Estados importantes

- Formato proposto, alternativo, e bloqueado por falta de equidade.
- Sorteio em curso, concluído e auditável.
- Jogo pendente, pronto a confirmar, confirmado, vitória administrativa e corrigido.
- Classificação provisória e apurados definidos.
- Eliminatória bloqueada, vaga conhecida, jogo concluído e invalidada por correção.
- Recuperação após fecho inesperado e exportação de backup.

## Direção de interface

Operação e apresentação são superfícies diferentes: a primeira privilegia leitura, confirmação e prevenção de erro; a segunda privilegia nomes, resultado e contexto de fase. O nome provisório é **Picanha Tournament**. O visual pretendido é uma emissão desportiva premium, com atmosfera escura e verde de mesa como destaque; não utiliza branding ou assets de Clash. A concretização de ilustrações, troféu, texturas, transições e gráficos é uma decisão de design posterior, não um bloqueio do motor de torneio.

## Critérios de aceitação da demo

- Um organizador cria, sorteia e termina um torneio fictício de 16 jogadores sem usar Excel.
- A aplicação explica a proposta de formato e não deixa avançar com uma composição de grupos injusta sem pré-eliminatória.
- A TV mostra pelo menos sorteio, confirmação de resultado e campeão em fullscreen.
- A classificação aplica os critérios definidos e o bracket avança automaticamente.
- Um resultado pode ser corrigido de forma segura.
- O torneio sobrevive ao encerramento/reabertura e pode ser exportado.
