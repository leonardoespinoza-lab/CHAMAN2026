import { existsSync } from 'fs';
import puppeteer from 'puppeteer-core';

const CHROMIUM_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((value): value is string => !!value);

interface PdfBrowserRuntime {
  executablePath: string;
  args: string[];
}

async function loadBundledChromium(): Promise<{
  args: string[];
  executablePath(): Promise<string>;
}> {
  // La API compila a CommonJS y el binario empaquetado es ESM. Mantener el
  // import nativo evita que TypeScript lo transforme en require().
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<any>;
  const module = await dynamicImport('@sparticuz/chromium');
  return module.default;
}

export async function getPdfBrowserRuntime(): Promise<PdfBrowserRuntime> {
  const executable = CHROMIUM_PATHS.find((candidate) => existsSync(candidate));
  if (executable) return { executablePath: executable, args: [] };
  const chromium = await loadBundledChromium();
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
  };
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const runtime = await getPdfBrowserRuntime();
  const browser = await puppeteer.launch({
    executablePath: runtime.executablePath,
    headless: true,
    args: [
      ...runtime.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=medium',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    await page.evaluate(async () => {
      await document.fonts?.ready;
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
