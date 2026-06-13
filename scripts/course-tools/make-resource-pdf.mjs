#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Générateur de PDF ressource brandé SBI
 * -----------------------------------------------------------------------
 * Rend une fiche A4 brandée (logo emblème SBI recadré + bandeau accent)
 * à partir d'un spec JSON, via Edge headless (--print-to-pdf).
 *
 * Logo : public/assets/Logo_Black_tome.png (2000×2000, ~50 % de marge
 * blanche). On l'embarque en base64 et on isole l'emblème central avec
 * background-size:200% + background-position:center (fenêtre = 50 % central).
 *
 * Spec JSON :
 * {
 *   "code": "BLOC 2.1",
 *   "title": "Fiche des rôles d'un staff e-sport",
 *   "subtitle": "Animateur E-Sport — aide-mémoire réutilisable",
 *   "intro": "Paragraphe d'introduction optionnel.",
 *   "sections": [
 *     { "heading": "1. Titre", "intro": "para optionnel",
 *       "items": ["ligne", "ligne"], "note": "encadré optionnel" }
 *   ],
 *   "footer": "Texte de pied de page optionnel."
 * }
 *
 * Usage : node scripts/course-tools/make-resource-pdf.mjs <spec.json> -o <out.pdf>
 * =======================================================================
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const REPO = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const LOGO = resolve(REPO, 'public/assets/Logo_Black_tome.png');
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(spec, logoB64) {
  const sections = (spec.sections || []).map((sec) => {
    const intro = sec.intro ? `<p class="s-intro">${esc(sec.intro)}</p>` : '';
    const items = Array.isArray(sec.items) && sec.items.length
      ? `<ul>${sec.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>` : '';
    const note = sec.note ? `<p class="note">${esc(sec.note)}</p>` : '';
    return `<section class="block"><h2>${esc(sec.heading)}</h2>${intro}${items}${note}</section>`;
  }).join('');
  const intro = spec.intro ? `<p class="lead">${esc(spec.intro)}</p>` : '';
  const footer = spec.footer ? `<div class="foot">${esc(spec.footer)}</div>` : '';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
@page { size: A4; margin: 14mm 15mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 11.2px; line-height: 1.5; margin: 0; }
.header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #2A57FF; padding-bottom: 12px; margin-bottom: 18px; }
.logo { width: 62px; height: 62px; flex: 0 0 auto; border-radius: 14px;
  background-image: url("data:image/png;base64,${logoB64}");
  background-repeat: no-repeat; background-size: 200% 200%; background-position: center;
  background-color: #fff; border: 1px solid #e2e8f0; }
.head-txt { flex: 1 1 auto; }
.code { font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: #2A57FF; }
h1 { font-size: 19px; margin: 2px 0 3px; color: #0f172a; }
.subtitle { font-size: 11px; color: #64748b; margin: 0; }
.brand { text-align: right; font-size: 9.5px; color: #94a3b8; font-weight: 700; line-height: 1.3; }
.lead { background: #f8fafc; border-left: 3px solid #2A57FF; padding: 9px 12px; border-radius: 6px; margin: 0 0 16px; }
.block { margin: 0 0 13px; break-inside: avoid; }
h2 { font-size: 12.5px; color: #2A57FF; margin: 0 0 5px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }
.s-intro { margin: 0 0 5px; }
ul { margin: 4px 0 0; padding-left: 18px; }
li { margin: 2px 0; }
.note { margin: 6px 0 0; background: #fff3e8; color: #0f172a; font-weight: 600; padding: 7px 10px; border-radius: 6px; }
.foot { margin-top: 14px; padding-top: 9px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; }
</style></head><body>
<div class="header">
  <div class="logo"></div>
  <div class="head-txt">
    <div class="code">${esc(spec.code || 'SBI — Ressource')}</div>
    <h1>${esc(spec.title || 'Fiche ressource')}</h1>
    ${spec.subtitle ? `<p class="subtitle">${esc(spec.subtitle)}</p>` : ''}
  </div>
  <div class="brand">SBI · CFMFS<br>Animateur E-Sport</div>
</div>
${intro}
${sections}
${footer}
</body></html>`;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage : node scripts/course-tools/make-resource-pdf.mjs <spec.json> -o <out.pdf>');
  process.exit(args.length ? 0 : 1);
}
const specPath = resolve(args[0]);
const oFlag = args.indexOf('-o');
const outPath = oFlag >= 0 ? resolve(args[oFlag + 1]) : resolve(dirname(specPath), `${basename(specPath, '.json')}.pdf`);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!existsSync(LOGO)) { console.error(`Logo introuvable : ${LOGO}`); process.exit(1); }
const logoB64 = readFileSync(LOGO).toString('base64');
const html = buildHtml(spec, logoB64);

const work = join(tmpdir(), `sbi-respdf-${Date.now()}`);
mkdirSync(work, { recursive: true });
const htmlPath = join(work, 'resource.html');
writeFileSync(htmlPath, html, 'utf8');
mkdirSync(dirname(outPath), { recursive: true });

const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) { console.error('Edge introuvable.'); process.exit(1); }

execFileSync(edge, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${outPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`
], { stdio: 'pipe' });

try { rmSync(work, { recursive: true, force: true }); } catch {}
console.log(`✔ PDF ressource écrit : ${outPath}`);
