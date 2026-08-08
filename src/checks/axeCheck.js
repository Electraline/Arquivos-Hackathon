/**
 * axeCheck.js
 * -----------
 * Runs axe-core inside the real rendered page (needs a Playwright `page`).
 * Same engine BrowserStack Site Scanner uses under the hood — so results are
 * comparable to a manual BrowserStack report.
 *
 * We tag each violation with `blocksAgent: true/false`:
 *   - true  -> breaks the semantic/accessibility tree an AI agent reads
 *              (aria-*, button/link names, form labels, frame titles, roles)
 *   - false -> mostly a human-visual concern (color-contrast) — still WCAG,
 *              still worth fixing, but doesn't stop an agent from acting.
 *
 * This split is what let us weight the score toward "can an agent actually
 * use this page" rather than just "how many a11y issues exist".
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
