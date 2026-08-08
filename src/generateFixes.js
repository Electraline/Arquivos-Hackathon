/**
 * generateFixes.js
 * ----------------
 * Lê um relatório JSON salvo pelo audit.js e gera um markdown com o diff
 * antes/depois de cada TIPO de violação encontrada (deduplicado — mostra
 * só 1-2 exemplos representativos por regra, não uma cópia por elemento).
 *
 * Uso:
 *   node src/generateFixes.js reports/report.json
 *   node src/generateFixes.js reports/report.json --out=reports/fixes.md
 */

const fs = require('fs');
const path = require('path');
const { generateFix, generateProductSchemaFix, generateLlmsTxtFix } = require('./fixGenerator');

const RULE_LABELS = {
  'button-name': 'Botões sem nome acessível',
  'aria-prohibited-attr': 'aria-label em elemento sem role válido',
  'aria-hidden-focus': 'Elemento oculto ainda focável',
  'role-img-alt': 'Imagem (role="img") sem texto alternativo',
  'frame-title': 'iframe sem title',
  'form-field-multiple-labels': 'Campo com múltiplos labels',
  'landmark-unique': 'Landmarks duplicados sem label distinto',
  'nested-interactive': 'Controles interativos aninhados',
  'aria-dialog-name': 'Diálogo sem nome acessível',
  region: 'Conteúdo fora de qualquer landmark',
  'color-contrast': 'Contraste de cor insuficiente',
};

function parseArgs(argv) {
  const reportPath = argv[2];
  const opts = { out: null };
  for (const arg of argv.slice(3)) {
    const [, key, value] = arg.match(/^--([^=]+)=(.*)$/) || [];
    if (key === 'out') opts.out = value;
  }
  if (!opts.out && reportPath) {
    opts.out = reportPath.replace(/\.json$/, '-fixes.md');
  }
  return { reportPath, opts };
}

function renderDiffBlock(ruleId, label, count, fix, exampleTarget) {
  return `### ${label} (\`${ruleId}\`) — ${count} ocorrência${count > 1 ? 's' : ''}

${exampleTarget ? `Exemplo real: \`${exampleTarget}\`\n` : ''}
**Antes:**
\`\`\`html
${fix.before}
\`\`\`

**Depois:**
\`\`\`html
${fix.after}
\`\`\`

> ${fix.explanation}
`;
}

function main() {
  const { reportPath, opts } = parseArgs(process.argv);
  if (!reportPath) {
    console.error('Uso: node src/generateFixes.js <caminho-do-relatorio.json> [--out=arquivo.md]');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const sections = [];
  let totalIssuesCovered = 0;

  // --- violações do axe-core, uma seção por regra, deduplicada ---
  for (const violation of report.axeResult?.violations ?? []) {
    const label = RULE_LABELS[violation.id] || violation.help || violation.id;
    const count = violation.nodes.length;
    // pega o primeiro node com um fix gerável como exemplo representativo
    let fix = null;
    let exampleTarget = null;
    for (const node of violation.nodes) {
      fix = generateFix(violation.id, node);
      if (fix) {
        exampleTarget = node.target?.[0];
        break;
      }
    }
    if (!fix) continue; // sem template pra essa regra ainda — pula
    sections.push(renderDiffBlock(violation.id, label, count, fix, exampleTarget));
    totalIssuesCovered += count;
  }

  // --- product-schema, se aplicável e reprovado ---
  const productSchema = report.staticResults?.find((r) => r.id === 'product-schema');
  if (productSchema && productSchema.applicable !== false && !productSchema.passed) {
    const fix = generateProductSchemaFix();
    sections.push(renderDiffBlock('product-schema', 'Schema.org/Product incompleto (sem price/availability)', 1, fix));
    totalIssuesCovered += 1;
  }

  // --- llms.txt, se ausente ---
  const llmsTxt = report.staticResults?.find((r) => r.id === 'llms-txt');
  if (llmsTxt && !llmsTxt.passed) {
    const fix = generateLlmsTxtFix();
    sections.push(renderDiffBlock('llms-txt', 'llms.txt ausente', 1, fix));
    totalIssuesCovered += 1;
  }

  const header = `# Correções sugeridas — ${report.url}

Gerado a partir de \`${path.basename(reportPath)}\` (score original: ${report.score?.total}/100, nota ${report.score?.grade}).

Cada seção mostra **um exemplo real** capturado no site, com a correção sugerida ao lado — não é um exemplo genérico de documentação, é o HTML de verdade que o audit encontrou.

Total de ocorrências cobertas por essas correções: **${totalIssuesCovered}**.

---
`;

  const markdown = header + sections.join('\n---\n\n');
  fs.writeFileSync(opts.out, markdown);
  console.log(`✅ ${sections.length} tipos de correção gerados (${totalIssuesCovered} ocorrências no total).`);
  console.log(`💾 Salvo em ${opts.out}`);
}

main();