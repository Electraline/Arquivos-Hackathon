/**
 * audit.js
 * --------
 * CLI entry point.
 *
 * Usage:
 *   node src/audit.js <url> [--task-search="furadeira"] [--out=reports/report.json]
 *
 * Example:
 *   node src/audit.js https://www.obramax.com.br --task-search="furadeira" --out=reports/obramax.json
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { checkLlmsTxt, checkRobotsTxt, checkProductStructuredData, checkSemanticLandmarks } = require('./checks/staticChecks');
const { runAxe } = require('./checks/axeCheck');
const { runAgentTask, buildAddToCartTask } = require('./agentTask');
const { computeScore } = require('./score');

function parseArgs(argv) {
  const url = argv[2];
  const opts = { taskSearch: 'produto', out: 'reports/report.json' };
  for (const arg of argv.slice(3)) {
    const [, key, value] = arg.match(/^--([^=]+)=(.*)$/) || [];
    if (key === 'task-search') opts.taskSearch = value;
    if (key === 'out') opts.out = value;
  }
  return { url, opts };
}

/** Fecha o banner de cookies se ele existir, pra não bloquear cliques em outros
 *  elementos por baixo dele durante a simulação do agente. Não falha se não achar. */
async function dismissCookieBanner(page) {
  const labels = ['Continuar', 'Aceitar', 'Aceitar todos', 'Concordo', 'Accept'];
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label, exact: false }).first();
    try {
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ timeout: 2000 });
        console.log(`   (banner de cookies fechado via botão "${label}")`);
        return;
      }
    } catch {
      // esse label não apareceu a tempo — tenta o próximo
    }
  }
}

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    console.error('Uso: node src/audit.js <url> [--task-search="termo"] [--out=reports/report.json]');
    process.exit(1);
  }

  console.log(`\n🔎 Auditando ${url}\n`);

  // --- Abre o browser primeiro: os checks de schema/landmarks precisam do HTML
  // já renderizado (e que já passou pelo anti-bot), não de um fetch cru. ---
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1366, height: 768 },
    timezoneId: 'America/Sao_Paulo',
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000); // dá tempo do anti-bot "aceitar" a sessão e do VTEX montar a página

  const pageTitle = await page.title();
  console.log(`   Página carregada: "${pageTitle}"`);
  if (/restrito|blocked|captcha|acesso.*negado/i.test(pageTitle + (await page.evaluate(() => document.body.innerText.slice(0, 200))))) {
    console.warn('   ⚠️  A página carregada parece ser um bloqueio anti-bot, não o site real. Os resultados abaixo podem não refletir o site de verdade.');
  }

  await dismissCookieBanner(page);
  const homeHtml = await page.content();

  // --- Checks estáticos: llms.txt/robots.txt via fetch cru (arquivos simples,
  // geralmente fora da proteção anti-bot); landmarks a partir do HTML já
  // renderizado pelo browser real, pra não bater na tela de bloqueio.
  // product-schema fica de fora daqui — só faz sentido numa página de
  // PRODUTO, não na home, então é avaliado depois de o agente navegar até lá. ---
  console.log('\n1/4 · Checks estáticos (llms.txt, robots.txt, landmarks)...');
  const [llmsResult, robotsResult, landmarksResult] = await Promise.all([
    checkLlmsTxt(url),
    checkRobotsTxt(url),
    Promise.resolve(checkSemanticLandmarks(homeHtml)),
  ]);
  const baseStaticResults = [llmsResult, robotsResult, landmarksResult];
  baseStaticResults.forEach((r) => console.log(`   ${r.passed ? '✅' : '❌'} ${r.label} — ${r.detail}`));

  console.log('\n2/4 · Varredura axe-core...');
  const axeResult = await runAxe(page);
  console.log(`   ${axeResult.detail}`);

  console.log('\n3/4 · Simulando agente tentando comprar...');
  const steps = buildAddToCartTask(opts.taskSearch);
  const taskResult = await runAgentTask(page, steps);
  taskResult.log.forEach((s) =>
    console.log(`   ${s.success ? '✅' : '❌'} ${s.step}${s.reason ? ' — ' + s.reason : ''}`)
  );

  // Se o agente conseguiu abrir uma página de produto (passo 3 do fluxo:
  // "Abrir o primeiro produto"), avalia o schema.org/Product NESSA página.
  // Se não chegou lá, marca como "não aplicável" em vez de contar como falha —
  // não é justo penalizar a home por não ter um schema que é de PDP.
  console.log('\n4/4 · Verificando dados estruturados de produto...');
  const reachedProductPage = taskResult.log.filter((s) => s.success).length >= 3;
  let productSchemaResult;
  if (reachedProductPage) {
    const pdpHtml = await page.content();
    productSchemaResult = checkProductStructuredData(pdpHtml);
  } else {
    productSchemaResult = {
      id: 'product-schema',
      label: 'Página de produto tem JSON-LD schema.org/Product com preço e disponibilidade',
      passed: null,
      weight: 20,
      applicable: false,
      detail: 'Não avaliado — o agente não conseguiu chegar a uma página de produto (ver taskResult).',
    };
  }
  console.log(
    `   ${productSchemaResult.applicable === false ? '➖' : productSchemaResult.passed ? '✅' : '❌'} ${productSchemaResult.label} — ${productSchemaResult.detail}`
  );
  const staticResults = [...baseStaticResults, productSchemaResult];

  await browser.close();

  // --- Score ---
  const score = computeScore({ staticResults, axeResult, taskResult });
  console.log(`\n📊 Agent Readiness Score: ${score.total}/100 (nota ${score.grade})`);
  console.log(`   Static: ${score.breakdown.static.earned.toFixed(1)}/${score.breakdown.static.maxPoints}`);
  console.log(`   Axe: ${score.breakdown.axe.earned.toFixed(1)}/${score.breakdown.axe.maxPoints}`);
  console.log(`   Agent Task: ${score.breakdown.agentTask.earned}/${score.breakdown.agentTask.maxPoints}`);

  const report = { url, timestamp: new Date().toISOString(), score, staticResults, axeResult, taskResult };
  const outPath = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Relatório salvo em ${outPath}\n`);
}

main().catch((err) => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});