/**
 * axeCheck.js
 * -----------
 * Roda axe-core dentro de uma página real (precisa de Playwright `page`).
 * Colocamos uma tag em cada violação com `blocksAgent: true/false`:
 *   - true  -> Quebra a arvore semantica/acessibilidade que um Agent de IA lê
 *              (aria-*, button/link names, form labels, frame titles, roles)
 *   - false -> Maioria preocupação huamana visual(color-contrast) — still WCAG,
 *              ainda vale a pena consertar, mas não impede o Agent de seguir com o processo.
 *Essa divisão é o que nos permitiu dar mais peso à pontuação com base em
 "se um agente consegue realmente usar esta página", em vez de apenas "quantos problemas de acessibilidade existem".
 */

const AXE_CORE_PATH = require.resolve('axe-core/axe.min.js');

const AGENT_BLOCKING_RULE_IDS = new Set([
  'aria-prohibited-attr',
  'aria-hidden-focus',
  'aria-allowed-attr',
  'aria-required-attr',
  'button-name',
  'link-name',
  'frame-title',
  'form-field-multiple-labels',
  'label',
  'image-alt',
  'input-image-alt',
  'role-img-alt',
  'select-name',
]);

async function runAxe(page) {
  await page.addScriptTag({ path: AXE_CORE_PATH });

  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      resultTypes: ['violations'],
    });
  });

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    blocksAgent: AGENT_BLOCKING_RULE_IDS.has(v.id),
    nodes: v.nodes.map((n) => ({
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));

  const blockingCount = violations.filter((v) => v.blocksAgent).length;
  const criticalOrSerious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length;

  return {
    id: 'axe-scan',
    label: 'Varredura axe-core (motor usado pelo BrowserStack Site Scanner)',
    passed: blockingCount === 0,
    weight: 30,
    detail: `${violations.length} violações totais | ${blockingCount} bloqueiam agentes | ${criticalOrSerious} critical/serious`,
    violations,
  };
}

module.exports = { runAxe, AGENT_BLOCKING_RULE_IDS };
