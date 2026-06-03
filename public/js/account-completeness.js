/**
 * =======================================================================
 * SBI — ACCOUNT COMPLETENESS (module partagé)
 * =======================================================================
 * Module vanilla, sans framework, consommé par :
 *  - le panel profil (section « Complétude du compte »)
 *  - l'injection de badge ✗ dans les listes (admin/cockpit + espaces clairs)
 *
 * Aucune dépendance hors Firebase. Doit fonctionner sur fond SOMBRE et CLAIR.
 * Vérif : node --check public/js/account-completeness.js
 * =======================================================================
 */

import { app } from '/js/firebase-init.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

/* -----------------------------------------------------------------------
 * 1) Wrapper Cloud Function — region europe-west1
 * --------------------------------------------------------------------- */

/**
 * Recalcule la complétude d'un compte côté serveur.
 * @param {Object} payload  ex. { uid }
 * @returns {Promise<{ data: { success:boolean, completeness:Object } }>}
 */
export function recomputeAccountCompleteness(payload) {
  const functions = getFunctions(app, 'europe-west1');
  const callable = httpsCallable(functions, 'recomputeAccountCompleteness');
  return callable(payload);
}

/* -----------------------------------------------------------------------
 * 2) Lecture / normalisation de user.completeness
 * --------------------------------------------------------------------- */

/**
 * Normalise le champ `completeness` d'un user.
 * @param {Object} user
 * @returns {{ percent:Number|null, complete:Boolean, missing:String[], items:Array, unknown:Boolean }}
 */
export function readCompleteness(user = {}) {
  const c = user && typeof user === 'object' ? user.completeness : null;
  if (!c || typeof c !== 'object') {
    return { percent: null, complete: false, missing: [], items: [], unknown: true };
  }

  const items = Array.isArray(c.items) ? c.items : [];
  let percent = null;
  if (typeof c.percent === 'number' && isFinite(c.percent)) {
    percent = Math.max(0, Math.min(100, Math.round(c.percent)));
  }

  let missing = Array.isArray(c.missing) ? c.missing.slice() : [];
  // Fallback : déduit `missing` depuis les items si non fourni.
  if (!missing.length && items.length) {
    missing = items
      .filter((it) => it && it.applicable !== false && !it.done)
      .map((it) => (it && it.key) || '')
      .filter(Boolean);
  }

  const complete = c.complete === true || (percent === 100 && !missing.length);

  return { percent, complete, missing, items, unknown: false };
}

/* -----------------------------------------------------------------------
 * 3) Utilitaire d'échappement HTML
 * --------------------------------------------------------------------- */

/**
 * Échappe une chaîne pour insertion HTML sûre.
 * @param {*} s
 * @returns {String}
 */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* -----------------------------------------------------------------------
 * 4) Injection idempotente des styles
 * --------------------------------------------------------------------- */

const STYLE_ID = 'sbi-acc-badge-style';

/**
 * Injecte une seule fois le CSS du badge, de la jauge et de la checklist.
 * Couleurs en rgba + currentColor pour fonctionner sur fond clair ET sombre.
 */
export function injectCompletenessBadgeStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* === SBI account-completeness ============================================ */

