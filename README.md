# Agent Readiness Score

Um Agent que audita e-commerces para descobrir se **agentes de IA de compra**
(ChatGPT Atlas, Perplexity Shopping, Google Project Mariner, etc.) conseguem
navegar e comprar no site — e sugere as correções.

Esses agentes leem a página pela **árvore de acessibilidade** (a mesma coisa
que um leitor de tela usa), não por pixels. Então: um site inacessível para
PCD é, na prática, um site invisível para agentes de compra por IA. Este
projeto mede isso com um score único e demonstra o efeito ao vivo.

Motivado por um achado real: um scan de acessibilidade no site da Obramax
encontrou 22 violações WCAG — incluindo um botão do menu principal sem nome
discernível (`critical`) e 11 usos indevidos de `aria-label`. Nenhuma delas
impede um humano vidente de navegar visualmente, mas todas quebram o que um
agente de IA "vê".

## Arquitetura

```
src/
  checks/
    staticChecks.js   → llms.txt, robots.txt, JSON-LD Product, landmarks (sem browser)
    axeCheck.js        → roda axe-core na página renderizada (mesmo motor do BrowserStack)
  agentTask.js          → simula um agente tentando "buscar produto → add to cart"
                           usando só role + nome acessível dos elementos
  score.js               → combina tudo em um score 0-100 explicável
  audit.js               → CLI que orquestra tudo e salva o relatório JSON
fixtures/                → páginas de exemplo (boa/ruim) para testar offline
test-static.js            → smoke test das partes que não precisam de browser
```

## Setup

```bash
npm install
npx playwright install chromium   # baixa o browser (precisa de rede liberada)
```

## Uso

```bash
node src/audit.js https://www.suaLoja.com.br --task-search="furadeira" --out=reports/loja.json
```

Isso imprime no terminal e salva um JSON com:
- os 4 checks estáticos (schema.org, llms.txt, robots.txt, landmarks)
- a varredura axe-core completa, com cada violação marcada como
  `blocksAgent: true/false`
- o log passo a passo da simulação de compra do agente
- o **Agent Readiness Score** final com breakdown

## Rodando sem browser (offline, para validar a lógica)

```bash
npm test
```

Roda `test-static.js`, que usa fixtures locais (`fixtures/good-pdp.html` e
`fixtures/bad-pdp.html`) para provar que:
1. os checks estáticos detectam corretamente schema/landmarks bons vs. ruins
2. o score engine reflete isso corretamente
3. o "antes/depois" (mock baseado nos achados reais do Obramax) sobe de
   **12/100 (F)** para **100/100 (A)**

## Roteiro de demo sugerido (< 5 min)

1. Abra com o achado real: "Testamos isso na Obramax e achamos 22 barreiras,
   uma delas crítica, no botão principal do menu."
2. Rode o audit ao vivo (ou mostre o relatório pré-gerado) → mostre o score
   baixo e o log da simulação de compra falhando num passo específico.
3. Mostre o diff da correção sugerida para aquele passo.
4. Rode de novo (ou mostre o relatório "depois") → score sobe, e a simulação
   de compra completa os 4 passos.
5. Feche com o gancho de negócio: "Isso não é só acessibilidade — é um canal
   de vendas (agentic commerce) que a loja pode estar perdendo sem saber."

## Próximos passos (se sobrar tempo)

- Trocar o `heuristicReasoner` por uma chamada real a um LLM
  (`src/agentTask.js` já é pluggável via parâmetro `reasoner`) para matching
  mais robusto de intenção → elemento.
- Gerador automático de diff de correção por tipo de violação axe-core
  (usar o `nodes[].html` de cada violação como input pro LLM).
- Dashboard simples (HTML estático) lendo o `reports/*.json`.
