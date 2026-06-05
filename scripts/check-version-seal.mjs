#!/usr/bin/env node
/**
 * Sceau de version (Candidat A) — garde-fou exécutable.
 *
 * Rend la « deletion test » impossible à régresser : il échoue (exit 1) si un token
 * de cache-bust codé en dur réapparaît sur la COLONNE D'AMORÇAGE admin. Le principe
 * (voir CONTEXT.md « Sceau de version ») : l'amorce `components.js` est servie
 * no-cache et sans `?v=` sur les pages ; elle lit la version dans sbi-version.js et
 * l'appose à toute la chaîne via withVersion(). Donc :
 *
 *   1. Aucune page admin ne doit charger `components.js?v=…` (l'entrée est tokenless).
 *   2. components.js + components/index.js ne contiennent AUCUN token `?v=8.0P` codé
 *      en dur (tout passe par withVersion / wv → `?v=${V}`, autorisé).
 *   3. bottom-nav.js + shell.js ne portent pas de token codé en dur sur les cibles
 *      SCELLÉES (nav-manifest, sbi-bottom-nav.css, admin-responsive.css).
 *
 * Les tokens FEUILLES profonds (sbi-permissions.js?v=…, account-completeness.js?v=…,
 * booklet-data.js?v=…) restent volontairement hors périmètre passe 1 : l'entrée étant
 * no-cache, plus rien ne gèle la chaîne, et ils auto-cicatrisent en ≤ max-age. Ce
 * garde-fou ne les vérifie donc PAS.
 *
 * Usage : node scripts/check-version-seal.mjs   (aussi : npm run check:version-seal)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// --- 1. Entrée tokenless sur les pages admin -------------------------------
const adminDir = join(root, 'public', 'admin');
for (const f of readdirSync(adminDir)) {
  if (!f.endsWith('.html')) continue;
  const html = readFileSync(join(adminDir, f), 'utf8');
  if (/components\.js\?v=/.test(html)) {
    errors.push(`✗ public/admin/${f} : <script components.js?v=…> doit être TOKENLESS (servi no-cache).`);
  }
}

// --- 2. Amorce + index : aucun token codé en dur (tout via withVersion) ----
const noHardToken = [
  'public/admin/js/components.js',
  'public/admin/js/components/index.js',
];
for (const rel of noHardToken) {
  const src = readFileSync(join(root, rel), 'utf8');
  const hits = src.split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /\?v=8\.0P/.test(line));
  for (const { line, n } of hits) {
    errors.push(`✗ ${rel}:${n} : token codé en dur « ${line.trim()} » — utiliser withVersion()/wv().`);
  }
}

// --- 3. Cibles scellées dans bottom-nav.js / shell.js ----------------------
const sealedTargets = [
  /nav-manifest\.js\?v=8\.0P/,
  /sbi-bottom-nav\.css\?v=8\.0P/,
  /admin-responsive\.css\?v=8\.0P/,
];
for (const rel of ['public/admin/js/components/bottom-nav.js', 'public/admin/js/components/shell.js']) {
  const src = readFileSync(join(root, rel), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (sealedTargets.some((re) => re.test(line))) {
      errors.push(`✗ ${rel}:${i + 1} : cible scellée avec token codé en dur « ${line.trim()} » — la bâtir depuis SBI_VERSION.version.`);
    }
  });
}

if (errors.length) {
  console.error('\nSceau de version — ÉCHEC :\n');
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problème(s). Voir CONTEXT.md « Sceau de version ».\n`);
  process.exit(1);
}
console.log('Sceau de version — OK (entrée tokenless + colonne d\'amorçage scellée).');
