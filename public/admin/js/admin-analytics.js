/**
 * SBI — Audience du site (mesure d'audience maison)
 * Lit les agrégats analyticsDaily/{YYYY-MM-DD} (écrits par la CF
 * ingestAnalytics) et affiche KPIs + graphique + classements.
 * Lecture admin uniquement (règles Firestore).
 */
import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';

let currentDays = 30;
let lastSeries = null;      // dernière série rendue (pour re-render au resize)
let resizeBound = false;

const $ = (id) => document.getElementById(id);
const num = (n) => (Number(n) || 0).toLocaleString('fr-FR');

function fmtDuration(ms) {
  ms = Number(ms) || 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ' min ' + (r < 10 ? '0' + r : r) + ' s';
}

function prettySlug(slug) {
  let s = String(slug || '').replace(/^formation-/, '').replace(/-/g, ' ').trim();
  if (!s) return slug || '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyPage(key) {
  if (key === 'home' || key === '_' || !key) return 'Accueil (/)';
  let p = String(key).replace(/^_/, '').replace(/_html$/, '.html').replace(/_/g, '/');
  return '/' + p;
}

function topList(map, prettify, limitN = 8) {
  const arr = Object.entries(map || {})
    .map(([k, v]) => ({ k, v: Number(v) || 0 }))
    .filter((e) => e.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, limitN);
  if (!arr.length) return '<div class="sbi-an-empty">Aucune donnée sur la période.</div>';
  const max = arr[0].v || 1;
  return arr.map((e) => `
    <div class="sbi-an-bar">
      <span class="name" title="${prettify(e.k)}">${prettify(e.k)}</span>
      <span class="track"><span class="fill" style="width:${Math.max(4, Math.round(e.v / max * 100))}%"></span></span>
      <span class="num">${num(e.v)}</span>
    </div>`).join('');
}

