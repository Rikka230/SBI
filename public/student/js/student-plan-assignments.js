/**
 * SBI 8.0P.167.358 — Devoirs & évaluations dans la progression élève.
 *
 * Enrichissement NON destructif de /student/mes-cours.html (même approche que
 * student-course-plan-dates.js) : les items devoir/examen/évaluation du
 * coursePlan de la promotion apparaissent dans la liste des cours, à leur
 * position chronologique (semaine du cursus), avec le statut de dépôt de
 * l'élève (à rendre / en retard / déposé / corrigé). Clic → page Devoirs.
 *
 * Liaison : assignments.cursusItemId (8.0P.167.358) en priorité, repli sur le
 * titre normalisé. Un item du cursus sans devoir publié s'affiche « à venir ».
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, documentId
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  loadStudentCoursePlanContext,
  toDateMs,
  formatShortDateFr,
  formatDateFr,
  escapeHTML
} from '/js/promotion-course-plan.js?v=8.0P.167.125';

const CURSUS_ASSIGNMENT_TYPES = ['assignment', 'exam', 'evaluation'];
const TYPE_META = {
  assignment: { icon: '📝', label: 'Devoir' },
  exam: { icon: '🎯', label: 'Examen' },
  evaluation: { icon: '🎯', label: 'Évaluation' }
};

let mounted = false;
let unsubscribeAuth = null;
let currentUid = '';
let planItems = [];           // items devoir/éval du coursePlan (toutes promotions actives)
let assignmentsById = new Map();
let submissionByAssignment = new Map();
let loaded = false;

function normalizeTitleKey(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function chunk(items, size = 10) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function injectStyle() {
  if (document.getElementById('sbi-plan-asg-css')) return;
  const style = document.createElement('style');
  style.id = 'sbi-plan-asg-css';
  style.textContent = `
    .sbi-plan-asg-item {
      display: flex; align-items: center; gap: .75rem;
      border: 1px dashed rgba(42, 87, 255, .45);
      border-radius: 12px; padding: .7rem .9rem; margin: .45rem 0;
      background: rgba(42, 87, 255, .05); cursor: pointer;
    }
    .sbi-plan-asg-item:hover { background: rgba(42, 87, 255, .1); }
    .sbi-plan-asg-icon { font-size: 1.25rem; flex: 0 0 auto; }
    .sbi-plan-asg-body { min-width: 0; flex: 1; }
    .sbi-plan-asg-title { font-weight: 800; color: var(--text-main, #111827); }
    .sbi-plan-asg-meta { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .3rem; font-size: .72rem; }
    .sbi-plan-asg-pill {
      display: inline-flex; align-items: center; border-radius: 999px;
      padding: .16rem .5rem; font-weight: 800; line-height: 1.3;
      border: 1px solid rgba(42, 87, 255, .22); background: rgba(42, 87, 255, .08);
      color: var(--accent-blue, #2A57FF);
    }
    .sbi-plan-asg-pill.is-danger { border-color: rgba(220, 38, 38, .35); background: rgba(220, 38, 38, .1); color: #dc2626; }
    .sbi-plan-asg-pill.is-success { border-color: rgba(22, 163, 74, .35); background: rgba(22, 163, 74, .1); color: #16a34a; }
    .sbi-plan-asg-pill.is-pending { border-color: rgba(217, 119, 6, .35); background: rgba(217, 119, 6, .1); color: #d97706; }
    .sbi-plan-asg-pill.is-muted { border-color: rgba(107, 114, 128, .3); background: rgba(107, 114, 128, .08); color: #6b7280; }
  `;
  document.head.appendChild(style);
}

function collectPlanAssignmentItems(promotions = []) {
  const items = new Map();
  promotions.forEach((promotion) => {
    const plan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
    plan.forEach((item) => {
      const type = String(item?.type || '').toLowerCase();
      if (!CURSUS_ASSIGNMENT_TYPES.includes(type)) return;
      const itemId = String(item.itemId || item.id || '').trim();
      const title = String(item.title || item.courseTitle || '').trim();
      if (!itemId && !title) return;
      const key = itemId || normalizeTitleKey(title);
      if (items.has(key)) return;
      items.set(key, {
        itemId,
        title: title || (TYPE_META[type]?.label || 'Devoir'),
        titleKey: normalizeTitleKey(title),
        type,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : 9999,
        startAt: item.recommendedStartAt || '',
        endAt: item.recommendedEndAt || '',
        dueAt: item.dueAt || item.deadlineAt || item.recommendedEndAt || '',
        startMs: toDateMs(item.recommendedStartAt),
        promotionId: promotion.id,
        formationId: String(promotion.formationId || item.sourceFormationId || '')
      });
    });
  });
  return Array.from(items.values()).sort((a, b) => a.order - b.order);
}

async function loadPublishedAssignments(promotionIds = [], formationIds = []) {
  const found = new Map();
  const addSnap = (snap) => snap?.forEach((d) => found.set(d.id, { id: d.id, ...(d.data() || {}) }));
  for (const part of chunk(promotionIds)) {
    if (!part.length) continue;
    try {
      addSnap(await getDocs(query(collection(db, 'assignments'), where('status', '==', 'published'), where('promotionId', 'in', part))));
    } catch (error) {
      console.warn('[SBI PlanAsg] requête devoirs (promo) ignorée :', error?.message || error);
    }
  }
  for (const part of chunk(formationIds)) {
    if (!part.length) continue;
    try {
      addSnap(await getDocs(query(collection(db, 'assignments'), where('status', '==', 'published'), where('promotionId', '==', ''), where('formationId', 'in', part))));
    } catch (error) {
      console.warn('[SBI PlanAsg] requête devoirs (formation) ignorée :', error?.message || error);
    }
  }
  return found;
}

function findAssignmentForItem(item) {
  for (const a of assignmentsById.values()) {
    if (item.itemId && a.cursusItemId === item.itemId) return a;
  }
  for (const a of assignmentsById.values()) {
    if (item.titleKey && normalizeTitleKey(a.cursusItemTitle || a.title) === item.titleKey) return a;
  }
  return null;
}

function getItemState(item) {
  const assignment = findAssignmentForItem(item);
  if (!assignment) return { assignment: null, pill: { label: 'À venir', tone: 'muted' } };
  const sub = submissionByAssignment.get(assignment.id) || null;
  if (sub) {
    if (sub.status === 'corrected') {
      const note = sub.correction && Number.isFinite(Number(sub.correction.note))
        ? ` · ${sub.correction.note}/${Number(sub.correction.gradeMax) > 0 ? sub.correction.gradeMax : 20}`
        : '';
      return { assignment, pill: { label: `Corrigé${note}`, tone: 'success' } };
    }
    return { assignment, pill: { label: 'Déposé · en attente de correction', tone: 'pending' } };
  }
  const due = assignment.dueAt || item.dueAt || '';
  const dueMs = due ? Date.parse(`${due}T23:59:59`) : 0;
  if (dueMs && dueMs < Date.now()) {
    const daysLate = Math.max(1, Math.round((Date.now() - dueMs) / 86400000));
    return { assignment, pill: { label: `En retard de ${daysLate} j`, tone: 'danger' } };
  }
  return { assignment, pill: { label: 'À rendre', tone: 'info' } };
}

function buildCardHtml(item) {
  const meta = TYPE_META[item.type] || TYPE_META.assignment;
  const { assignment, pill } = getItemState(item);
  const period = item.startAt && item.endAt
    ? `Semaine du ${formatShortDateFr(item.startAt, '?')} au ${formatShortDateFr(item.endAt, '?')}`
    : '';
  const due = assignment?.dueAt || item.dueAt || '';
  const toneClass = { danger: 'is-danger', success: 'is-success', pending: 'is-pending', muted: 'is-muted', info: '' }[pill.tone] || '';
  return `
    <div class="sbi-plan-asg-item" data-sbi-plan-asg="${escapeHTML(item.itemId || item.titleKey)}" data-sbi-course-plan-start="${item.startMs || ''}" role="button" tabindex="0" title="Ouvrir mes devoirs">
      <span class="sbi-plan-asg-icon">${meta.icon}</span>
      <div class="sbi-plan-asg-body">
        <div class="sbi-plan-asg-title">${escapeHTML(meta.label)} — ${escapeHTML(assignment?.title || item.title)}</div>
        <div class="sbi-plan-asg-meta">
          <span class="sbi-plan-asg-pill ${toneClass}">${escapeHTML(pill.label)}</span>
          ${period ? `<span class="sbi-plan-asg-pill">${escapeHTML(period)}</span>` : ''}
          ${due ? `<span class="sbi-plan-asg-pill">Échéance ${escapeHTML(formatDateFr(due, '?'))}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function getOpenedFormationId() {
  return document.getElementById('current-formation-title')?.dataset?.formationId || '';
}

function injectCards() {
  if (!loaded) return;
  const container = document.getElementById('courses-list');
  if (!container) return;

  container.querySelectorAll('[data-sbi-plan-asg]').forEach((node) => node.remove());

  const openedFormationId = getOpenedFormationId();
  const visibleItems = planItems.filter((item) => !openedFormationId || !item.formationId || item.formationId === openedFormationId);
  if (!visibleItems.length) return;

  const courseItems = Array.from(container.querySelectorAll('.course-item'));
  if (!courseItems.length) return;

  visibleItems.forEach((item) => {
    const card = document.createElement('div');
    card.innerHTML = buildCardHtml(item).trim();
    const node = card.firstElementChild;
    if (!node) return;

    // Position chronologique : avant le premier cours qui démarre APRÈS cet
    // item (dates posées par student-course-plan-dates) ; sinon en fin de liste.
    let anchor = null;
    if (item.startMs) {
      anchor = courseItems.find((courseNode) => {
        const start = Number(courseNode.dataset.sbiCoursePlanStart || 0);
        return start && start > item.startMs;
      }) || null;
    }
    if (anchor) container.insertBefore(node, anchor);
    else container.appendChild(node);

    const open = () => { window.location.href = '/student/assignments.html'; };
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
}

async function loadAll(user) {
  currentUid = user.uid;
  const context = await loadStudentCoursePlanContext({ db, uid: user.uid });
  planItems = collectPlanAssignmentItems(context.promotions || []);
  if (!planItems.length) { loaded = true; return; }

  const promotionIds = Array.from(new Set((context.promotions || []).map((p) => p.id).filter(Boolean)));
  const formationIds = Array.from(new Set((context.promotions || []).map((p) => String(p.formationId || '')).filter(Boolean)));
  assignmentsById = await loadPublishedAssignments(promotionIds, formationIds);

  submissionByAssignment = new Map();
  await Promise.all(Array.from(assignmentsById.keys()).map(async (assignmentId) => {
    try {
      const snap = await getDoc(doc(db, 'assignmentSubmissions', `${assignmentId}_${currentUid}`));
      if (snap.exists()) submissionByAssignment.set(assignmentId, { id: snap.id, ...(snap.data() || {}) });
    } catch (_) { /* dépôt illisible : statut « à rendre » par défaut */ }
  }));

  loaded = true;
  injectCards();
}

