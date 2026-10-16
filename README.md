# Pelada de Vôlei

App web (PWA) para organizar a pelada: cadastra o grupo, marca quem veio no dia e sorteia times
equilibrados pela habilidade (MMR) e pelo número de partidas que cada um já jogou no dia.

- Sem build e sem dependências: HTML + CSS + JavaScript (ES modules).
- Dados ficam no próprio aparelho (IndexedDB). Use **Config → Exportar backup** de vez em quando.
- Não há ranking: o MMR é interno e só aparece na ficha do jogador.

## Rodar no PC

```bash
python -m http.server 8080
```

Abra http://localhost:8080 (app) e http://localhost:8080/tests/ (testes do algoritmo).

## Usar no celular

Publicado em **https://pedrohc789.github.io/pelada-volei/** (GitHub Pages, branch `main`).

- Android (Chrome): ⋮ → "Instalar app".
- iPhone (Safari): Compartilhar → "Adicionar à Tela de Início".

Para atualizar: commit + `git push`; o Pages republica em ~1 minuto. Incremente `VERSION`
em `sw.js` a cada versão para os celulares trocarem o cache.

## Grupo sincronizado (Supabase)

Em **Ajustes → Grupo**, um aparelho cria o grupo com os dados dele e manda o link
(`…/#/entrar/<código>`). Todos que entram pelo link veem e registram os jogos, sincronizado na hora.

- Login anônimo do Supabase (sem cadastro); só membros leem ou gravam (RLS + funções em
  `supabase/schema.sql`).
- Cada documento tem `version`; gravações vão por `apply_ops` (tudo ou nada). Se dois organizadores
  mudam a mesma coisa, o segundo recebe "Outro organizador alterou isso agora" e a tela atualiza.
  O resultado de um jogo tem ID fixo (`<dia>:<jogo>`), então nunca é registrado duas vezes.
- Sem internet, o grupo fica só leitura (o espelho local continua disponível).
- Projeto e chave pública em `js/config.js`; cliente em `js/vendor/supabase.js` (supabase-js 2.117.2).

## Regras do sorteio

1. **Prioridade:** entra primeiro quem jogou menos partidas hoje; empate → quem está há mais tempo
   sem jogar; empate → aleatório.
2. **Equilíbrio:** entre os empatados na linha de corte, escolhe a combinação que deixa as médias de
   MMR mais próximas. No sorteio completo testa todas as divisões (12 jogadores = 462) e sorteia
   uma entre as que ficam a até 15 pontos da melhor (`TOLERANCE` em `js/balance.js`).
3. **Rodízio:** vencedor fica, no máximo 2 jogos seguidos (`MAX_STREAK` em `js/rotation.js`). Ao
   completar o 2º jogo seguido, os dois times saem e há sorteio completo.
4. **MMR (Elo):** compara a média dos times; `Δ = K × (resultado − chance esperada)`, com K = 40 nas
   10 primeiras partidas do jogador e 20 depois. MMR inicial pelo nível: Iniciante 800,
   Intermediário 1000, Bom 1200, Avançado 1400.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/elo.js`, `js/balance.js`, `js/rotation.js` | Lógica pura do sorteio e do Elo (testada em `tests/`) |
| `js/db.js`, `js/store.js` | IndexedDB e regras do app (dia, partida, desfazer, backup) |
| `js/views/*.js` | Telas: Partida, Dia, Jogadores, Histórico, Config |
| `sw.js`, `manifest.webmanifest` | PWA / offline |
