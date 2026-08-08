/**
 * agentTask.js
 * ------------
* Simula como um agente de compras baseado em DOM/árvore de acessibilidade (estilo Playwright
 * MCP, ChatGPT Atlas, Project Mariner) tentaria concluir uma tarefa no
 * site — utilizando APENAS *role* e nome acessível, nunca pixels ou capturas de tela.
 *
 * Este é o elemento central da demonstração: execute-o antes das correções (as etapas falham) e depois
 * das correções (as etapas passam) para mostrar como a mudança na pontuação se traduz em comportamento real.
 *
 * O `reasoner` é modular/substituível:
 *   - heuristicReasoner (padrão): correspondência de palavras-chave, nenhuma chamada externa,
 *     bom o suficiente para uma demonstração de hackathon e totalmente offline.
 *   - llmReasoner: substitua por uma chamada real ao Claude para uma correspondência mais inteligente, se
 *     tiver tempo/orçamento disponível (veja src/reasoners/llmReasoner.js).
 */

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
].join(', ');

/** Pulls a best-effort accessible name for an element handle, mirroring the
 *  browser's accessible-name computation closely enough for matching. */
async function accessibleName(el) {
  return el.evaluate((node) => {
    const attr = (n, a) => n.getAttribute?.(a);
    return (
      attr(node, 'aria-label') ||
      (attr(node, 'aria-labelledby') &&
        document.getElementById(attr(node, 'aria-labelledby'))?.textContent?.trim()) ||
      attr(node, 'placeholder') ||
      attr(node, 'title') ||
      attr(node, 'alt') ||
      node.textContent?.trim().slice(0, 120) ||
      ''
    );
  });
}