function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function renderChart(days) {
  const svg = $('sbi-an-chart');
  if (!svg) return;
  lastSeries = days;

  // Largeur RÉELLE mesurée → viewBox 1:1. Sinon `preserveAspectRatio="none"`
  // étirait tout horizontalement (points ovales, trait d'épaisseur variable,
  // texte déformé) puisque le conteneur est bien plus large que 720.
  const measured = Math.round(svg.getBoundingClientRect().width);
  const W = measured > 40 ? measured : 720;
  const H = 200;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const padL = 14, padR = 42, padTop = 20, padBot = 28;
  const n = days.length;
  const lg = $('sbi-an-chart-legend');

  const DEFS = `<defs>
    <linearGradient id="anPvFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7eb5ff" stop-opacity="0.34"></stop>
      <stop offset="55%" stop-color="#7eb5ff" stop-opacity="0.10"></stop>
      <stop offset="100%" stop-color="#7eb5ff" stop-opacity="0"></stop>
    </linearGradient>
    <linearGradient id="anLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2A57FF"></stop>
      <stop offset="100%" stop-color="#6f8bff"></stop>
    </linearGradient>
    <filter id="anGlow" x="-20%" y="-60%" width="140%" height="220%">
      <feGaussianBlur stdDeviation="4"></feGaussianBlur>
    </filter>
  </defs>`;

  if (!n) {
    svg.innerHTML = DEFS
      + `<line x1="${padL}" y1="${(H - padBot).toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${(H - padBot).toFixed(1)}" stroke="rgba(126,181,255,.18)" stroke-width="1"></line>`
      + `<text x="${(W / 2).toFixed(1)}" y="${(H / 2).toFixed(1)}" text-anchor="middle" fill="rgba(200,215,240,.5)" font-size="13" font-weight="500">Pas encore de données sur cette période</text>`;
    if (lg) lg.textContent = '';
    return;
  }

  const innerW = W - padL - padR;
  const innerH = H - padTop - padBot;
  const rawMax = Math.max(1, ...days.map((d) => Math.max(d.pageViews, d.sessions)));
  const maxVal = rawMax * 1.18;   // marge haute : le pic ne colle plus au sommet
  const xAt = (i) => n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
  const yAt = (v) => padTop + innerH - (v / maxVal) * innerH;
  const baseY = padTop + innerH;

  // Gridlines horizontales pointillées + valeurs sur l'échelle réelle
  let grid = '';
  for (let g = 0; g <= 3; g++) {
    const gy = padTop + (innerH * g) / 3;
    const val = Math.round(rawMax * (1 - g / 3));
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${gy.toFixed(1)}" stroke="rgba(126,181,255,.09)" stroke-width="1" stroke-dasharray="1 6" stroke-linecap="round"></line>`;
    grid += `<text x="${(W - padR + 7).toFixed(1)}" y="${(gy + 3).toFixed(1)}" font-size="9.5" fill="rgba(200,215,240,.38)" text-anchor="start">${num(val)}</text>`;
  }

  const pvPts = days.map((d, i) => [xAt(i), yAt(d.pageViews)]);
  const sesPts = days.map((d, i) => [xAt(i), yAt(d.sessions)]);

  // Aire dégradée (pages vues) + ligne visiteurs (avec léger halo)
  let area = '';
  if (n === 1) {
    // 1 seul point : petit plateau centré pour éviter le bloc plein
    const x = pvPts[0][0], yPV = pvPts[0][1], yS = sesPts[0][1];
    const half = Math.min(70, innerW / 2);
    area = `<path d="M ${(x - half).toFixed(1)} ${baseY.toFixed(1)} L ${(x - half).toFixed(1)} ${yPV.toFixed(1)} L ${(x + half).toFixed(1)} ${yPV.toFixed(1)} L ${(x + half).toFixed(1)} ${baseY.toFixed(1)} Z" fill="url(#anPvFill)"></path>`;
    area += `<line x1="${(x - half).toFixed(1)}" y1="${yPV.toFixed(1)}" x2="${(x + half).toFixed(1)}" y2="${yPV.toFixed(1)}" stroke="#7eb5ff" stroke-opacity="0.5" stroke-width="1.5"></line>`;
    area += `<line x1="${(x - half).toFixed(1)}" y1="${yS.toFixed(1)}" x2="${(x + half).toFixed(1)}" y2="${yS.toFixed(1)}" stroke="#2A57FF" stroke-width="3" stroke-linecap="round" filter="url(#anGlow)" opacity="0.4"></line>`;
    area += `<line x1="${(x - half).toFixed(1)}" y1="${yS.toFixed(1)}" x2="${(x + half).toFixed(1)}" y2="${yS.toFixed(1)}" stroke="url(#anLine)" stroke-width="2.6" stroke-linecap="round"></line>`;
  } else {
    const pvLine = smoothPath(pvPts);
    const sesLine = smoothPath(sesPts);
    area = `<path d="${pvLine} L ${pvPts[n - 1][0].toFixed(1)} ${baseY.toFixed(1)} L ${pvPts[0][0].toFixed(1)} ${baseY.toFixed(1)} Z" fill="url(#anPvFill)"></path>`;
    area += `<path d="${pvLine}" fill="none" stroke="#7eb5ff" stroke-opacity="0.5" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path>`;
    area += `<path d="${sesLine}" fill="none" stroke="#2A57FF" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#anGlow)" opacity="0.4"></path>`;
    area += `<path d="${sesLine}" fill="none" stroke="url(#anLine)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"></path>`;
  }

  // Points visiteurs ; dernier point = auréole + pastille blanche
  let dots = '';
  sesPts.forEach((p, i) => {
    const last = i === n - 1;
    if (!last && n > 14 && i % Math.ceil(n / 12) !== 0) return; // aère sur 30/90j
    const cx = p[0].toFixed(1), cy = p[1].toFixed(1);
    if (last) {
      dots += `<circle cx="${cx}" cy="${cy}" r="8" fill="#2A57FF" opacity="0.16"></circle>`;
      dots += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#fff" stroke="#2A57FF" stroke-width="3"></circle>`;
    } else {
      dots += `<circle cx="${cx}" cy="${cy}" r="2.4" fill="#2A57FF"></circle>`;
    }
  });

  // Labels de dates : premier / milieu / dernier
  const labelIdx = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const labels = [...new Set(labelIdx)].map((i) => {
    const x = xAt(i);
    const dd = days[i].date.slice(5).replace('-', '/');
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    return `<text x="${x.toFixed(1)}" y="${(H - 8).toFixed(1)}" font-size="10.5" fill="rgba(200,215,240,.5)" text-anchor="${anchor}">${dd}</text>`;
  }).join('');

  svg.innerHTML = DEFS + grid + area + dots + labels;
  if (lg) {
    lg.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:14px;height:3px;border-radius:2px;background:#2A57FF;display:inline-block"></span> Visiteurs</span>'
      + '&nbsp;&nbsp;<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:9px;border-radius:2px;background:linear-gradient(180deg,rgba(126,181,255,.5),rgba(126,181,255,.05));display:inline-block"></span> Pages vues</span>';
  }
}

function setActiveRange(days) {
  document.querySelectorAll('.sbi-an-range-btn').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.days) === days);
  });
}