function patchOpenFormation() {
  if (typeof window.openFormation !== 'function') return false;
  if (window.openFormation.__sbiPlanAsgPatched === true) return true;
  const original = window.openFormation;
  const patched = function patchedOpenFormationForAssignments(...args) {
    const result = original.apply(this, args);
    window.setTimeout(injectCards, 120);
    window.setTimeout(injectCards, 420);
    return result;
  };
  patched.__sbiPlanAsgPatched = true;
  window.openFormation = patched;
  return true;
}

function schedulePatch() {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (patchOpenFormation()) return;
    if (attempts < 40) window.setTimeout(tick, 120);
  };
  tick();
}

export function mountStudentPlanAssignments() {
  if (mounted) { injectCards(); return () => {}; }
  mounted = true;
  injectStyle();
  schedulePatch();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      await loadAll(user);
    } catch (error) {
      console.warn('[SBI PlanAsg] devoirs du parcours indisponibles :', error);
    }
  });

  // Le module des dates trie les cours après coup → réinjecter APRÈS lui.
  window.addEventListener('sbi:student-course-plan-dates-mounted', () => window.setTimeout(injectCards, 150));
  window.addEventListener('sbi:app-shell-rendered', () => window.setTimeout(injectCards, 200));
  window.addEventListener('pageshow', () => window.setTimeout(injectCards, 200));

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

if (document.getElementById('courses-list') || document.getElementById('formations-list')) {
  mountStudentPlanAssignments();
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('courses-list') || document.getElementById('formations-list')) mountStudentPlanAssignments();
  }, { once: true });
}