async function enumerateInteractiveElements(page) {
  // page.$$() tira um "retrato" com ElementHandles fixos — ao contrário de
  // Locator.nth(i), que RE-CONSULTA o DOM a cada chamada. Numa página com
  // carrossel/auto-refresh (como a home do Obramax), usar nth(i) faz o
  // índice "andar" enquanto escaneamos, e trava esperando um elemento que
  // já não está mais naquela posição. ElementHandle evita isso.
  const handles = await page.$$(INTERACTIVE_SELECTOR);

  const results = await Promise.allSettled(
    handles.map(async (handle, index) => {
      const [role, name, visible] = await Promise.all([
        handle.evaluate((n) => n.getAttribute('role') || n.tagName.toLowerCase()),
        accessibleName(handle),
        handle.isVisible().catch(() => false),
      ]);
      return { index, role, name, visible, handle };
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled' && r.value.visible)
    .map((r) => r.value);
  // rejeitados = elemento ficou "stale" (removido/recriado pelo React entre a
  // hora que pegamos a lista e a hora de inspecioná-lo) — descartados em silêncio
}

/** Escapa caracteres especiais de regex num termo de busca livre. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Reasoner por palavra-chave, sem dependência de LLM.
 *  Duas correções importantes em relação a um "includes()" ingênuo:
 *   1. Usa \b...\b (borda de palavra) em vez de substring — "produto" não
 *      deve bater dentro de "produtos" (foi exatamente isso que causou o
 *      passo 3 casar de novo com o botão "Buscar produtos").
 *   2. Aceita `excludeElements` — elementos já usados em passos anteriores
 *      do fluxo não podem ser escolhidos de novo, mesmo que combinem com
 *      as keywords, pra evitar o agente "clicar duas vezes na mesma coisa"
 *      e reportar sucesso falso. */
function heuristicReasoner(intentKeywords, { preferRoles = [], excludeKeywords = [] } = {}) {
  return async (elements, step) => {
    const exclude = step?.excludeElements || [];
    const isExcluded = (el) => exclude.some((used) => used.role === el.role && used.name === el.name);
    const isNegativeMatch = (el) => {
      const haystack = el.name.toLowerCase();
      return excludeKeywords.some((kw) => new RegExp(`\\b${escapeRegExp(kw.toLowerCase())}\\b`).test(haystack));
    };

    const scored = elements
      .filter((el) => !isExcluded(el) && !isNegativeMatch(el))
      .map((el) => {
        const haystack = el.name.toLowerCase();
        const hits = intentKeywords.filter((kw) => {
          const pattern = new RegExp(`\\b${escapeRegExp(kw.toLowerCase())}\\b`);
          return pattern.test(haystack);
        }).length;
        const roleBonus = preferRoles.includes(el.role) ? 0.5 : 0; // desempate, não substitui hits
        return { el, score: hits + roleBonus, hits };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.el ?? null;
  };
}

/** Acha o elemento realmente preenchível a partir do que foi "achado" pelo
 *  reasoner. Cobre o padrão comum de combobox/autocomplete (ex: Downshift, usado
 *  pela busca do VTEX): o elemento com role="combobox" é só um <div> wrapper —
 *  o <input> de verdade fica escondido dentro dele.
 *  Recebe `page` explicitamente porque ElementHandle (diferente de Locator)
 *  não tem um método .page(). */
async function resolveFillableTarget(handle, page) {
  const tagName = await handle.evaluate((n) => n.tagName.toLowerCase());
  const isContentEditable = await handle.evaluate((n) => n.isContentEditable);
  if (tagName === 'input' || tagName === 'textarea' || isContentEditable) {
    return handle;
  }

  // procura um <input>/<textarea>/[contenteditable] dentro do elemento
  const nested = await handle.$('input, textarea, [contenteditable="true"]');
  if (nested) return nested;

  // último recurso: clica pra abrir (ex: ícone de lupa que expande um campo
  // em OUTRO lugar do DOM, não dentro do próprio botão) — depois do clique,
  // não confia em `:focus`, porque o próprio botão clicado às vezes retém o
  // foco mesmo depois de abrir algo. Em vez disso, procura qualquer
  // input/textarea que ficou visível na página inteira após o clique.
  await handle.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);

  const candidates = await page.$$('input, textarea, [contenteditable="true"]');
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }

  throw new Error('Nenhum campo preenchível encontrado dentro do elemento, nem surgiu um novo campo visível depois de clicar nele.');
}

/**
 * Runs a scripted task as a sequence of "find an element matching this intent,
 * then act on it" steps. Stops at the first step it can't complete — exactly
 * where a real agent would give up.
 */
async function runAgentTask(page, steps, { reasoner } = {}) {
  const log = [];
  const usedElements = []; // { role, name } de cada elemento já usado num passo anterior

  for (const step of steps) {
    let elements = await enumerateInteractiveElements(page);
    const pickReasoner = reasoner || heuristicReasoner(step.intentKeywords, { preferRoles: step.preferRoles });
    let match = await pickReasoner(elements, { ...step, excludeElements: usedElements });

    // se não achou nada E a página parece ter poucos elementos interativos
    // (sinal de que ainda está carregando/hidratando), espera mais um pouco
    // e tenta de novo uma vez antes de desistir — evita falso-negativo por
    // timing, especialmente em páginas de produto mais pesadas
    if (!match && elements.length < 10) {
      await page.waitForTimeout(3000);
      elements = await enumerateInteractiveElements(page);
      match = await pickReasoner(elements, { ...step, excludeElements: usedElements });
    }

    if (!match) {
      // quando não acha nada nos papéis "óbvios" de busca, mostra uma amostra
      // de QUALQUER elemento visível — ajuda a descobrir se a busca está
      // escondida atrás de um ícone/botão que precisa ser clicado primeiro
      const searchLikeCandidates = elements.filter((el) =>
        ['textbox', 'combobox', 'searchbox', 'input'].includes(el.role)
      );
      const candidates = searchLikeCandidates.length > 0 ? searchLikeCandidates : elements;
      const candidateLabel = searchLikeCandidates.length > 0 ? 'Candidatos prováveis não reconhecidos' : 'Nenhum campo de texto visível — amostra de outros elementos (pode estar atrás de um ícone)';
      const sample = candidates
        .slice(0, 8)
        .map((el) => `${el.role}:"${el.name}"`)
        .join(', ');
      log.push({
        step: step.label,
        success: false,
        reason: `Nenhum elemento com role/nome acessível compatível com [${step.intentKeywords.join(', ')}] foi encontrado entre ${elements.length} elementos interativos visíveis (excluindo ${usedElements.length} já usados em passos anteriores). ${candidateLabel}: ${sample || '(nenhum)'}`,
      });
      break; // an agent would stop here too — no point continuing the task
    }

    try {
      if (step.then === 'click') {
        await match.handle.click({ timeout: 5000 });
      } else if (step.then === 'type') {
        const target = await resolveFillableTarget(match.handle, page);
        await target.fill(step.value, { timeout: 5000 });
      } else if (step.then === 'type_and_submit') {
        // digita e confirma com Enter — mais robusto que caçar um botão de
        // "confirmar busca", que às vezes é o MESMO botão usado pra abrir o
        // campo (já excluído por ter sido usado no passo anterior) ou tem
        // nome ambíguo com outros botões (ex: "Limpar campo de busca"
        // também contém a palavra "busca")
        const target = await resolveFillableTarget(match.handle, page);
        await target.fill(step.value, { timeout: 5000 });
        const urlBefore = page.url();
        await target.press('Enter');
        await page.waitForTimeout(1500);
        // fallback: se Enter não mudou a URL nem pareceu disparar nada,
        // tenta achar um botão de confirmar busca explícito, evitando
        // candidatos de "limpar" pra não repetir o erro anterior
        if (page.url() === urlBefore) {
          const retryElements = await enumerateInteractiveElements(page);
          const submitCandidate = retryElements.find(
            (el) =>
              /\b(buscar|pesquisar|search)\b/i.test(el.name) &&
              !/\b(limpar|clear|fechar|close)\b/i.test(el.name) &&
              !usedElements.some((u) => u.role === el.role && u.name === el.name)
          );
          if (submitCandidate) await submitCandidate.handle.click({ timeout: 3000 }).catch(() => {});
        }
      }
      usedElements.push({ role: match.role, name: match.name });
      log.push({
        step: step.label,
        success: true,
        matchedElement: { role: match.role, name: match.name },
      });
      // clicar num link/botão de navegação costuma trocar de página de verdade
      // — domcontentloaded sozinho dispara antes de conteúdo carregado via
      // requisição separada (preço, estoque) aparecer, então espera também
      // a rede "acalmar" (com timeout curto pra não travar em widgets de
      // terceiros que ficam fazendo polling em background)
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      if (step.waitAfterMs) await page.waitForTimeout(step.waitAfterMs);
    } catch (e) {
      log.push({
        step: step.label,
        success: false,
        matchedElement: { role: match.role, name: match.name },
        reason: `Elemento encontrado (${match.role} "${match.name}") mas a ação "${step.then}" falhou: ${e.message}`,
      });
      break;
    }
  }

  const completed = log.length > 0 && log.every((s) => s.success);
  return { completed, stepsAttempted: log.length, totalSteps: steps.length, log };
}

/** Example task: search a product and add it to the cart — the classic
 *  "can an agent actually buy something here" litmus test. */
function buildAddToCartTask(searchTerm) {
  return [
    {
      label: 'Buscar o produto (localizar campo + digitar + confirmar)',
      // palavras COMPLETAS apenas — o matching é por borda de palavra, então
      // um radical como "pesquis" sozinho NÃO bate em "pesquisar"/"pesquisa"
      // (faltaria a borda final). Lista mais generosa de conjugações comuns.
      intentKeywords: [
        'busca', 'buscar', 'busque',
        'pesquisa', 'pesquisar', 'pesquise',
        'procura', 'procurar', 'procure',
        'encontre', 'encontrar', 'digite', 'search',
      ],
      then: 'type_and_submit',
      value: searchTerm,
      waitAfterMs: 2000,
    },
    {
      label: 'Abrir o primeiro produto do resultado',
      // sem a keyword genérica "produto" — ela batia dentro de "produtos"
      // (ex: "Buscar produtos") e o agente clicava de novo no botão de busca
      // em vez de abrir um produto de verdade
      intentKeywords: [searchTerm.toLowerCase(), 'ver mais', 'ver produto', 'detalhes'],
      preferRoles: ['link', 'a'], // cards de produto costumam ser um <a> envolvendo tudo
      then: 'click',
      waitAfterMs: 4000, // PDP é mais pesada — preço/estoque carregam depois do HTML inicial
    },
    {
      label: 'Adicionar ao carrinho',
      intentKeywords: ['adicionar', 'comprar', 'carrinho', 'add to cart'],
      then: 'click',
      waitAfterMs: 800,
    },
  ];
}

module.exports = { runAgentTask, enumerateInteractiveElements, heuristicReasoner, buildAddToCartTask };