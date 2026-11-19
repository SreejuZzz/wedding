// Frame-time benchmark: scrolls the whole page and sweeps the mouse while recording
// every animation frame, then reports frame-time percentiles plus Chrome's own counters
// (layouts, style recalculations, script and layout time).
//
//   npm run perf
//   CHROME_PATH=/usr/bin/google-chrome npm run perf
//   HEADED=1 npm run perf      (real GPU; headless uses a software renderer, so compare runs, not absolutes)
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_URL = pathToFileURL(path.join(ROOT, "site", "index.html")).href;

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function main() {
  const browser = await chromium.launch({
    headless: !process.env.HEADED,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => !document.getElementById("loader"), null, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const before = await metric();

  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const x = 200 + Math.sin(i / 6) * 450 + 400, y = 430 + Math.cos(i / 5) * 250;
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, total / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);

  const frames = await page.evaluate(() => { window.__stop = true; return window.__frames.slice(2); });
  const after = await metric();
  await browser.close();

  const sorted = [...frames].sort((a, b) => a - b);
  const mean = frames.reduce((s, v) => s + v, 0) / frames.length;
  const over = (ms) => frames.filter((f) => f > ms).length;
  const diff = (k) => (after[k] ?? 0) - (before[k] ?? 0);
  console.log(`frames: ${frames.length}`);
  console.log(`frame time ms  mean ${mean.toFixed(1)}  p50 ${percentile(sorted, 50).toFixed(1)}  p95 ${percentile(sorted, 95).toFixed(1)}  p99 ${percentile(sorted, 99).toFixed(1)}  max ${sorted.at(-1).toFixed(1)}`);
  console.log(`frames > 20ms: ${over(20)}   > 33ms: ${over(33)}   > 50ms: ${over(50)}`);
  console.log(`layouts ${diff("LayoutCount")}  style recalcs ${diff("RecalcStyleCount")}  script ${(diff("ScriptDuration") * 1000).toFixed(0)}ms  layout ${(diff("LayoutDuration") * 1000).toFixed(0)}ms  style ${(diff("RecalcStyleDuration") * 1000).toFixed(0)}ms`);
}

main().catch((error) => { console.error(error); process.exit(1); });
