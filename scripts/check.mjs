// Smoke test of the built site in headless Chromium.
// Checks: no page or console errors, no horizontal overflow (desktop and phone),
// the on-page QR decodes to the map link, and the water-drop lens appears.
// Screenshots of every section are written to screenshots/.
//
//   npm run check                         (builds first)
//   CHROME_PATH=/usr/bin/google-chrome npm run check   (use an installed Chrome instead of Playwright's)
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { MAPS_URL } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_URL = pathToFileURL(path.join(ROOT, "site", "index.html")).href;
const SHOTS = path.join(ROOT, "screenshots");
const IGNORED = ["GL Driver", "ERR_TUNNEL", "fonts.g", "ERR_NAME_NOT_RESOLVED", "ERR_INTERNET_DISCONNECTED"];
const SECTIONS = [
  ["invitation", 0], ["duo-track", 0.05], ["duo-track", 0.62], ["programme", 0.1],
  ["moments", 0], ["venue", 0], ["finale", 0],
];
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 860, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];

function decodeQr(pngBuffer) {
  const { data, width, height } = PNG.sync.read(pngBuffer);
  const result = jsQR(new Uint8ClampedArray(data), width, height);
  return result ? result.data : null;
}

async function checkViewport(browser, { name, width, height, mobile }, problems) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`${name} page error: ${error.message}`));
  page.on("console", (msg) => {
    if (!["error", "warning"].includes(msg.type())) return;
    if (IGNORED.some((s) => msg.text().includes(s))) return;
    problems.push(`${name} console ${msg.type()}: ${msg.text()}`);
  });

  await page.goto(PAGE_URL);
  await page.waitForFunction(() => !document.getElementById("loader"), null, { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, `${name}-0-hero.png`) });

  for (const [index, [id, fraction]] of SECTIONS.entries()) {
    await page.evaluate(([sectionId, frac]) => {
      const r = document.getElementById(sectionId).getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + r.height * frac - 20, behavior: "instant" });
    }, [id, fraction]);
    await page.waitForTimeout(id === "moments" ? 2500 : 900);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${index + 1}-${id}.png`) });
  }

  const qr = await page.locator(".qr").first().screenshot({ path: path.join(SHOTS, `${name}-qr.png`) });
  const decoded = decodeQr(qr);
  if (decoded !== MAPS_URL) problems.push(`${name} QR decodes to ${JSON.stringify(decoded)}`);
  console.log(`${name}: QR -> ${decoded}`);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > width) problems.push(`${name} horizontal overflow: ${scrollWidth}px > ${width}px`);

  if (!mobile) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator(".fact b").first().boundingBox();
    const x = box.x + 90, y = box.y + box.height / 2;
    for (let step = 0; step < 8; step++) {
      await page.mouse.move(x - 24 + step * 3, y - 8 + step);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1200);
    const hasLens = await page.evaluate(() => document.documentElement.classList.contains("has-lens"));
    if (!hasLens) problems.push("desktop: the water-drop lens did not appear on mouse move");
    await page.screenshot({ path: path.join(SHOTS, "desktop-lens.png"), clip: { x: x - 140, y: y - 120, width: 280, height: 240 } });
  }
  await context.close();
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const problems = [];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  try {
    for (const viewport of VIEWPORTS) await checkViewport(browser, viewport, problems);
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error("\nPROBLEMS:");
    problems.forEach((line) => console.error(` - ${line}`));
    process.exit(1);
  }
  console.log(`\nAll checks passed. Screenshots in ${path.relative(ROOT, SHOTS)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
