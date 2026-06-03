/**
 * =======================================================================
 * SBI 8.0P.167.287 — Espace TUTEUR (maître d'apprentissage) : tableau de bord
 * -----------------------------------------------------------------------
 * Gating (onAuthStateChanged) puis liste UNIQUEMENT les apprentis du tuteur
 * via loadBookletsForTutor({ db, tutorId: user.uid }).
 * Par apprenti : nom élève, formation/promo, statut, complétion et un
 * indicateur des périodes restant à compléter par le tuteur (périodes sans
 * bilan tuteur). Lien « Ouvrir le livret » → /tutor/livret.html?id={id} (PJAX).
 * =======================================================================
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  loadBookletsForTutor,
  computeCompletion,
  statusMeta,
  escapeHtml
} from '/js/booklet/booklet-data.js?v=8.0P.167.301';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

function root() { return document.getElementById('tutor-dashboard-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-booklet-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

/**
 * Compte les périodes restant à compléter par le tuteur : périodes sans
 * bilan tuteur (ni tutorReport, ni signature tuteur).
 */
function pendingTutorPeriods(booklet = {}) {
  const periods = Array.isArray(booklet.periods) ? booklet.periods : [];
  let pending = 0;
  periods.forEach((p) => {
    if (!p) return;
    const done = hasValue(p.tutorReport) || hasValue(p.tutorSignedAt);
    if (!done) pending += 1;
  });
  return { pending, total: periods.length };
}

function bookletCard(booklet) {
  const studentName = booklet.studentName
    || (booklet.identity && (booklet.identity.fullName || booklet.identity.name))
    || 'Apprenti';
  const meta = [booklet.formationTitle, booklet.promotionLabel].filter(Boolean).map(escapeHtml).join(' — ');
  const sm = statusMeta(booklet.status);
  const completion = computeCompletion(booklet);
  const { pending, total } = pendingTutorPeriods(booklet);

  const pendingBadge = pending > 0
    ? `<span class="sbi-booklet-badge is-soft" title="Périodes sans bilan tuteur">${pending} période${pending > 1 ? 's' : ''} à compléter</span>`
    : `<span class="sbi-booklet-badge is-soft" title="Tous les bilans tuteur sont renseignés">Bilans à jour</span>`;

  return `<article class="sbi-booklet-section" data-booklet-card="${escapeHtml(booklet.id)}">
    <h2 style="display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;">
      ${escapeHtml(studentName)}
      <span class="sbi-booklet-badge" style="background:${sm.color};">${escapeHtml(sm.label)}</span>
    </h2>
    ${meta ? `<p class="sbi-booklet-section__hint">${meta}</p>` : ''}

    <div class="sbi-booklet-completion">
      <div class="sbi-booklet-completion__label">
        <span>Complétion du livret</span>
        <strong>${completion.rate}%</strong>
      </div>
      <div class="sbi-booklet-progress">
        <div class="sbi-booklet-progress__bar" style="width:${completion.rate}%;"></div>
      </div>
    </div>

    <div class="sbi-booklet-meta">
      ${pendingBadge}
      <span>${total} période${total > 1 ? 's' : ''} de suivi</span>
    </div>

    <div class="sbi-booklet-actions">
      <a class="sbi-booklet-btn primary" href="/tutor/livret.html?id=${encodeURIComponent(booklet.id)}"
         data-sbi-href="/tutor/livret.html?id=${encodeURIComponent(booklet.id)}" role="link">Ouvrir le livret</a>
    </div>
  </article>`;
}

function render(booklets) {
  const r = root();
  if (!r) return;

  if (!booklets.length) {
    r.innerHTML = `<div class="sbi-booklet-head">
        <h1>Mes apprentis</h1>
        <p>Suivi des livrets d'apprentissage de vos apprentis.</p>
      </div>
      <div class="sbi-booklet-empty">Aucun apprenti ne vous est rattaché pour le moment.</div>`;
    return;
  }

  const cards = booklets
    .slice()
    .sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || ''), 'fr'))
    .map(bookletCard)
    .join('');

  r.innerHTML = `<div class="sbi-booklet-head">
      <h1>Mes apprentis</h1>
      <p>${booklets.length} livret${booklets.length > 1 ? 's' : ''} d'apprentissage à suivre.</p>
    </div>
    ${cards}`;
}

export function mountTutorDashboard() {
  const view = document.getElementById('view-tutor-dashboard');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TUTOR_DASHBOARD_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) { setStatus('Connexion requise.', 'error'); return; }
    try {
      const booklets = await loadBookletsForTutor({ db, tutorId: user.uid });
      render(booklets);
    } catch (error) {
      console.warn('[SBI Tuteur] chargement des apprentis échoué :', error);
      setStatus(error?.message || 'Impossible de charger vos apprentis.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TUTOR_DASHBOARD_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTutorDashboard(), { once: true });
} else {
  mountTutorDashboard();
}
