#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Générateur d'infographie pédagogique brandée (PNG)
 * -----------------------------------------------------------------------
 * Rend une image 1600x900 (×2 = 3200x1800) brandée SBI à partir d'un spec
 * JSON, via Edge headless (--screenshot). Sert à produire les visuels de
 * leçon (schémas légendés) sans modèle de diffusion : texte net et exact.
 *
 * Layouts : "timeline" (frise reliée), "cards" (grille de cartes),
 *           "columns" (colonnes à puces, ex. comparaison), "flow" (étapes).
 *
 * Spec JSON :
 * {
 *   "kicker": "Bloc 2 — Relances",
 *   "title": "L'escalade d'une relance d'impayé",
 *   "subtitle": "Rester ferme sur le fond, courtois sur la forme",
 *   "badge": { "big": "RNCP38625", "small": "Niveau 4" },   // optionnel
 *   "layout": "timeline",
 *   "items": [ { "icon":"mail", "title":"Rappel courtois", "desc":"…", "tag":"J+3", "accent":"amber" } ],
 *   "columns": [ { "heading":"Segmentation", "accent":"blue", "items":["…","…"] } ], // layout columns
 *   "footer": { "left":"SBI · CFMFS", "right":"Assistant d'administration commerciale (TPE/PME)" }
 * }
 *
 * Usage : node scripts/course-tools/make-infographic.mjs <spec.json> -o <out.png>
 * =======================================================================
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];

// Bibliothèque d'icônes (stroke, viewBox 0 0 24 24). Enrichie : au besoin,
// choisir l'icône qui colle le mieux à l'objet nommé dans le prompt.
const ICONS = {
  rocket: '<path d="M4.5 16.5 3 21l4.5-1.5"/><path d="M14 4l6 6-9.5 9.5-6-1.5L3 12z"/><path d="M14 4l6 6"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  receipt: '<path d="M6 2h9l4 4v16H6z"/><path d="M9 8h7"/><path d="M9 12h7"/><path d="M9 16h4"/>',
  headset: '<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 0z"/><path d="M20 13v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 0z"/><path d="M14 20h-2"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  trending: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  cap: '<path d="M12 4 2 9l10 5 10-5z"/><path d="M6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5"/><path d="M22 9v5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M4 4h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chart: '<path d="M4 4v16h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6a3 3 0 0 1 0 6"/><path d="M21 20a6 6 0 0 0-4-5.6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5"/><path d="M10 16h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.3 11 6.4-3.6"/><path d="m8.3 13 6.4 3.6"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10c-1 1-1.3 1.6-1.4 2.5H9.4C9.3 14.6 9 14 8 13a6 6 0 0 1 4-10z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  // — ajouts —
  funnel: '<path d="M3 5h18l-7 9v5l-4 2v-7z"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  handshake: '<path d="M8 13l3 3 2-2 3 3"/><path d="M3 10l4-4 4 4"/><path d="M21 10l-4-4-3 3"/><path d="M7 13l-4 3M17 16l4-3"/>',
  megaphone: '<path d="M3 11v2l12 5V6z"/><path d="M15 8a3 3 0 0 1 0 8"/><path d="M6 14v3a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  star: '<path d="m12 3 2.9 6 6.1.5-4.6 4 1.4 6L12 17l-5.8 2.5 1.4-6L3 9.5 9.1 9z"/>',
  pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pen: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 14-5l2 2"/><path d="M20 5v4h-4"/><path d="M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M4 19v-4h4"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  tag: '<path d="M3 12l9-9h6a3 3 0 0 1 3 3v6l-9 9z"/><circle cx="16.5" cy="7.5" r="1.5"/>',
  warning: '<path d="M12 3 2 20h20z"/><path d="M12 9v5"/><circle cx="12" cy="17.5" r="0.6"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3"/><ellipse cx="15" cy="14" rx="6" ry="3"/><path d="M9 14v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4"/>',
  euro: '<circle cx="12" cy="12" r="9"/><path d="M15 8a4 4 0 1 0 0 8"/><path d="M7 11h6M7 14h5"/>',
  tree: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v4M6 17v-3h12v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m5 18 5-5 4 4 2-2 3 3"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  thumbsup: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-8a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2l-1.5 6a2 2 0 0 1-2 1.5H7"/>',
  arrow: '<path d="M4 12h14"/><path d="m13 6 6 6-6 6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9h9A9 9 0 0 0 12 3z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  dot: '<circle cx="12" cy="12" r="6"/>'
};
const ACCENTS = {
  blue: { main: '#2A57FF', soft: '#eaf0ff', bd: '#d6e0ff', sh: 'rgba(42,87,255,' },
  amber: { main: '#f59e0b', soft: '#fff5e6', bd: '#fde3b8', sh: 'rgba(245,158,11,' },
  green: { main: '#10b981', soft: '#e7faf3', bd: '#bff0dc', sh: 'rgba(16,185,129,' },
  violet: { main: '#7c5cff', soft: '#f0ecff', bd: '#ddd3ff', sh: 'rgba(124,92,255,' }
};
const acc = (name) => ACCENTS[name] || ACCENTS.blue;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function icon(name, color) {
  return `<svg viewBox="0 0 24 24" style="stroke:${color}">${ICONS[name] || ICONS.dot}</svg>`;
}

