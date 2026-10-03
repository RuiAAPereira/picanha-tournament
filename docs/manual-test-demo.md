# Teste manual: torneio no portátil com a TV

Guião de aceitação para o operador. Cada passo indica o que fazer e o que deve acontecer. Assinale cada linha ao concluir; anote qualquer diferença.

## Pré-requisitos

- Portátil com Windows 11 (já inclui o WebView2).
- TV ligada por HDMI, configurada como **ecrã alargado** (Definições → Sistema → Ecrã → "Expandir estes ecrãs"), de preferência a 1920×1080.
- Som da TV ou colunas ligadas ao portátil.
- O executável `picanha-tournament.exe` (gerado em `src-tauri/target/release/` por `npm run tauri build`).

## Preparar a pasta

1. Crie uma pasta onde o utilizador possa escrever, por exemplo `C:\Torneio` ou uma pen USB. **Não** use `C:\Program Files`.
2. Copie `picanha-tournament.exe` para essa pasta e abra-o com duplo clique.
3. Esperado: abre a janela do operador em "Início". A pasta `data\`, com `picanha-tournament.sqlite`, é criada ao lado do executável ao abrir a aplicação (ou, o mais tardar, ao guardar). Não é preciso internet, conta nem instalação.

## Lista de verificação

| N.º | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Em "Início", clique em **Novo torneio**, dê um nome e inscreva 16 jogadores fictícios (botão **Adicionar**). | O formato recomendado é "4 grupos de 4, com fase final de 8 (apuram-se os 2 primeiros de cada grupo)". |
| 2 | Clique em **Criar e sortear**. Na página "Sorteio", **antes** de sortear, clique em **Apresentar**. | Com o ecrã alargado, a apresentação abre logo em ecrã inteiro na TV, sem ser preciso arrastá-la. Se abrir no portátil e tiver de a arrastar, registe-o como desvio. (Só com um ecrã, abre numa janela de 1280×720.) A TV mostra o nome do torneio, sem botões do operador (apenas **Silenciar**). |
| 3 | Sem tocar na TV, clique em **Sortear**. | Aparecem os quatro grupos no portátil e o estado de gravação mostra "Guardado". A TV mostra o sorteio com animação. Anote se o som tocou. |
| 4 | Clique em **Continuar para os grupos** e registe um resultado de grupo (vencedor e bolas deixadas pelo derrotado), ainda sem tocar na TV. | A TV mostra o resultado com animação de cerca de 3 s. Anote se o som tocou sem clicar na TV. Se a TV mostrar "Clique no ecrã para ativar o som" (aceitável), clique uma vez na TV; a partir daí o som toca sem mais cliques. A classificação do grupo é atualizada no portátil. |
| 5 | Registe outro resultado de grupo. | A TV mostra o resultado com animação e som, sem pedir outro clique. |
| 6 | Registe outro resultado e clique em **Saltar** durante a animação. | A TV mostra logo o estado final da animação. |
| 7 | Clique em **Silenciar** no portátil; registe um resultado. Depois clique em **Ativar som** na TV. | Com som desligado não se ouve nada. O botão na TV e no portátil mostram sempre o mesmo estado. |
| 8 | Registe dois ou três resultados seguidos, rapidamente. | A TV termina no último resultado, sem mostrar um resultado antigo por cima de um novo. |
| 9 | Feche a janela da TV e clique de novo em **Apresentar**. Faça duplo clique em **Apresentar**. | A TV reabre a mostrar o estado atual e só abre uma janela. O torneio no portátil nunca para. |
| 10 | Termine os grupos. Em **Ver fase final**, registe os quartos-de-final e uma meia-final. | Os jogos seguintes ficam com os jogadores apurados. |
| 11 | Corrija um resultado de quarto-de-final, mudando o vencedor (**Corrigir**). | Aparece "Esta correção anula jogos já definidos" com a lista dos jogos afetados. **Cancelar** deixa tudo como estava. **Confirmar correção** limpa esses jogos e a TV mostra "Resultado corrigido". |
| 12 | Registe a outra meia-final e a final. | O portátil mostra "Campeão: …". A TV mostra o campeão e o finalista vencido. |
| 13 | Feche a aplicação (a janela do operador). | A janela da TV também fecha. |
| 14 | Abra de novo o executável e clique em **Continuar torneio**. A aplicação abre em "Grupos"; abra **Ver fase final**. | O torneio volta exatamente como estava, com o campeão. Ao abrir **Apresentar**, a TV mostra o campeão sem animação. |
| 15 | Clique em **Exportar cópia de segurança**. | Aparece "Cópia de segurança exportada: …". O ficheiro está em `data\backups\` ao lado do executável. |
| 16 | (Opcional) Copie o executável para uma pen USB protegida contra escrita, ou para uma pasta onde a escrita esteja negada em Propriedades → Segurança, e abra-o. (O atributo "Só de leitura" de uma pasta não chega no Windows.) | A aplicação abre e avisa que a pasta de dados não permite escrita. É possível usá-la, mas o torneio não fica guardado. |
| 17 | Em "Início", clique em **Carregar demonstração**. Se houver um torneio por terminar, confirme a substituição. A aplicação abre em "Grupos"; abra **Ver fase final**. | Abre o "Torneio de demonstração", com 16 jogadores. Os grupos e os quartos-de-final estão jogados, tal como a 1.ª meia-final (Beatriz venceu Nuno). Faltam a 2.ª meia-final (Carla contra Marta) e a final. A demonstração passa a ser o torneio em curso; o torneio anterior fica registado na base de dados, mas nesta versão não pode voltar a ser aberto na aplicação. |
| 18 | Em **Ver fase final** da demonstração, registe a 2.ª meia-final e a final. | A TV mostra o resultado e depois o campeão. Corrigir o quarto-de-final "Carla contra Tiago" pede confirmação e lista a 2.ª meia-final e a final. |
| 19 | Crie um torneio com **13 jogadores**. | O formato recomendado é "3 grupos de 4, após 1 pré-eliminatória com 2 jogadores sorteados; 1 vencedor avança para os grupos, com fase final de 4 (apuram-se os vencedores dos grupos e o melhor segundo classificado)". No sorteio, a TV mostra o lugar do vencedor como "Vencedor PE 1". Depois da pré-eliminatória, o grupo passa a mostrar o vencedor. Todas as alternativas propostas têm grupos iguais: um número de jogadores que não dá grupos iguais passa sempre por uma pré-eliminatória. |
| 20 | Em **Novo torneio**, inscreva só 3 jogadores. | **Criar e sortear** fica desativado e aparece a explicação "O torneio requer 4 a 32 jogadores." A criação só é bloqueada fora de 4 a 32 jogadores. |
| 21 | Com a TV a 1920×1080, veja o sorteio, um resultado e o campeão a cerca de 3 m. | Os nomes leem-se sem cortes nem sobreposições. Os grupos cabem no ecrã. |

## Verificações da apresentação (pendentes da tarefa 7)

Faça estas verificações em `npm run tauri dev` ou com o executável:

- Abrir, fechar e reabrir a TV. Duplo clique em **Apresentar** abre uma só janela.
- Reiniciar a aplicação: a TV reaberta mostra o estado guardado, sem animação.
- As animações duram cerca de 3 s. **Saltar** termina-as logo.
- Sorteios grandes cabem a 1440 e a 1080 de altura:
  - 31 jogadores (7×4+3)
  - 32 jogadores (8×3+8)
  - 32 jogadores (10×3+2)
  - 29 jogadores (5×5+4)
  - 11 jogadores (2×5+1)
- O aviso "Clique no ecrã para ativar o som" desaparece com um clique na TV.
- Silenciar no portátil ou na TV fica sincronizado nos dois lados.
- Vários resultados rápidos: a TV termina no último.
- Com "movimento reduzido" ativo no Windows, as atualizações aparecem sem animação.
- Fechar a janela do operador fecha a TV.
- Só em `npm run tauri dev` (o executável final não tem ferramentas de programador): nas ferramentas de programador da TV, `invoke('load_current_tournament')` é recusado.

## Se algo falhar

O torneio continua sempre no portátil, mesmo sem TV. Anote o número do passo, o que viu e, se possível, guarde uma cópia de segurança antes de fechar a aplicação.