/* --- Badge ✗ (chip cliquable inséré dans les listes) --- */
.sbi-acc-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:16px;
  height:16px;
  padding:0;
  margin-left:.4rem;
  vertical-align:middle;
  font-weight:900;
  line-height:1;
  font-size:10px;
  color:#fff;
  background:#ff4a4a;
  border:0;
  border-radius:50%;
  text-decoration:none;
  cursor:pointer;
  box-sizing:border-box;
  box-shadow:0 0 0 2px rgba(255,74,74,.22);
  -webkit-user-select:none;
  user-select:none;
  flex:0 0 auto;
}
.sbi-acc-badge:hover{ background:#e23b3b; }
.sbi-acc-badge:focus-visible,
.sbi-acc-badge:focus{
  outline:2px solid #ff4a4a;
  outline-offset:2px;
}
/* variante non cliquable (uid absent) */
span.sbi-acc-badge{ cursor:default; }

/* --- Jauge (barre + pourcentage) --- */
.sbi-acc-gauge{
  display:flex;
  align-items:center;
  gap:.6rem;
  margin:.25rem 0 .85rem;
}
.sbi-acc-gauge__bar{
  position:relative;
  flex:1 1 auto;
  height:10px;
  border-radius:999px;
  background:rgba(127,127,127,.22);
  overflow:hidden;
}
.sbi-acc-gauge__fill{
  position:absolute;
  inset:0 auto 0 0;
  height:100%;
  width:0%;
  border-radius:999px;
  background:#2ed573;
  transition:width .45s ease;
}
.sbi-acc-gauge__fill[data-incomplete="1"]{ background:#ff4a4a; }
.sbi-acc-gauge__pct{
  flex:0 0 auto;
  font-weight:800;
  font-variant-numeric:tabular-nums;
  min-width:3.2ch;
  text-align:right;
}
.sbi-acc-gauge__ratio{
  flex:0 0 auto;
  font-size:.85em;
  opacity:.75;
  font-variant-numeric:tabular-nums;
}

/* --- Checklist --- */
.sbi-acc-check{
  list-style:none;
  margin:0;
  padding:0;
  display:flex;
  flex-direction:column;
  gap:.4rem;
}
.sbi-acc-check__item{
  display:flex;
  align-items:center;
  gap:.55rem;
  padding:.3rem .1rem;
  border-bottom:1px solid rgba(127,127,127,.18);
}
.sbi-acc-check__item:last-child{ border-bottom:0; }
.sbi-acc-check__ico{
  flex:0 0 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px;
  height:20px;
  border-radius:50%;
  font-weight:900;
  line-height:1;
  font-size:12px;
}
.sbi-acc-check__ico--ok{
  color:#2ed573;
  background:rgba(46,213,115,.14);
  border:1px solid rgba(46,213,115,.5);
}
.sbi-acc-check__ico--ko{
  color:#ff4a4a;
  background:rgba(255,74,74,.14);
  border:1px solid rgba(255,74,74,.5);
}
.sbi-acc-check__label{ flex:1 1 auto; }
.sbi-acc-check__item--done .sbi-acc-check__label{ opacity:.7; }
.sbi-acc-check__action{
  flex:0 0 auto;
  font-size:.85em;
  font-weight:700;
  color:currentColor;
  text-decoration:underline;
  text-underline-offset:2px;
  white-space:nowrap;
}
.sbi-acc-check__action:focus-visible,
.sbi-acc-check__action:focus{ outline:2px solid currentColor; outline-offset:2px; }

/* --- État succès 100% --- */
.sbi-acc-success{
  display:flex;
  align-items:center;
  gap:.55rem;
  font-weight:800;
  color:#2ed573;
}
.sbi-acc-success .sbi-acc-check__ico{ color:#2ed573; }

/* --- Section panel --- */
.sbi-acc-panel{ display:block; }
.sbi-acc-panel__title{
  font-weight:800;
  margin:0 0 .5rem;
}

@media (prefers-reduced-motion: reduce){
  .sbi-acc-gauge__fill{ transition:none; }
}
/* ========================================================================= */
`;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (head) head.appendChild(style);
}

/* -----------------------------------------------------------------------
 * 5) Badge ✗ (chaîne HTML)
 * --------------------------------------------------------------------- */

/**
 * Rend le badge ✗ pour un user. Vide si le compte est complet.
 * @param {Object} user
 * @param {{ uid?:String, size?:String }} opts
 * @returns {String} HTML
 */
// Le badge de complétude ne concerne QUE les élèves (pas prof/admin/tuteur).
const STUDENT_ROLES = ['student', 'eleve', 'élève', 'etudiant', 'étudiant', 'apprenti'];
export function isStudentAccount(user = {}) {
  const role = String((user && (user.role || user.type)) || '').toLowerCase();
  return STUDENT_ROLES.includes(role);
}

export function renderCompletenessBadge(user = {}, { uid = '', size = 'sm' } = {}) {
  injectCompletenessBadgeStyles();

  // Réservé aux comptes élèves : un prof/admin/tuteur n'a pas de badge.
  if (!isStudentAccount(user)) return '';

  const res = readCompleteness(user);
  if (res.complete === true) return '';

  const pctLabel = (res.percent === null || res.percent === undefined) ? '?' : String(res.percent);
  const title = `Compte incomplet (${pctLabel}%) — voir la checklist`;
  const aria = 'Compte incomplet, ouvrir la checklist de complétude';

  // Pas d'uid → span non cliquable (sémantique portée par le glyphe + aria-label).
  if (!uid) {
    return `<span class="sbi-acc-badge" data-sbi-size="${escapeHtml(size)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(aria)}" role="img" data-sbi-acc-badge>✗</span>`;
  }

  const href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}&tab=account`;
  return `<a class="sbi-acc-badge" data-sbi-size="${escapeHtml(size)}" href="${escapeHtml(href)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(aria)}" data-sbi-acc-badge>✗</a>`;
}

/* -----------------------------------------------------------------------
 * 6) Panel « Complétude du compte » (chaîne HTML)
 * --------------------------------------------------------------------- */

/** Libellés FR clairs des critères connus. */
const ITEM_LABELS = {
  profile_basics: 'Informations de base du profil',
  account_finalized: 'Compte finalisé (mot de passe défini)',
  formation: 'Rattaché à une formation',
  promotion: 'Rattaché à une promotion',
  livret: "Livret d'apprentissage initialisé"
};

/**
 * Lien d'action « Compléter » par critère (uid courant requis pour certains).
 * @returns {String} href, ou '' si pas de lien direct pertinent.
 */
function actionHrefForKey(key, uid) {
  const u = encodeURIComponent(uid || '');
  switch (key) {
    case 'profile_basics':
      return uid ? `/admin/admin-profile.html?id=${u}` : '';
    case 'account_finalized':
      return ''; // action interne (renvoi de finalisation) — pas de lien
    case 'formation':
      return uid ? `/admin/admin-accounts.html?id=${u}` : '';
    case 'promotion':
      return '/admin/admin-promotions.html';
    case 'livret':
      return '/admin/apprenticeship-booklets.html';
    default:
      return '';
  }
}

const ICO_OK = '✓'; // ✓
const ICO_KO = '✗'; // ✗

/**
 * Rend la section « Complétude du compte » épurée (jauge + checklist).
 * @param {Object} result  forme de readCompleteness() OU { completeness } brut
 * @param {{ uid?:String }} opts
 * @returns {String} HTML
 */
export function renderCompletenessPanelHtml(result = {}, { uid = '' } = {}) {
  injectCompletenessBadgeStyles();

  // Accepte soit un résultat normalisé, soit un user { completeness }.
  let res = result;
  const looksNormalized = result && typeof result === 'object'
    && ('complete' in result || 'items' in result || 'percent' in result);
  if (!looksNormalized) {
    res = readCompleteness(result || {});
  } else {
    // Complète les champs manquants avec la normalisation par défaut.
    res = Object.assign(
      { percent: null, complete: false, missing: [], items: [], unknown: false },
      result
    );
  }

  if (res.unknown) {
    return `
<section class="sbi-acc-panel" aria-label="Complétude du compte">
  <h3 class="sbi-acc-panel__title">Complétude du compte</h3>
  <p style="opacity:.75;">Complétude non encore calculée pour ce compte.</p>
</section>`;
  }

  // --- État succès 100% ---
  if (res.complete === true) {
    return `
<section class="sbi-acc-panel" aria-label="Complétude du compte">
  <h3 class="sbi-acc-panel__title">Complétude du compte</h3>
  <p class="sbi-acc-success">
    <span class="sbi-acc-check__ico sbi-acc-check__ico--ok" aria-hidden="true">${ICO_OK}</span>
    <span>Compte complété à 100%</span>
  </p>
</section>`;
  }

  // --- Jauge ---
  const items = Array.isArray(res.items) ? res.items.filter((it) => it && it.applicable !== false) : [];
  const totalCount = items.length;
  const doneCount = items.filter((it) => it && it.done).length;

  let pct = res.percent;
  if ((pct === null || pct === undefined) && totalCount > 0) {
    pct = Math.round((doneCount / totalCount) * 100);
  }
  const pctText = (pct === null || pct === undefined) ? '?' : `${pct}`;
  const pctWidth = (pct === null || pct === undefined) ? 0 : Math.max(0, Math.min(100, pct));

  const ratioText = totalCount > 0 ? `${doneCount}/${totalCount} critères` : '';

  const gaugeHtml = `
  <div class="sbi-acc-gauge" role="img" aria-label="Complétude : ${escapeHtml(pctText)} pour cent${ratioText ? ', ' + escapeHtml(ratioText) : ''}">
    <div class="sbi-acc-gauge__bar">
      <div class="sbi-acc-gauge__fill" data-incomplete="1" style="width:${pctWidth}%;"></div>
    </div>
    <span class="sbi-acc-gauge__pct">${escapeHtml(pctText)}%</span>
    ${ratioText ? `<span class="sbi-acc-gauge__ratio">${escapeHtml(ratioText)}</span>` : ''}
  </div>`;

  // --- Checklist ---
  let listHtml = '';
  if (totalCount > 0) {
    listHtml = items.map((it) => {
      const key = (it && it.key) || '';
      const done = !!(it && it.done);
      const label = (it && it.label) || ITEM_LABELS[key] || key || 'Critère';
      const icoClass = done ? 'sbi-acc-check__ico--ok' : 'sbi-acc-check__ico--ko';
      const ico = done ? ICO_OK : ICO_KO;

      let actionHtml = '';
      if (!done) {
        const href = actionHrefForKey(key, uid);
        if (href) {
          actionHtml = `<a class="sbi-acc-check__action" href="${escapeHtml(href)}">Compléter</a>`;
        } else if (key === 'account_finalized') {
          actionHtml = `<span class="sbi-acc-check__action" style="text-decoration:none;opacity:.7;">Renvoyer finalisation</span>`;
        }
      }

      return `
    <li class="sbi-acc-check__item ${done ? 'sbi-acc-check__item--done' : ''}">
      <span class="sbi-acc-check__ico ${icoClass}" aria-hidden="true">${ico}</span>
      <span class="sbi-acc-check__label">${escapeHtml(label)}</span>
      <span class="sbi-acc-check__sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">${done ? 'fait' : 'à compléter'}</span>
      ${actionHtml}
    </li>`;
    }).join('');
  } else {
    listHtml = `<li class="sbi-acc-check__item"><span class="sbi-acc-check__label" style="opacity:.7;">Aucun critère applicable.</span></li>`;
  }

  return `
<section class="sbi-acc-panel" aria-label="Complétude du compte">
  <h3 class="sbi-acc-panel__title">Complétude du compte</h3>
  ${gaugeHtml}
  <ul class="sbi-acc-check">${listHtml}
  </ul>
</section>`;
}