function renderTimeline(spec) {
  const items = spec.items || [];
  const nodes = items.map((it, i) => {
    const a = acc(it.accent);
    return `<div class="step">
      <div class="node" style="border-color:${a.main};box-shadow:0 14px 26px ${a.sh}.18)">
        <span class="num" style="background:${a.main};box-shadow:0 4px 10px ${a.sh}.4)">${i + 1}</span>
        ${icon(it.icon, a.main)}
      </div>
      <div class="st-title">${esc(it.title)}</div>
      ${it.desc ? `<div class="st-desc">${esc(it.desc)}</div>` : ''}
      ${it.tag ? `<span class="st-tag" style="color:${a.main};background:${a.soft};border-color:${a.bd}">${esc(it.tag)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="track" style="grid-template-columns:repeat(${items.length},1fr)"><div class="line"></div>${nodes}</div>`;
}

function renderCards(spec) {
  const items = spec.items || [];
  const cols = items.length <= 4 ? items.length : (items.length % 3 === 0 ? 3 : (items.length % 2 === 0 ? 2 : 3));
  const cards = items.map((it) => {
    const a = acc(it.accent);
    return `<div class="card" style="border-top:4px solid ${a.main}">
      <div class="c-ico" style="background:${a.soft}">${icon(it.icon, a.main)}</div>
      <div class="c-title">${esc(it.title)}</div>
      ${it.desc ? `<div class="c-desc">${esc(it.desc)}</div>` : ''}
      ${it.tag ? `<span class="st-tag" style="color:${a.main};background:${a.soft};border-color:${a.bd}">${esc(it.tag)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="cards" style="grid-template-columns:repeat(${cols},1fr)">${cards}</div>`;
}

function renderColumns(spec) {
  const cols = spec.columns || [];
  const out = cols.map((col) => {
    const a = acc(col.accent);
    const items = (col.items || []).map((t) => `<li><span class="li-dot" style="background:${a.main}"></span><span>${esc(t)}</span></li>`).join('');
    return `<div class="col" style="border-top:5px solid ${a.main}">
      <div class="col-h" style="color:${a.main}">${col.icon ? `<span class="col-ico">${icon(col.icon, a.main)}</span>` : ''}${esc(col.heading)}</div>
      <ul>${items}</ul>
    </div>`;
  }).join('');
  return `<div class="cols" style="grid-template-columns:repeat(${cols.length},1fr)">${out}</div>`;
}

// hub : un noeud central + des satellites disposés en cercle autour.
function renderHub(spec) {
  const items = spec.items || [];
  const n = items.length || 1;
  const c = spec.center || { icon: spec.centerIcon || 'target', title: spec.centerTitle || '' };
  const ca = acc(c.accent);
  const rx = 470, ry = 220;
  const sat = items.map((it, i) => {
    const a = acc(it.accent);
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const x = Math.round(rx * Math.cos(ang)), y = Math.round(ry * Math.sin(ang));
    return `<div class="sat" style="left:calc(50% + ${x}px);top:calc(50% + ${y}px)">
      <div class="sat-ic" style="background:${a.soft};border-color:${a.bd}">${icon(it.icon, a.main)}</div>
      <div class="sat-txt"><div class="sat-t">${esc(it.title)}</div>${it.desc ? `<div class="sat-d">${esc(it.desc)}</div>` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="hub"><div class="hub-c" style="border-color:${ca.main};box-shadow:0 20px 50px ${ca.sh}.25)">
    <div class="hub-ic">${icon(c.icon, ca.main)}</div><div class="hub-t">${esc(c.title)}</div></div>${sat}</div>`;
}

// split : deux grands panneaux face à face (comparaison, avant/après).
function renderSplit(spec) {
  const cols = (spec.columns || []).slice(0, 2);
  const panel = (col) => {
    const a = acc(col.accent);
    const items = (col.items || []).map((t) => `<li><span class="li-dot" style="background:${a.main}"></span><span>${esc(t)}</span></li>`).join('');
    return `<div class="sp-panel" style="border-top:6px solid ${a.main}">
      <div class="sp-ic" style="background:${a.soft}">${icon(col.icon, a.main)}</div>
      <div class="sp-h" style="color:${a.main}">${esc(col.heading)}</div>
      ${col.lead ? `<p class="sp-lead">${esc(col.lead)}</p>` : ''}<ul>${items}</ul></div>`;
  };
  return `<div class="split">${panel(cols[0] || {})}<div class="sp-vs">${esc(spec.vs || 'vs')}</div>${panel(cols[1] || {})}</div>`;
}

// funnel : barres de largeur décroissante (entonnoir, priorisation, hiérarchie).
function renderFunnel(spec) {
  const items = spec.items || [];
  const n = items.length || 1;
  const rows = items.map((it, i) => {
    const a = acc(it.accent);
    const w = Math.round(100 - i * (52 / Math.max(1, n - 1)));
    return `<div class="fn-row"><div class="fn-bar" style="width:${w}%;background:linear-gradient(90deg,${a.main},${a.main}cc)">
      <span class="fn-ic">${icon(it.icon, '#fff')}</span><span class="fn-t">${esc(it.title)}</span></div>
      ${it.desc ? `<div class="fn-d">${esc(it.desc)}</div>` : ''}</div>`;
  }).join('');
  return `<div class="funnel">${rows}</div>`;
}

// stats : tuiles de grands chiffres/valeurs (indicateurs, KPI, durées).
function renderStats(spec) {
  const items = spec.items || [];
  const tiles = items.map((it) => {
    const a = acc(it.accent);
    return `<div class="stat" style="border-bottom:5px solid ${a.main}">
      ${it.icon ? `<div class="stat-ic" style="color:${a.main}">${icon(it.icon, a.main)}</div>` : ''}
      <div class="stat-v" style="color:${a.main}">${esc(it.value || it.title)}</div>
      <div class="stat-l">${esc(it.desc || (it.value ? it.title : ''))}</div></div>`;
  }).join('');
  return `<div class="stats" style="grid-template-columns:repeat(${Math.min(items.length, 5)},1fr)">${tiles}</div>`;
}

function buildHtml(spec) {
  const layout = spec.layout || 'cards';
  const body = layout === 'timeline' || layout === 'flow' ? renderTimeline(spec)
    : layout === 'columns' ? renderColumns(spec)
    : layout === 'hub' ? renderHub(spec)
    : layout === 'split' ? renderSplit(spec)
    : layout === 'funnel' || layout === 'pyramid' ? renderFunnel(spec)
    : layout === 'stats' || layout === 'kpi' ? renderStats(spec)
    : renderCards(spec);
  const badge = spec.badge ? `<div class="badge"><span class="dot"></span><span>${esc(spec.badge.big || '')}${spec.badge.small ? `<small>${esc(spec.badge.small)}</small>` : ''}</span></div>` : '';
  const foot = spec.footer ? `<div class="foot"><span class="brand">${esc(spec.footer.left || 'SBI · CFMFS')}</span><span>${esc(spec.footer.right || '')}</span></div>` : '';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { width:1600px; height:900px; }
  body { font-family:"Segoe UI",Arial,sans-serif; color:#0f172a; padding:60px 70px 52px; position:relative; overflow:hidden;
    background:radial-gradient(1200px 700px at 82% -12%, #eef2ff 0%, #f8fafc 55%, #f4f6fb 100%); display:flex; flex-direction:column; }
  .corner { position:absolute; width:520px; height:520px; border-radius:50%; top:-190px; left:-160px;
    background:radial-gradient(circle, rgba(42,87,255,.10), rgba(42,87,255,0) 70%); }
  .head { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
  .kicker { font-size:15px; font-weight:800; letter-spacing:.22em; text-transform:uppercase; color:#2A57FF; }
  h1 { font-size:44px; line-height:1.07; margin-top:8px; color:#0b1220; letter-spacing:-.5px; max-width:1050px; }
  .sub { font-size:20px; color:#64748b; margin-top:10px; font-weight:500; max-width:1050px; }
  .badge { flex:0 0 auto; display:inline-flex; align-items:center; gap:12px; background:#0b1220; color:#fff;
    padding:14px 22px; border-radius:999px; font-weight:700; font-size:18px; box-shadow:0 12px 30px rgba(11,18,32,.28); white-space:nowrap; }
  .badge .dot { width:11px; height:11px; border-radius:50%; background:#2A57FF; box-shadow:0 0 0 4px rgba(42,87,255,.25); }
  .badge small { display:block; font-size:12px; font-weight:600; color:#93a4c7; letter-spacing:.12em; text-transform:uppercase; }
  .stage { flex:1 1 auto; display:flex; align-items:center; }        /* centre verticalement le contenu */
  .stage > * { width:100%; }
  svg { width:40px; height:40px; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  /* timeline */
  .track { position:relative; display:grid; gap:20px; }
  .line { position:absolute; top:44px; left:6%; right:6%; height:5px; border-radius:5px;
    background:linear-gradient(90deg,#2A57FF,#5b7bff); opacity:.9; }
  .step { position:relative; text-align:center; padding:0 6px; }
  .node { width:88px; height:88px; border-radius:50%; margin:0 auto; background:#fff; border:3px solid #2A57FF;
    display:flex; align-items:center; justify-content:center; position:relative; z-index:2; }
  .num { position:absolute; top:-10px; right:-8px; width:30px; height:30px; border-radius:50%; color:#fff;
    font-size:15px; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .st-title { margin-top:20px; font-size:20px; font-weight:750; color:#0b1220; line-height:1.15; }
  .st-desc { margin-top:8px; font-size:15px; color:#64748b; line-height:1.35; }
  .st-tag { display:inline-block; margin-top:12px; font-size:12.5px; font-weight:700; padding:4px 11px; border-radius:999px; border:1px solid; }
  /* cards */
  .cards { display:grid; gap:26px; }
  .card { background:#fff; border-radius:16px; padding:26px 24px 22px; box-shadow:0 18px 40px rgba(15,23,42,.08);
    border:1px solid #eef1f7; text-align:left; }
  .c-ico { width:60px; height:60px; border-radius:14px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; }
  .c-title { font-size:22px; font-weight:750; color:#0b1220; line-height:1.15; }
  .c-desc { font-size:16px; color:#64748b; line-height:1.4; margin-top:8px; }
  .card .st-tag { margin-top:14px; }
  /* columns */
  .cols { display:grid; gap:28px; }
  .col { background:#fff; border-radius:16px; padding:24px 26px 24px; box-shadow:0 18px 40px rgba(15,23,42,.08); border:1px solid #eef1f7; }
  .col-h { font-size:22px; font-weight:800; display:flex; align-items:center; gap:12px; margin-bottom:16px; }
  .col-ico svg { width:28px; height:28px; }
  .col ul { list-style:none; }
  .col li { display:flex; align-items:flex-start; gap:12px; font-size:17px; color:#243244; line-height:1.4; margin:12px 0; }
  .li-dot { flex:0 0 auto; width:10px; height:10px; border-radius:50%; margin-top:7px; }
  /* hub */
  .hub { position:relative; width:100%; height:560px; }
  .hub-c { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:200px; height:200px; border-radius:50%;
    background:#fff; border:4px solid #2A57FF; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; z-index:3; padding:14px; }
  .hub-ic svg { width:52px; height:52px; }
  .hub-t { margin-top:8px; font-size:19px; font-weight:800; color:#0b1220; line-height:1.15; }
  .sat { position:absolute; transform:translate(-50%,-50%); width:270px; display:flex; align-items:center; gap:14px;
    background:#fff; border:1px solid #eef1f7; border-radius:14px; padding:14px 16px; box-shadow:0 14px 32px rgba(15,23,42,.10); }
  .sat-ic { flex:0 0 auto; width:52px; height:52px; border-radius:12px; border:1px solid; display:flex; align-items:center; justify-content:center; }
  .sat-ic svg { width:28px; height:28px; }
  .sat-t { font-size:17px; font-weight:750; color:#0b1220; line-height:1.15; }
  .sat-d { font-size:13.5px; color:#64748b; margin-top:3px; line-height:1.3; }
  /* split */
  .split { display:flex; align-items:stretch; gap:0; }
  .sp-panel { flex:1; background:#fff; border-radius:18px; padding:28px 30px; box-shadow:0 18px 40px rgba(15,23,42,.08); border:1px solid #eef1f7; }
  .sp-ic { width:62px; height:62px; border-radius:14px; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
  .sp-h { font-size:26px; font-weight:800; }
  .sp-lead { font-size:15.5px; color:#64748b; margin:6px 0 4px; }
  .sp-panel ul { list-style:none; margin-top:12px; }
  .sp-panel li { display:flex; align-items:flex-start; gap:12px; font-size:17px; color:#243244; line-height:1.4; margin:11px 0; }
  .sp-vs { flex:0 0 auto; align-self:center; margin:0 -22px; z-index:2; width:64px; height:64px; border-radius:50%; background:#0b1220; color:#fff;
    display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; box-shadow:0 12px 26px rgba(11,18,32,.3); text-transform:uppercase; }
  /* funnel */
  .funnel { display:flex; flex-direction:column; align-items:center; gap:16px; }
  .fn-row { width:100%; display:flex; flex-direction:column; align-items:center; }
  .fn-bar { height:66px; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:14px; color:#fff;
    box-shadow:0 12px 26px rgba(15,23,42,.14); }
  .fn-ic svg { width:30px; height:30px; stroke:#fff; }
  .fn-t { font-size:21px; font-weight:750; }
  .fn-d { font-size:14.5px; color:#64748b; margin-top:6px; text-align:center; }
  /* stats */
  .stats { display:grid; gap:24px; }
  .stat { background:#fff; border-radius:16px; padding:26px 20px; text-align:center; box-shadow:0 18px 40px rgba(15,23,42,.08); border:1px solid #eef1f7; }
  .stat-ic svg { width:34px; height:34px; }
  .stat-v { font-size:40px; font-weight:850; line-height:1.05; margin-top:6px; letter-spacing:-.5px; }
  .stat-l { font-size:15.5px; color:#64748b; margin-top:8px; line-height:1.3; }
  /* footer */
  .foot { display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:18px; margin-top:8px;
    font-size:15px; color:#94a3b8; font-weight:600; }
  .foot .brand { color:#2A57FF; font-weight:800; letter-spacing:.04em; }
</style></head><body>
  <div class="corner"></div>
  <div class="head"><div><div class="kicker">${esc(spec.kicker || 'SBI')}</div><h1>${esc(spec.title || '')}</h1>${spec.subtitle ? `<div class="sub">${esc(spec.subtitle)}</div>` : ''}</div>${badge}</div>
  <div class="stage">${body}</div>
  ${foot}
</body></html>`;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage : node scripts/course-tools/make-infographic.mjs <spec.json> -o <out.png>');
  process.exit(args.length ? 0 : 1);
}
const specPath = resolve(args[0]);
const oFlag = args.indexOf('-o');
const outPath = oFlag >= 0 ? resolve(args[oFlag + 1]) : resolve(dirname(specPath), `${basename(specPath, '.json')}.png`);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const work = join(tmpdir(), `sbi-img-${Date.now()}-${Math.floor(process.hrtime()[1] % 100000)}`);
mkdirSync(work, { recursive: true });
const htmlPath = join(work, 'infographic.html');
writeFileSync(htmlPath, buildHtml(spec), 'utf8');
mkdirSync(dirname(outPath), { recursive: true });

const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) { console.error('Edge introuvable.'); process.exit(1); }

execFileSync(edge, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=1600,900', `--screenshot=${outPath}`, htmlPath
], { stdio: 'pipe' });
rmSync(work, { recursive: true, force: true });

if (!existsSync(outPath)) { console.error('Échec du rendu PNG.'); process.exit(1); }
console.log(`OK ${outPath}`);
