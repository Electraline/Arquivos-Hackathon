/**
 * staticChecks.js
 * ----------------
* Verificações que NÃO exigem renderização em um navegador real — apenas busca HTTP + análise via regex/DOM.
 * Elas correspondem aos sinais de "quão legível este site é para um agente de IA" que não
 * dependem da árvore de acessibilidade (essa parte é tratada em axeCheck.js / agentTask.js).
 *
 * Cada verificação retorna: { id, label, passed, weight, detail }
 * `weight` indica quantos pontos a verificação vale dentro do grupo "estático" (veja score.js).
 */

const { JSDOM } = require('jsdom');

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
}

/** Checks for llms.txt at the site root — a growing convention agents look for. */
async function checkLlmsTxt(baseUrl) {
  const url = new URL('/llms.txt', baseUrl).toString();
  try {
    const { ok } = await fetchText(url);
    return {
      id: 'llms-txt',
      label: 'llms.txt presente na raiz do site',
      passed: ok,
      weight: 10,
      detail: ok ? `Encontrado em ${url}` : `Não encontrado em ${url}`,
    };
  } catch (e) {
    return { id: 'llms-txt', label: 'llms.txt presente na raiz do site', passed: false, weight: 10, detail: e.message };
  }
}

/** Checks robots.txt doesn't block known AI agent user-agents from key paths. */
async function checkRobotsTxt(baseUrl) {
  const url = new URL('/robots.txt', baseUrl).toString();
  const blockedAgents = ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'];
  try {
    const { ok, text } = await fetchText(url);
    if (!ok) {
      return { id: 'robots-agents', label: 'robots.txt não bloqueia agentes de IA conhecidos', passed: true, weight: 5, detail: 'robots.txt ausente = nada bloqueado por padrão' };
    }
    const blocked = blockedAgents.filter((agent) => {
      const re = new RegExp(`User-agent:\\s*${agent}[\\s\\S]*?Disallow:\\s*/(\\s|$)`, 'i');
      return re.test(text);
    });
    return {
      id: 'robots-agents',
      label: 'robots.txt não bloqueia agentes de IA conhecidos',
      passed: blocked.length === 0,
      weight: 5,
      detail: blocked.length ? `Bloqueando: ${blocked.join(', ')}` : 'Nenhum agente conhecido bloqueado',
    };
  } catch (e) {
    return { id: 'robots-agents', label: 'robots.txt não bloqueia agentes de IA conhecidos', passed: true, weight: 5, detail: e.message };
  }
}

/** Checks for Product structured data (JSON-LD schema.org/Product) on a PDP. */
function checkProductStructuredData(html) {
  const dom = new JSDOM(html);
  const scripts = [...dom.window.document.querySelectorAll('script[type="application/ld+json"]')];
  let found = null;

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])];
      const product = items.find((item) => {
        const type = item?.['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });
      if (product) {
        found = product;
        break;
      }
    } catch {
      // malformed JSON-LD block — ignore and keep scanning others
    }
  }

  const hasPrice = !!found?.offers?.price || !!found?.offers?.[0]?.price;
  const hasAvailability = !!found?.offers?.availability || !!found?.offers?.[0]?.availability;

  return {
    id: 'product-schema',
    label: 'Página de produto tem JSON-LD schema.org/Product com preço e disponibilidade',
    passed: !!found && hasPrice && hasAvailability,
    weight: 20,
    detail: !found
      ? 'Nenhum bloco JSON-LD com @type Product encontrado'
      : `Product encontrado — preço: ${hasPrice ? 'sim' : 'não'}, disponibilidade: ${hasAvailability ? 'sim' : 'não'}`,
  };
}

/** Basic semantic HTML sanity check — landmarks an agent/screen-reader relies on. */
function checkSemanticLandmarks(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const hasNav = !!doc.querySelector('nav, [role="navigation"]');
  const hasMain = !!doc.querySelector('main, [role="main"]');
  const h1Count = doc.querySelectorAll('h1').length;

  const passed = hasNav && hasMain && h1Count === 1;
  return {
    id: 'semantic-landmarks',
    label: 'Landmarks semânticos presentes (nav, main, um único h1)',
    passed,
    weight: 10,
    detail: `nav: ${hasNav}, main: ${hasMain}, h1 count: ${h1Count}`,
  };
}

module.exports = {
  checkLlmsTxt,
  checkRobotsTxt,
  checkProductStructuredData,
  checkSemanticLandmarks,
};
