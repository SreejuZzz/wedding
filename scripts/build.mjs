// Builds site/index.html from src/index.template.html:
// fills the map-link placeholders and inlines the venue QR code as SVG.
//
//   npm run build
//   node scripts/build.mjs [template] [out]
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Exact venue pin, shared by the couple from Google Maps.
export const MAPS_URL = "https://maps.app.goo.gl/kFsiCWWuwiRurToF9";

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

async function qrSvg(url) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return svg.replace(/\s+/g, " ").trim();
}

export async function build(templatePath, outPath) {
  let page = await readFile(templatePath, "utf8");
  page = page
    .replaceAll("{{MAPS_URL}}", escapeHtml(MAPS_URL))
    .replaceAll("{{MAPS_URL_ENCODED}}", encodeURIComponent(MAPS_URL))
    .replaceAll("{{QR_SVG}}", await qrSvg(MAPS_URL));

  const leftover = page.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`Unfilled placeholders: ${[...new Set(leftover)].join(", ")}`);

  await writeFile(outPath, page, "utf8");
  console.log(`built ${path.relative(ROOT, outPath) || outPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [template, out] = process.argv.slice(2);
  build(
    template ? path.resolve(template) : path.join(ROOT, "src", "index.template.html"),
    out ? path.resolve(out) : path.join(ROOT, "site", "index.html"),
  ).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
