/**
 * debug-page.js
 * -------------
 * Roda isolado do audit.js pra você ver exatamente o que o Chromium recebeu:
 * screenshot + título + primeiros 2000 caracteres do HTML.
 *
 * Uso: node debug-page.js https://www.obramax.com.br
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: node debug-page.js <url>');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false, // headless "puro" é o que mais entrega automação pra anti-bot
    channel: 'chrome', // usa o Chrome de verdade instalado na sua máquina, não o Chromium de teste
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1366, height: 768 },
    timezoneId: 'America/Sao_Paulo',
  });

  // remove o sinal mais óbvio de automação (navigator.webdriver === true)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  console.log(`Navegando até ${url} ...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // espera um pouco pra deixar o React/VTEX terminar de montar a página
  // (e dar tempo do anti-bot "aceitar" a sessão antes de qualquer ação)
  await page.waitForTimeout(6000);

  const title = await page.title();
  const lang = await page.evaluate(() => document.documentElement.lang);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const html = await page.content();

  console.log('\n--- DIAGNÓSTICO ---');
  console.log('Título da página:', title);
  console.log('lang do <html>:', lang);
  console.log('Primeiros 300 caracteres do texto visível:\n', bodyText);

  fs.writeFileSync('debug-screenshot.png', await page.screenshot({ fullPage: true }));
  fs.writeFileSync('debug-page.html', html);
  console.log('\n💾 Salvei debug-screenshot.png e debug-page.html — abra os dois pra ver o que o Chromium recebeu.');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});