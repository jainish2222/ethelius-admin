import "server-only";
import type { Browser } from "puppeteer";

/**
 * HTML → PDF with headless Chrome. One browser is kept per process and reused;
 * each render gets its own page.
 */
const g = globalThis as unknown as { __pdfBrowser?: Promise<Browser> };

async function browser() {
  if (!g.__pdfBrowser) {
    g.__pdfBrowser = import("puppeteer").then((p) =>
      p.default.launch({ headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] }),
    );
    g.__pdfBrowser.then((b) => b.on("disconnected", () => { g.__pdfBrowser = undefined; })).catch(() => { g.__pdfBrowser = undefined; });
  }
  return g.__pdfBrowser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await browser();
  const page = await b.newPage();
  try {
    // Web fonts come from Google Fonts; if the network is slow we still render with the fallback stack.
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 }).catch(() => {});
    await page.waitForFunction("window.__payslipReady === true", { timeout: 5_000 }).catch(() => {});
    await page.emulateMediaType("print");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