async function loadRange(days) {
  currentDays = days;
  setActiveRange(days);
  $('sbi-an-kpis').innerHTML = '<div class="sbi-an-empty">Chargement…</div>';
  let docs = [];
  try {
    // Collection minuscule (1 doc/jour) : lecture simple sans orderBy/index,
    // tri + fenêtrage côté client.
    const snap = await getDocs(collection(db, 'analyticsDaily'));
    const all = [];
    snap.forEach((d) => all.push({ date: d.id, ...(d.data() || {}) }));
    all.sort((a, b) => b.date.localeCompare(a.date)); // récent -> ancien
    docs = all.slice(0, days);
  } catch (e) {
    $('sbi-an-kpis').innerHTML = '<div class="sbi-an-empty">Lecture impossible (' + (e && e.code ? e.code : 'erreur') + ').</div>';
    return;
  }
  docs.sort((a, b) => a.date.localeCompare(b.date)); // ancien -> récent (pour le graphe)

  const tot = { sessions: 0, pageViews: 0, dwellTotalMs: 0, dwellCount: 0, formationOpensTotal: 0, brochureDownloadsTotal: 0, contactSubmits: 0 };
  const pages = {}, formationOpens = {}, brochures = {};
  const series = [];
  docs.forEach((d) => {
    tot.sessions += Number(d.sessions) || 0;
    tot.pageViews += Number(d.pageViews) || 0;
    tot.dwellTotalMs += Number(d.dwellTotalMs) || 0;
    tot.dwellCount += Number(d.dwellCount) || 0;
    tot.formationOpensTotal += Number(d.formationOpensTotal) || 0;
    tot.brochureDownloadsTotal += Number(d.brochureDownloadsTotal) || 0;
    tot.contactSubmits += Number(d.contactSubmits) || 0;
    for (const [k, v] of Object.entries(d.pages || {})) pages[k] = (pages[k] || 0) + (Number(v) || 0);
    for (const [k, v] of Object.entries(d.formationOpens || {})) formationOpens[k] = (formationOpens[k] || 0) + (Number(v) || 0);
    for (const [k, v] of Object.entries(d.brochures || {})) brochures[k] = (brochures[k] || 0) + (Number(v) || 0);
    series.push({ date: d.date, pageViews: Number(d.pageViews) || 0, sessions: Number(d.sessions) || 0 });
  });

  const avgMs = tot.dwellCount ? tot.dwellTotalMs / tot.dwellCount : 0;
  const pagesPerVisitor = tot.sessions ? (tot.pageViews / tot.sessions) : 0;
  const convRate = tot.sessions ? (tot.contactSubmits / tot.sessions * 100) : 0;

  $('sbi-an-period').textContent = docs.length
    ? `(${docs[0].date} → ${docs[docs.length - 1].date})`
    : '(aucune donnée encore)';

  $('sbi-an-kpis').innerHTML = [
    { v: num(tot.sessions), l: 'Visiteurs', s: 'sessions uniques' },
    { v: num(tot.pageViews), l: 'Pages vues', s: pagesPerVisitor ? pagesPerVisitor.toFixed(1) + ' / visiteur' : '' },
    { v: fmtDuration(avgMs), l: 'Temps moyen', s: 'par page' },
    { v: num(tot.formationOpensTotal), l: 'Fiches ouvertes', s: 'formations consultées' },
    { v: num(tot.brochureDownloadsTotal), l: 'Brochures', s: 'téléchargées' },
    { v: num(tot.contactSubmits), l: 'Prises de contact', s: convRate ? convRate.toFixed(1) + '% des visiteurs' : '' }
  ].map((k) => `<div class="sbi-an-kpi"><div class="v">${k.v}</div><div class="l">${k.l}</div>${k.s ? `<div class="s">${k.s}</div>` : ''}</div>`).join('');

  renderChart(series);
  $('sbi-an-formations').innerHTML = topList(formationOpens, prettySlug);
  $('sbi-an-pages').innerHTML = topList(pages, prettyPage);
  $('sbi-an-brochures').innerHTML = topList(brochures, (k) => String(k).replace(/_/g, ' '));
  $('sbi-an-conversions').innerHTML = `
    <div class="sbi-an-bar"><span class="name">Prises de contact</span><span class="track"></span><span class="num">${num(tot.contactSubmits)}</span></div>
    <div class="sbi-an-bar"><span class="name">Brochures téléchargées</span><span class="track"></span><span class="num">${num(tot.brochureDownloadsTotal)}</span></div>
    <div class="sbi-an-bar"><span class="name">Fiches formation ouvertes</span><span class="track"></span><span class="num">${num(tot.formationOpensTotal)}</span></div>
    <div class="sbi-an-muted" style="margin-top:10px">Taux de contact : ${convRate.toFixed(1)}% des visiteurs · ${pagesPerVisitor.toFixed(1)} pages/visiteur</div>`;
}

let unsubscribeAuth = null;

function mount() {
  // Re-render du graphe au redimensionnement (viewBox mesuré = largeur réelle).
  if (!resizeBound) {
    resizeBound = true;
    let rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => { if (lastSeries) renderChart(lastSeries); }, 150);
    });
  }

  const ranges = document.getElementById('sbi-an-ranges');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-days]');
      if (btn) loadRange(Number(btn.dataset.days));
    });
  }

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    let profile = {};
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      profile = snap.exists() ? (snap.data() || {}) : {};
    } catch (e) { /* noop */ }
    if (isSbiAdminLike(profile)) { loadRange(currentDays); return; }
    const k = $('sbi-an-kpis');
    if (k) k.innerHTML = '<div class="sbi-an-empty">Accès réservé aux administrateurs.</div>';
  });

  return function cleanup() { unsubscribeAuth?.(); unsubscribeAuth = null; };
}

// Appelé par le route-registry en navigation PJAX.
export function mountAdminAnalytics() { return mount(); }

// Chargement direct de la page (hors PJAX).
function autoMount() {
  if (window.__SBI_APP_SHELL_MOUNTING_ANALYTICS) return;
  mount();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}
