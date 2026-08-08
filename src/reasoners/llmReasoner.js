/**
 * llmReasoner.js
 * --------------
 * Reasoner alternativo ao heuristicReasoner (src/agentTask.js): em vez de
 * bater palavra-chave contra o nome acessível, manda a lista de elementos
 * pro Claude decidir qual combina com a intenção do passo.
 *
 * Vantagem sobre o heuristicReasoner: entende sinônimos, conjugações e
 * contexto sem precisar de uma lista de palavras-chave mantida à mão
 * (foi exatamente a fonte da maioria dos bugs que corrigimos no
 * heuristicReasoner — "busca" vs "buscar", "produto" vs "produtos"...).
 * Desvantagem: precisa de API key, tem custo por chamada, e é mais lento
 * (uma requisição de rede por passo).
 *
 * Requer a variável de ambiente ANTHROPIC_API_KEY.
 *
 * Uso:
 *   const { llmReasoner } = require('./reasoners/llmReasoner');
 *   const result = await runAgentTask(page, steps, { reasoner: llmReasoner() });
 */

const MODEL = process.env.ARS_LLM_MODEL || 'claude-haiku-4-5-20251001';

function llmReasoner() {
  return async (elements, step) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY não definido no ambiente — exporte a variável antes de usar o llmReasoner ' +
          '(ex: $env:ANTHROPIC_API_KEY="sk-ant-..." no PowerShell).'
      );
    }
    if (elements.length === 0) return null;

    const list = elements.map((el, i) => `${i}: [${el.role}] "${el.name}"`).join('\n');

    const prompt = `Você está ajudando um agente de compra a navegar num e-commerce.

Tarefa atual: "${step.label}"
${step.value ? `Valor a digitar/buscar (se aplicável): "${step.value}"` : ''}

Elementos interativos visíveis na página (índice: [role] "nome acessível"):
${list}

Qual índice corresponde ao elemento certo para esta tarefa? Responda APENAS com um número (o índice), ou a palavra "null" se nenhum elemento servir. Sem explicação, sem markdown, só o número ou "null".`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chamada à API da Anthropic falhou (${res.status}): ${text}`);
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text?.trim();
    const index = parseInt(raw, 10);

    if (Number.isNaN(index) || index < 0 || index >= elements.length) return null;
    return elements[index];
  };
}

module.exports = { llmReasoner };