// Builds site/index.html from src/index.template.html:
// fills the placeholders, inlines the venue QR code as SVG, makes small copies of the table prints
// and minifies the inline CSS and JS.
//
//   npm run build
//   node scripts/build.mjs [template] [out]
//   MINIFY=0 npm run build        (readable output, for debugging in the browser)
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { transform } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");

// Exact venue pin, shared by the couple from Google Maps.
export const MAPS_URL = "https://maps.app.goo.gl/kFsiCWWuwiRurToF9";

// Prints on the photo table are shown at most ~350 device px wide (~480 under the drop on a phone);
// the lightbox still opens the full photo.
const THUMB_WIDTH = 520, THUMB_QUALITY = 72;
const THUMB_DIR = "photos/thumb";
const THUMB_MANIFEST = path.join(SITE, THUMB_DIR, "sources.json");

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const exists = (file) => access(file).then(() => true, () => false);

async function qrSvg(url) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return svg.replace(/\s+/g, " ").trim();
}

/** Every character of the Malayalam lines, so Google Fonts serves a tiny Manjari subset instead of the whole script. */
function malayalamText(page) {
  const chars = new Set();
  for (const [, text] of page.matchAll(/lang="ml"[^>]*>([^<]+)</g)) for (const ch of text.trim()) chars.add(ch);
  if (!chars.size) throw new Error('No lang="ml" text found for the Manjari subset');
  return encodeURIComponent([...chars].join(""));
}

/** Makes photos/thumb/<name>.jpg for every thumbnail the page uses, when missing or when its source photo changed. */
async function thumbnails(page) {
  const wanted = [...new Set([...page.matchAll(new RegExp(`${THUMB_DIR}/([\\w-]+\\.jpg)`, "g"))].map((m) => m[1]))];
  const manifest = (await exists(THUMB_MANIFEST)) ? JSON.parse(await readFile(THUMB_MANIFEST, "utf8")) : {};
  await mkdir(path.join(SITE, THUMB_DIR), { recursive: true });
  let made = 0;
  for (const name of wanted) {
    const source = await readFile(path.join(SITE, "photos", name));
    const hash = createHash("sha256").update(source).update(`${THUMB_WIDTH}/${THUMB_QUALITY}`).digest("hex").slice(0, 16);
    const out = path.join(SITE, THUMB_DIR, name);
    if (manifest[name] === hash && (await exists(out))) continue;
    await sharp(source)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toFile(out);
    manifest[name] = hash;
    made++;
  }
  await writeFile(THUMB_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (made) console.log(`made ${made} print thumbnail${made === 1 ? "" : "s"}`);
}

/** Fails the build if the page points at a photo or vendor file that isn't in site/. */
async function checkAssets(page) {
  const refs = new Set([...page.matchAll(/(?:src|href|data-full)="((?:photos|vendor)\/[^"]+)"/g)].map((m) => m[1]));
  const missing = [];
  for (const ref of refs) if (!(await exists(path.join(SITE, ref)))) missing.push(ref);
  if (missing.length) throw new Error(`Missing files in site/: ${missing.join(", ")}`);
}

/** Markup between the code blocks: comments go, and indentation between tags shrinks to one newline (same rendering). */
const tidyMarkup = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s*\n\s*</g, ">\n<");

/** Minifies the inline <style> and <script> blocks (esbuild, no syntax lowering) and tidies the markup around them. */
async function minify(page) {
  const re = /<(style|script)>([\s\S]*?)<\/\1>/g;
  let out = "", at = 0;
  for (const m of page.matchAll(re)) {
    const [whole, tag, code] = m;
    const { code: small } = await transform(code, { loader: tag === "style" ? "css" : "js", minify: true, legalComments: "none" });
    out += tidyMarkup(page.slice(at, m.index)) + `<${tag}>${small.trim()}</${tag}>`;
    at = m.index + whole.length;
  }
  return out + tidyMarkup(page.slice(at));
}

export async function build(templatePath, outPath, { minified = process.env.MINIFY !== "0" } = {}) {
  let page = await readFile(templatePath, "utf8");
  page = page
    .replaceAll("{{MAPS_URL}}", escapeHtml(MAPS_URL))
    .replaceAll("{{MAPS_URL_ENCODED}}", encodeURIComponent(MAPS_URL))
    .replaceAll("{{QR_SVG}}", await qrSvg(MAPS_URL))
    .replaceAll("{{ML_TEXT}}", malayalamText(page));

  const leftover = page.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`Unfilled placeholders: ${[...new Set(leftover)].join(", ")}`);

  await thumbnails(page);
  await checkAssets(page);
  if (minified) page = await minify(page);

  await writeFile(outPath, page, "utf8");
  console.log(`built ${path.relative(ROOT, outPath) || outPath} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [template, out] = process.argv.slice(2);
  build(
    template ? path.resolve(template) : path.join(ROOT, "src", "index.template.html"),
    out ? path.resolve(out) : path.join(SITE, "index.html"),
  ).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
