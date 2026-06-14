#!/usr/bin/env node
/**
 * =======================================================================
 * SBI SEO — Générateur de pages statiques par formation (crawlables)
 * -----------------------------------------------------------------------
 * Lit la collection publicFormations (Admin SDK) et génère, pour chaque
 * formation PUBLIÉE et indexable, une page HTML autonome sous
 *   public/formations/<slug>.html
 * avec contenu réel en HTML (titre, description, programme, objectifs,
 * débouchés, conformité), schema.org Course + BreadcrumbList, canonical
 * propre, Open Graph / Twitter. Objectif : indexable par Google ET Bing
 * sans exécution de JavaScript.
 *
 * Émet aussi la liste des URLs (pour mise à jour du sitemap).
 *
 * Usage : node scripts/seo/build-formation-pages.mjs
 * =======================================================================
 */
import admin from '../../public/functions/node_modules/firebase-admin/lib/index.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT_DIR = resolve(REPO, 'public', 'formations');
const ORIGIN = 'https://www.sbigroup.fr';

const sa = JSON.parse(readFileSync(join(homedir(), '.sbi', 'sbi-admin-sa.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escAttr = esc;
const T = (s, d = '') => { const v = (s == null ? '' : String(s)).trim(); return v || d; };

// rendu d'une liste à puces
function ul(items) {
  const arr = (items || []).map(T).filter(Boolean);
  if (!arr.length) return '';
  return `<ul class="fsp-list">${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}
// rendu de sections {title, content} (programme / infos) — content multi-ligne -> <br>
function sections(list) {
  const arr = (list || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!arr.length) return '';
  return arr.map((s) => {
    const title = T(s.title);
    const content = T(s.content);
    const body = content ? `<p class="fsp-section-text">${esc(content).replace(/\n/g, '<br>')}</p>` : '';
    return `<article class="fsp-section">${title ? `<h3>${esc(title)}</h3>` : ''}${body}</article>`;
  }).join('');
}
function complianceBlocks(c) {
  if (!c || typeof c !== 'object') return '';
  const labels = {
    admission: 'Admission', teachingMethods: 'Méthodes pédagogiques', technicalMeans: 'Moyens techniques',
    evaluation: 'Évaluation', certification: 'Certification', accessibility: 'Accessibilité', complaints: 'Réclamations'
  };
  const parts = Object.entries(labels)
    .filter(([k]) => T(c[k]))
    .map(([k, label]) => `<article class="fsp-section"><h3>${esc(label)}</h3><p class="fsp-section-text">${esc(T(c[k])).replace(/\n/g, '<br>')}</p></article>`);
  return parts.join('');
}

const HEAD_LINKS = `  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#050313">
    <link rel="stylesheet" href="/css/style.css?v=8.0P.155">
    <link rel="stylesheet" href="/css/sbi-newsletter.css?v=8.0P.155">
    <link rel="stylesheet" href="/css/sbi-footer.css?v=8.0P.155">
    <link rel="stylesheet" href="/css/sbi-home-responsive.css?v=8.0P.155">
    <link rel="stylesheet" href="/css/sbi-mobile.css?v=8.0P.155">
    <link rel="stylesheet" href="/css/sbi-public-pages.css?v=8.0P.155">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,800;0,900;1,400;1,600;1,800;1,900&display=swap" rel="stylesheet">`;

const HEADER = `    <header class="site-header">
        <div class="logo-container">
            <a href="/index.html" class="header-logo-link">
                <img src="/assets/Logo_SBI_Tome.webp" alt="SBI Logo" class="header-logo" data-site-media="header-logo">
                <img src="/assets/sbi_brand.webp" alt="Sport Business Institute" class="header-brand" data-site-media="brand-logo">
            </a>
        </div>
        <nav class="main-nav">
            <a href="/formations.html" class="nav-link text-italic">Formations</a>
            <a href="/calculateur.html" class="nav-link text-italic">Calculateur</a>
            <a href="/a-propos.html" class="nav-link text-italic">&Agrave; propos</a>
            <a href="/ressources.html" class="nav-link text-italic">Ressources</a>
        </nav>
        <div class="header-actions">
            <a href="/login.html" class="nav-link text-italic">Se connecter</a>
            <a href="/contact.html" class="btn-primary text-italic">Contact</a>
        </div>
        <button class="mobile-menu-toggle" type="button" aria-label="Ouvrir le menu"><span></span><span></span><span></span></button>
    </header>`;

const FOOTER = readFileSync(resolve(REPO, 'public', 'formations.html'), 'utf8')
  .replace(/[\s\S]*?(<footer id="contact")/, '$1')
  .replace(/(<\/footer>)[\s\S]*/, '$1')
  // chemins relatifs -> absolus pour fonctionner depuis /formations/<slug>.html
  .replace(/href="(?!https?:|mailto:|tel:|\/|#)/g, 'href="/')
  .replace(/src="(?!https?:|\/)/g, 'src="/');

const SCOPED_CSS = `<style>
.fsp-main{max-width:960px;margin:0 auto;padding:2.5rem clamp(1.1rem,3vw,2rem) 3rem}
.fsp-hero{position:relative;border-radius:18px;overflow:hidden;padding:clamp(1.6rem,4vw,2.6rem);margin-bottom:2.2rem;background:#0b1226;border:1px solid rgba(126,181,255,.18)}
.fsp-hero.has-cover{background-size:cover;background-position:center}
.fsp-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(5,6,20,.92),rgba(5,6,20,.62))}
.fsp-hero>*{position:relative;z-index:2}
.fsp-kicker{display:inline-block;color:#7eb5ff;font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:.78rem;margin-bottom:.5rem}
.fsp-main h1{font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.12;margin:.1rem 0 .6rem;color:#fff}
.fsp-subtitle{color:#cfe0ff;font-size:1.05rem;margin:0 0 1rem;max-width:60ch}
.fsp-meta{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.2rem}
.fsp-chip{border:1px solid rgba(126,181,255,.35);color:#dbe8ff;border-radius:999px;padding:.3rem .8rem;font-size:.82rem}
.fsp-cta{display:inline-block;background:#2A57FF;color:#fff;font-weight:700;border-radius:10px;padding:.75rem 1.3rem;text-decoration:none}
.fsp-cta:hover{background:#1f45d6}
.fsp-lead{color:#c7d5ee;line-height:1.7;font-size:1.02rem;margin:0 0 2rem;white-space:pre-line}
.fsp-main h2{color:#fff;font-size:1.3rem;margin:2.2rem 0 .9rem;padding-bottom:.5rem;border-bottom:1px solid rgba(126,181,255,.2)}
.fsp-list{margin:.4rem 0 0;padding-left:1.2rem;display:grid;gap:.5rem}
.fsp-list li{color:#c7d5ee;line-height:1.6}
.fsp-section{margin:0 0 1.2rem}
.fsp-section h3{color:#d7e7ff;font-size:1.02rem;margin:0 0 .4rem}
.fsp-section-text{color:#bcd0ef;line-height:1.7;margin:0}
.fsp-back{display:inline-block;margin-top:2.2rem;color:#7eb5ff;text-decoration:none}
.fsp-final{margin-top:2.4rem;text-align:center;padding:2rem 1rem;border-radius:16px;background:rgba(42,87,255,.12);border:1px solid rgba(126,181,255,.25)}
.fsp-final h2{border:0;justify-content:center}
</style>`;

function buildPage(f) {
  const slug = T(f.slug);
  const url = `${ORIGIN}/formations/${slug}.html`;
  const titleTag = T(f.seo?.title, `${T(f.title)} - Formation Sport Business Institute`);
  const desc = T(f.seo?.description || f.shortSummary || f.longDescription,
    `Découvrez la formation ${T(f.title)} proposée par Sport Business Institute.`).slice(0, 300);
  const cover = T(f.cover?.url || f.seo?.ogImageUrl, `${ORIGIN}/assets/Logo_SBI_Tome.webp`);
  const indexable = f.seo?.indexable !== false;
  const robots = indexable ? 'index, follow' : 'noindex, follow';
  const chips = [T(f.duration), T(f.level), T(f.modality), T(f.targetAudience)].filter(Boolean)
    .map((c) => `<span class="fsp-chip">${esc(c)}</span>`).join('');

  const course = {
    '@context': 'https://schema.org', '@type': 'Course',
    name: T(f.title), description: desc, url,
    ...(cover ? { image: cover } : {}),
    inLanguage: 'fr-FR',
    ...(f.modality ? { courseMode: T(f.modality) } : {}),
    ...(f.level ? { educationalLevel: T(f.level) } : {}),
    provider: { '@type': 'EducationalOrganization', name: 'Sport Business Institute', url: ORIGIN, sameAs: ORIGIN },
    offers: { '@type': 'Offer', category: 'Formation professionnelle', availability: 'https://schema.org/InStock', url }
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Formations', item: `${ORIGIN}/formations.html` },
      { '@type': 'ListItem', position: 3, name: T(f.title), item: url }
    ]
  };

  const programHtml = sections(f.program);
  const infoHtml = sections(f.infoSections);
  const compHtml = complianceBlocks(f.complianceSections);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(titleTag)}</title>
    <meta name="description" content="${escAttr(desc)}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${escAttr(url)}">
    <meta property="og:locale" content="fr_FR">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Sport Business Institute">
    <meta property="og:title" content="${escAttr(T(f.seo?.ogTitle, titleTag))}">
    <meta property="og:description" content="${escAttr(T(f.seo?.ogDescription, desc))}">
    <meta property="og:url" content="${escAttr(url)}">
    <meta property="og:image" content="${escAttr(cover)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escAttr(titleTag)}">
    <meta name="twitter:description" content="${escAttr(desc)}">
    <meta name="twitter:image" content="${escAttr(cover)}">
    <script type="application/ld+json">${JSON.stringify(course)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
${HEAD_LINKS}
    ${SCOPED_CSS}
</head>
<body data-sbi-public-page="formation-detail">
    <a class="sbi-skip-link" href="#fsp-main">Aller au contenu</a>
${HEADER}
    <main id="fsp-main" class="fsp-main">
        <section class="fsp-hero${cover ? ' has-cover' : ''}"${cover ? ` style="background-image:linear-gradient(120deg,rgba(5,6,20,.6),rgba(5,6,20,.4)),url('${escAttr(cover)}')"` : ''}>
            <span class="fsp-kicker">${esc(T(f.category, 'Formation SBI'))}</span>
            <h1>${esc(T(f.title))}</h1>
            ${T(f.subtitle) ? `<p class="fsp-subtitle">${esc(T(f.subtitle))}</p>` : ''}
            <div class="fsp-meta">${chips}</div>
            <a class="fsp-cta" href="/contact.html?formation=${encodeURIComponent(slug)}">Demander des informations →</a>
        </section>

        ${T(f.longDescription || f.shortSummary) ? `<p class="fsp-lead">${esc(T(f.longDescription || f.shortSummary))}</p>` : ''}

        ${ul(f.objectives) ? `<h2>Objectifs de la formation</h2>${ul(f.objectives)}` : ''}
        ${programHtml ? `<h2>Programme détaillé</h2>${programHtml}` : ''}
        ${ul(f.prerequisites) ? `<h2>Prérequis</h2>${ul(f.prerequisites)}` : ''}
        ${ul(f.highlights) ? `<h2>Points forts</h2>${ul(f.highlights)}` : ''}
        ${ul(f.outcomes) ? `<h2>Débouchés</h2>${ul(f.outcomes)}` : ''}
        ${infoHtml ? `<h2>Informations pratiques</h2>${infoHtml}` : ''}
        ${compHtml ? `<h2>Modalités et conformité</h2>${compHtml}` : ''}

        <div class="fsp-final">
            <h2>Prêt à te lancer ?</h2>
            <p class="fsp-section-text" style="margin-bottom:1.1rem">Rejoins la formation ${esc(T(f.title))} et construis ton projet dans le sport business.</p>
            <a class="fsp-cta" href="/contact.html?formation=${encodeURIComponent(slug)}">Demander des informations →</a>
        </div>

        <a class="fsp-back" href="/formations.html">← Toutes les formations</a>
    </main>
${FOOTER}
    <script src="/js/sbi-background.js?v=8.0P.155"></script>
    <script src="/js/main.js?v=8.0P.80"></script>
    <script src="/js/sbi-analytics.js?v=8.0P.156"></script>
    <script>window.sbiTrack&&window.sbiTrack('formation_open',{slug:${JSON.stringify(slug)}});</script>
</body></html>`;
  return { slug, url, indexable, html };
}

const snap = await db.collection('publicFormations').get();
const formations = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  .filter((f) => f.status === 'published' && T(f.slug));

mkdirSync(OUT_DIR, { recursive: true });
const urls = [];
for (const f of formations) {
  const page = buildPage(f);
  writeFileSync(resolve(OUT_DIR, `${page.slug}.html`), page.html, 'utf8');
  if (page.indexable) urls.push(page.url);
  console.log(`✔ ${page.slug}.html  (${page.indexable ? 'index' : 'noindex'})  "${T(f.title)}"`);
}
console.log(`\n${formations.length} pages générées. URLs indexables (${urls.length}) :`);
urls.forEach((u) => console.log('  ' + u));
process.exit(0);
