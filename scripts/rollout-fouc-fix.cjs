/**
 * SBI 8.0P.167.348 — Généralise la recette anti-FOUC (validée sur la messagerie)
 * aux pages « shell » élève/prof : thème interne en <link> STATIQUE + classes body
 * statiques, AVANT <script components.js>. Idempotent (skip si déjà appliqué).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const TARGETS = [
  ['student', ['assignments', 'dashboard', 'documents', 'livret', 'mes-cours', 'mon-profil']],
  ['teacher', ['assignments', 'dashboard', 'documents', 'livrets', 'mes-cours', 'mon-profil']],
];

const SCRIPT_LINE = '<script src="/admin/js/components.js"></script>';
const STATIC_BLOCK =
`<!-- 8.0P.167.348 — Theme interne STATIQUE (anti-FOUC, recette validee sur messagerie) -->
    <link rel="stylesheet" href="/admin/css/sbi-internal-theme.css">
    <link rel="stylesheet" href="/admin/css/sbi-ui-polish.css">
    <link rel="stylesheet" href="/admin/css/sbi-ui-fixes.css">
    <link rel="stylesheet" href="/admin/css/admin-surface-unified.css?v=8.0P.167.52">
    <link rel="modulepreload" href="/js/sbi-version.js">
    <link rel="stylesheet" href="/admin/css/sbi-bottom-nav.css" data-sbi-bottom-nav="1">
    `;

let changed = 0, skipped = 0;
for (const [role, names] of TARGETS) {
  for (const name of names) {
    const file = path.join(ROOT, role, `${name}.html`);
    if (!fs.existsSync(file)) { console.log('  (absent) ' + role + '/' + name); continue; }
    let html = fs.readFileSync(file, 'utf8');

    if (html.includes('sbi-internal-theme.css')) { skipped++; console.log('  = deja ok : ' + role + '/' + name); continue; }
    if (!html.includes(SCRIPT_LINE)) { console.log('  ! pas de components.js : ' + role + '/' + name); continue; }

    // 1) Insère le bloc statique avant le <script components.js>.
    html = html.replace(SCRIPT_LINE, STATIC_BLOCK + SCRIPT_LINE);

    // 2) Ajoute les classes body statiques (sbi-internal-ui sbi-{role}-space).
    html = html.replace(/<body class="([^"]*)">/, (m, cls) => {
      if (cls.includes('sbi-internal-ui')) return m;
      return `<body class="${cls} sbi-internal-ui sbi-${role}-space">`;
    });

    fs.writeFileSync(file, html);
    changed++;
    console.log('  + corrige : ' + role + '/' + name);
  }
}
console.log(`\n${changed} page(s) corrigee(s), ${skipped} deja ok.`);
