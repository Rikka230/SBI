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
let booted = false;

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

function renderChart(days) {
  const svg = $('sbi-an-chart');
  if (!svg) return;
  const W = 720, H = 200, padX = 8, padTop = 12, padBot = 22;
  const n = days.length;
  if (!n) { svg.innerHTML = ''; return; }
  const maxPV = Math.max(1, ...days.map((d) => d.pageViews));
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBot;
  const bw = innerW / n;
  const y = (v) => padTop + innerH - (v / maxPV) * innerH;
  let bars = '';
  let pts = [];
  days.forEach((d, i) => {
    const x = padX + i * bw;
    const h = (d.pageViews / maxPV) * innerH;
    bars += `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${(padTop + innerH - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="rgba(126,181,255,.35)"></rect>`;
    pts.push(`${(x + bw / 2).toFixed(1)},${y(d.sessions).toFixed(1)}`);
  });
  const line = `<polyline points="${pts.join(' ')}" fill="none" stroke="#2A57FF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>`;
  const dots = days.map((d, i) => `<circle cx="${(padX + i * bw + bw / 2).toFixed(1)}" cy="${y(d.sessions).toFixed(1)}" r="2.6" fill="#2A57FF"></circle>`).join('');
  // labels: first / mid / last date
  const labelIdx = n <= 1 ? [0] : [0, Math.floor(n / 2), n - 1];
  const labels = labelIdx.map((i) => {
    const x = padX + i * bw + bw / 2;
    const dd = days[i].date.slice(5);
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    return `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="11" fill="rgba(200,215,240,.6)" text-anchor="${anchor}">${dd}</text>`;
  }).join('');
  svg.innerHTML = bars + line + dots + labels;
  $('sbi-an-chart-legend').innerHTML = '<span style="color:#2A57FF">●</span> Visiteurs (sessions) &nbsp; <span style="color:rgba(126,181,255,.6)">▮</span> Pages vues &nbsp; — max pages/jour : ' + num(maxPV);
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

function boot() {
  if (booted) return;
  booted = true;
  document.getElementById('sbi-an-ranges')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-days]');
    if (btn) loadRange(Number(btn.dataset.days));
  });
  loadRange(currentDays);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = '/login.html'; return; }
  let profile = {};
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    profile = snap.exists() ? (snap.data() || {}) : {};
  } catch (e) { /* noop */ }
  if (isSbiAdminLike(profile)) { boot(); return; }
  const k = $('sbi-an-kpis');
  if (k) k.innerHTML = '<div class="sbi-an-empty">Accès réservé aux administrateurs.</div>';
});
