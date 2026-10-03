# Picanha Tournament

Aplicação local, para Windows, que gere torneios de pool português de 4 a 32 jogadores. Cobre a inscrição, a proposta de formato, o sorteio, os grupos, a fase final e a correção de resultados. Uma segunda janela mostra o sorteio, os resultados e o campeão na TV (ecrã alargado).

Funciona sem internet, sem conta e sem instalação. Os dados ficam numa pasta `data` ao lado do executável.

## Desenvolvimento

Requer Node.js, Rust e os [pré-requisitos do Tauri 2](https://tauri.app/start/prerequisites/) para Windows.

```sh
npm install
npm test                                       # testes (Vitest)
npm run typecheck                              # verificação de tipos
cargo test --manifest-path src-tauri/Cargo.toml  # testes do armazenamento (Rust)
npm run tauri dev                              # aplicação em modo de desenvolvimento
npm run tauri build                            # executável portátil
```

## Executável e dados

- `npm run tauri build` gera o executável portátil `src-tauri/target/release/picanha-tournament.exe`. Não há instalador.
- Copie o executável para uma pasta onde o utilizador possa escrever, por exemplo `C:\Torneio` ou uma pen USB.
- O torneio é guardado em `data\picanha-tournament.sqlite`, ao lado do executável. As cópias de segurança ficam em `data\backups\`.
- Para experimentar sem inscrever jogadores, use **Carregar demonstração** em "Início". Abre um torneio fictício de 16 jogadores em que só faltam uma meia-final e a final.

## Teste manual

O guião de aceitação com portátil e TV está em [docs/manual-test-demo.md](docs/manual-test-demo.md).
