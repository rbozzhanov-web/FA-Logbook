#!/usr/bin/env node
/**
 * Extracts a roster PDF into the exact `ExtractedPage[]` shape the app produces at runtime, for
 * testing the parser against a real report.
 *
 * The app runs pdf.js inside a WebView because Hermes cannot load its worker; this script runs
 * the very same bundled build under Node, so the fixture it writes is byte-for-byte what the
 * parser will be handed on a device. Extracting with any other PDF library would test a
 * tokenization the app never sees.
 *
 *   node scripts/extract-roster.mjs <report.pdf> [out.json]
 *
 * Output defaults to /tmp/fa-realcheck/pages.json, which is where the real-roster test looks.
 * Rosters are personal — names, staff numbers, hotel addresses — so the fixture is written
 * outside the repository and must not be committed.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
  console.error('usage: node scripts/extract-roster.mjs <report.pdf> [out.json]');
  process.exit(1);
}

const input = resolve(inputArg);
const output = resolve(outputArg ?? '/tmp/fa-realcheck/pages.json');

// The bundled pdf.js ships as .mjs.txt so Metro treats it as an asset (see metro.config.js).
// Node needs the real extension to import it, so stage a copy with the names it expects.
const staging = mkdtempSync(join(tmpdir(), 'fa-pdfjs-'));
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copyFileSync(join(repoRoot, 'assets', 'pdfjs', `${name}.txt`), join(staging, name));
}

const pdfjsLib = await import(pathToFileURL(join(staging, 'pdf.min.mjs')).href);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(join(staging, 'pdf.worker.min.mjs')).href;

const doc = await pdfjsLib.getDocument({ data: new Uint8Array(readFileSync(input)) }).promise;
const pages = [];

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  pages.push({
    // Mirrors assets/pdfjs/viewer.html exactly, including the bottom-up to top-down flip.
    items: content.items.map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5],
      width: item.width,
    })),
    width: viewport.width,
    height: viewport.height,
  });
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(pages, null, 1));
console.log(`wrote ${pages.length} page(s) to ${output}`);
