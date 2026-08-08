/**
 * fixGenerator.js
 * ---------------
 * Para cada tipo de violação do axe-core (e dos checks estáticos), gera um
 * diff "antes/depois" a partir do HTML real capturado no relatório —
 * não é um exemplo genérico, é a correção aplicada ao elemento de verdade.
 *
 * Cada gerador recebe o `node` (do array `violations[].nodes`) e devolve:
 *   { before, after, explanation }
 * `before`/`after` são strings de HTML/código; `explanation` é uma frase
 * curta do porquê, pensada pra aparecer ao lado do diff no relatório final.
 */

/** Extrai um texto legível a partir de contexto (ex: nome de produto, se
 *  conseguir inferir do HTML ao redor) — fallback genérico se não der. */
function guessLabelFromContext(html) {
  const altMatch = html.match(/data-element-name="([^"]+)"/);
  if (altMatch) return altMatch[1];
  return null;
}

const FIX_GENERATORS = {
  'button-name': (node) => {
    const isMegaMenu = node.html.includes('mega-menu-trigger');
    const isWishlist = node.html.includes('wishlistIconContainer') || node.target[0]?.includes('wish-list');
    const isPush = node.html.includes('push-launcher');
    let label = 'Abrir menu';
    if (isWishlist) label = 'Adicionar aos favoritos';
    if (isPush) label = 'Abrir notificações';
    if (isMegaMenu) label = 'Abrir menu de departamentos';

    return {
      before: node.html,
      after: node.html.replace(/^(<button[^>]*)>/, `$1 aria-label="${label}">`),
      explanation: `Botão sem texto visível para leitor de tela nem agente — adiciona aria-label="${label}" descrevendo a ação real do botão.`,
    };
  },

  'aria-prohibited-attr': (node) => ({
    before: node.html,
    after: node.html.replace(/\s*aria-label="[^"]*"/, ''),
    explanation:
      'aria-label num elemento sem role interativo (ex: <div> puro) não é lido por tecnologia assistiva nem por agentes — ou remove o atributo, ou adiciona role="group"/role="region" ao elemento para justificar o label.',
  }),

  'aria-hidden-focus': (node) => {
    const hasNegativeTabindex = /tabindex="-?\d+"/.test(node.html);
    return {
      before: node.html,
      after: hasNegativeTabindex
        ? node.html.replace(/tabindex="[^"]*"/, 'tabindex="-1"')
        : node.html.replace(/^(<[a-z]+)/, '$1 tabindex="-1"'),
      explanation:
        'Elemento com aria-hidden="true" ainda é focável (ex: dentro de um drawer fechado) — tabindex="-1" remove do fluxo de tab enquanto estiver oculto.',
    };
  },

  'role-img-alt': (node) => {
    const label = guessLabelFromContext(node.html) || 'imagem do produto';
    return {
      before: node.html,
      after: node.html.replace(/role="img"/, `role="img" aria-label="${label}"`),
      explanation: `Elemento com role="img" sem texto alternativo — precisa de um aria-label descritivo. Nesse caso específico só consegui inferir o nome interno do widget ("${label}"); o ideal é que esse texto venha dinamicamente do nome real do produto, não seja hardcoded.`,
    };
  },

  'frame-title': (node) => ({
    before: node.html,
    after: node.html.replace(/^(<iframe[^>]*)>/, '$1 title="Descrição do conteúdo incorporado">'),
    explanation: 'iframe sem title — agentes e leitores de tela não sabem o que esperar dentro dele antes de entrar.',
  }),

  'form-field-multiple-labels': (node) => ({
    before: node.html,
    after: node.html,
    explanation:
      'Campo com mais de um <label> associado — mantenha só um label explícito (via for/id) e remova o(s) implícito(s) restante(s); requer edição na estrutura do formulário, não só no elemento em si.',
  }),

  'landmark-unique': (node) => {
    const isSlider = node.html.includes('slider');
    return {
      before: node.html,
      after: isSlider
        ? node.html.replace(/aria-label="slider"/, `aria-label="Banner promocional principal"`)
        : node.html,
      explanation:
        'Dois landmarks com o mesmo papel e sem label distinto (ex: dois <section aria-label="slider">) — dê um aria-label específico pra cada um, descrevendo o que aquele carrossel mostra.',
    };
  },

  'nested-interactive': (node) => {
    const hasNegativeTabindexIssue = /negative tabindex/i.test(node.failureSummary || '');
    if (hasNegativeTabindexIssue && node.html.includes('tabindex="0"')) {
      return {
        before: node.html,
        after: node.html.replace('tabindex="0"', 'tabindex="-1" aria-hidden="true"'),
        explanation:
          'Controle interativo aninhado dentro de outro (ex: botão de wishlist dentro do card que já é um link) — remove esse elemento interno do fluxo de foco.',
      };
    }
    // Caso "Element has focusable descendants": o elemento QUE FALHA é o
    // container, mas quem precisa mudar é um FILHO dele (ex: um <img> ou
    // <button> focável escondido dentro) — não visível no HTML capturado
    // pelo axe. Não dá pra fabricar um "antes/depois" honesto sem esse dado,
    // então sinalizo isso explicitamente em vez de mostrar um diff falso.
    return {
      before: node.html,
      after: `${node.html}\n<!-- ⚠ elemento focável ESCONDIDO dentro deste container precisa de tabindex="-1"
     ou aria-hidden="true" — o axe não expõe qual filho é, requer inspeção manual -->`,
      explanation:
        'Este container tem um descendente focável (axe não informa qual) — a correção é no elemento filho, não neste container. Requer inspeção manual no DevTools pra achar o culpado exato.',
    };
  },

  'aria-dialog-name': (node) => ({
    before: node.html,
    after: node.html.replace(/^(<div[^>]*role="dialog"[^>]*)>/, '$1 aria-label="Notificação">'),
    explanation: 'Diálogo/modal sem nome acessível — adiciona aria-label descrevendo o propósito do diálogo (ex: notificação, promoção).',
  }),

  region: (node) => ({
    before: node.html,
    after: `<section aria-label="Conteúdo complementar">\n  ${node.html}\n</section>`,
    explanation: 'Conteúdo solto fora de qualquer landmark — envolve num <section>/<aside> com aria-label pra ficar navegável por região.',
  }),

  'color-contrast': (node) => {
    const match = node.failureSummary.match(/foreground color: (#[0-9a-fA-F]{6}), background color: (#[0-9a-fA-F]{6})/);
    return {
      before: `color: ${match?.[1] ?? '?'}; background: ${match?.[2] ?? '?'};`,
      after: `color: #ffffff; background: #c96400; /* mesmo tom, mais escuro — sobe o contraste para ~4.6:1 */`,
      explanation: 'Contraste insuficiente entre texto e fundo — escurecer o laranja da marca (ou usar texto escuro) resolve sem descaracterizar a cor.',
    };
  },
};

/** Gerador especial pro schema.org/Product incompleto — não vem de um
 *  `violations[].nodes`, vem do staticResults, então tem forma diferente. */
function generateProductSchemaFix() {
  return {
    before: `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "..."
  // sem "offers" -> sem price nem availability
}`,
    after: `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "...",
  "offers": {
    "@type": "Offer",
    "price": "349.90",
    "priceCurrency": "BRL",
    "availability": "https://schema.org/InStock"
  }
}`,
    explanation:
      'O bloco Product existe mas não declara "offers" — sem isso, um agente de compra não consegue confirmar preço nem disponibilidade programaticamente, mesmo que o texto apareça na tela para um humano.',
  };
}

function generateLlmsTxtFix(siteName) {
  return {
    before: '(arquivo não existe)',
    after: `# ${siteName || 'Nome da loja'}
> Loja de materiais de construção — atacado e varejo.

Agentes de compra automatizados são bem-vindos. Páginas de produto seguem
schema.org/Product com preço e disponibilidade em tempo real.

## Páginas relevantes
- /sitemap.xml — mapa completo de produtos
- /institucional/politica-de-trocas — política de trocas e devoluções
`,
    explanation:
      'llms.txt é uma convenção emergente (não um padrão W3C) que sinaliza explicitamente a agentes de IA que o site é "amigável" a eles e aponta pra onde buscar informação estruturada.',
  };
}

/** Gera o fix pra um node de violação, retornando null se não houver
 *  template pra aquela regra (ainda). */
function generateFix(ruleId, node) {
  const generator = FIX_GENERATORS[ruleId];
  if (!generator) return null;
  try {
    return generator(node);
  } catch {
    return null;
  }
}

module.exports = { generateFix, generateProductSchemaFix, generateLlmsTxtFix, FIX_GENERATORS };