import { auth, db, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const getLiveSchedulerData = httpsCallable(functionsInstance, 'getLiveSchedulerData');

const state = {
  role: 'teacher',
  uid: '',
  promotions: [],
  sessions: [],
  templatesById: new Map(),
  selectedPromotionId: '',
  selectedLiveId: ''
};

let mounted = false;
let unsubscribeAuth = null;

function $(id) { return document.getElementById(id); }

function clean(value = '', max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(value = '') {
  if (!value) return 'Non renseignée';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatRange(start = '', end = '') {
  if (!start && !end) return 'Période non renseignée';
  if (start && end) return `${formatDateTime(start)} → ${formatDateTime(end)}`;
  return start ? `À partir du ${formatDateTime(start)}` : `Jusqu’au ${formatDateTime(end)}`;
}

function setStatus(message = '', tone = 'muted') {
  const node = $('sbi-live-v2-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function getPromotionName(promotion = {}) {
  return clean(promotion.name || promotion.promotionName || promotion.title || promotion.titre || promotion.id || 'Promotion SBI');
}

function getCursusName(promotion = {}) {
  const template = getPromotionTemplate(promotion);
  return clean(template?.title || promotion.curriculumTitle || promotion.formationName || promotion.formationTitle || 'Cursus SBI');
}

function getPromotionTemplateId(promotion = {}) {
  return clean(promotion.curriculumTemplateId || promotion.templateId || promotion.cursusTemplateId || promotion.curriculumId || '', 180);
}

function getPromotionTemplate(promotion = {}) {
  const id = getPromotionTemplateId(promotion);
  return id ? state.templatesById.get(id) || null : null;
}

function getItemType(item = {}) {
  return clean(item.type || item.kind || item.sourceType || '', 80).toLowerCase();
}

function isLiveType(item = {}) {
  const type = getItemType(item);
  return type === 'live_session' || type === 'workshop';
}

function isTestLive(item = {}) {
  const values = [item.id, item.itemId, item.sourceItemId, item.liveId, item.type]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return item.isTestLive === true || item.testLive === true || values.includes('sbi-live-test') || values.includes('live_test');
}

function getItemIds(item = {}) {
  return [item.id, item.itemId, item.sourceItemId, item.liveId, item.templateItemId, item.liveTracking?.itemId]
    .map((value) => clean(value, 180))
    .filter(Boolean);
}

function getLiveTitle(item = {}, fallback = {}) {
  return clean(
    item.title
    || item.courseTitle
    || item.liveTracking?.title
    || fallback.title
    || fallback.courseTitle
    || fallback.liveTracking?.title
    || 'Live sans titre'
  );
}

function getWindow(item = {}, fallback = {}) {
  const tracking = item.liveTracking || {};
  const fallbackTracking = fallback.liveTracking || {};
  const start = clean(
    item.teacherSchedulingWindowStartAt
    || item.schedulingWindow?.teacherCanSelectFrom
    || item.schedulingWindow?.recommendedStartAt
    || item.recommendedStartAt
    || item.plannedStartAt
    || tracking.schedulingWindow?.teacherCanSelectFrom
    || tracking.schedulingWindow?.recommendedStartAt
    || fallback.teacherSchedulingWindowStartAt
    || fallback.schedulingWindow?.teacherCanSelectFrom
    || fallback.schedulingWindow?.recommendedStartAt
    || fallbackTracking.schedulingWindow?.teacherCanSelectFrom
    || fallbackTracking.schedulingWindow?.recommendedStartAt
    || '',
    80
  );
  const end = clean(
    item.teacherSchedulingWindowEndAt
    || item.schedulingWindow?.teacherCanSelectUntil
    || item.schedulingWindow?.recommendedEndAt
    || item.recommendedEndAt
    || item.plannedEndAt
    || item.deadlineAt
    || tracking.schedulingWindow?.teacherCanSelectUntil
    || tracking.schedulingWindow?.recommendedEndAt
    || fallback.teacherSchedulingWindowEndAt
    || fallback.schedulingWindow?.teacherCanSelectUntil
    || fallback.schedulingWindow?.recommendedEndAt
    || fallbackTracking.schedulingWindow?.teacherCanSelectUntil
    || fallbackTracking.schedulingWindow?.recommendedEndAt
    || '',
    80
  );
  return { start, end };
}

function getSourceLiveItems(promotion = {}) {
  const template = getPromotionTemplate(promotion);
  const templateItems = Array.isArray(template?.items) ? template.items.filter(isLiveType) : [];
  const coursePlanItems = Array.isArray(promotion.coursePlan) ? promotion.coursePlan.filter(isLiveType) : [];
  const livePlanningItems = Array.isArray(promotion.livePlanning) ? promotion.livePlanning.filter((item) => item && typeof item === 'object' && !isTestLive(item)) : [];

  if (templateItems.length) return { source: 'cursus', items: templateItems };
  if (coursePlanItems.length) return { source: 'promotion-coursePlan', items: coursePlanItems };
  return { source: 'promotion-livePlanning', items: livePlanningItems };
}

function findMatchingPlanningItem(promotion = {}, sourceItem = {}) {
  const planning = Array.isArray(promotion.livePlanning) ? promotion.livePlanning.filter((item) => item && typeof item === 'object' && !isTestLive(item)) : [];
  const ids = new Set(getItemIds(sourceItem));
  const title = getLiveTitle(sourceItem).toLowerCase();
  return planning.find((item) => getItemIds(item).some((id) => ids.has(id)))
    || planning.find((item) => title && getLiveTitle(item).toLowerCase() === title)
    || null;
}

function findMatchingSession(promotion = {}, sourceItem = {}, planningItem = null) {
  const ids = new Set([...getItemIds(sourceItem), ...getItemIds(planningItem || {})]);
  const liveSessionId = clean(planningItem?.liveSessionId || sourceItem.liveSessionId || '', 180);
  return state.sessions.find((session) => {
    if (session.promotionId !== promotion.id) return false;
    if (liveSessionId && session.id === liveSessionId) return true;
    const sessionIds = [session.id, session.liveId, session.sourceItemId].map((value) => clean(value, 180)).filter(Boolean);
    return sessionIds.some((id) => ids.has(id));
  }) || null;
}

function getLiveRows(promotion = {}) {
  const { source, items } = getSourceLiveItems(promotion);
  return items.map((item, index) => {
    const planning = findMatchingPlanningItem(promotion, item);
    const session = findMatchingSession(promotion, item, planning);
    const startAt = clean(session?.selectedStartAt || planning?.selectedLiveAt || item.selectedLiveAt || '', 80);
    const endAt = clean(session?.selectedEndAt || planning?.selectedLiveEndAt || item.selectedLiveEndAt || '', 80);
    const window = getWindow(item, planning || {});
    const status = session?.report || planning?.reportOutsideWindow || planning?.liveSchedulingStatus === 'report'
      ? 'report'
      : startAt
        ? 'scheduled'
        : 'to_plan';
    const id = clean(getItemIds(item)[0] || getItemIds(planning || {})[0] || `${promotion.id}-live-${index}`, 180);
    return {
      id,
      source,
      index,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      title: getLiveTitle(item, planning || {}),
      item,
      planning,
      session,
      startAt,
      endAt,
      windowStart: window.start,
      windowEnd: window.end,
      status
    };
  }).sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
}

function getSelectedPromotion() {
  return state.promotions.find((promotion) => promotion.id === state.selectedPromotionId) || state.promotions[0] || null;
}

function getSelectedLiveRow(promotion = getSelectedPromotion()) {
  const rows = promotion ? getLiveRows(promotion) : [];
  return rows.find((row) => row.id === state.selectedLiveId) || rows[0] || null;
}

function getStats(promotion = {}) {
  const rows = getLiveRows(promotion);
  return {
    total: rows.length,
    toPlan: rows.filter((row) => row.status === 'to_plan').length,
    scheduled: rows.filter((row) => row.status === 'scheduled').length,
    reports: rows.filter((row) => row.status === 'report').length,
    source: rows[0]?.source || 'aucune'
  };
}

function chip(status = 'to_plan') {
  const labels = { to_plan: 'À planifier', scheduled: 'Programmé', report: 'Report' };
  return `<span class="sbi-live-v2-chip is-${escapeHtml(status)}">${escapeHtml(labels[status] || labels.to_plan)}</span>`;
}

function renderSummary() {
  const root = $('sbi-live-v2-summary');
  const promotion = getSelectedPromotion();
  if (!root || !promotion) return;
  const stats = getStats(promotion);
  root.innerHTML = `
    <article class="sbi-live-v2-stat"><span>Promotion sélectionnée</span><strong>${escapeHtml(getPromotionName(promotion))}</strong><em>${escapeHtml(getCursusName(promotion))}</em></article>
    <article class="sbi-live-v2-stat"><span>Source cursus</span><strong>${escapeHtml(stats.source === 'cursus' ? 'Cursus' : stats.source === 'promotion-coursePlan' ? 'CoursePlan' : 'LivePlanning')}</strong><em>${stats.total} live(s)</em></article>
    <article class="sbi-live-v2-stat"><span>Lives à planifier</span><strong>${stats.toPlan}</strong><em>Sur ${stats.total} lives</em></article>
    <article class="sbi-live-v2-stat"><span>Lives programmés</span><strong>${stats.scheduled}</strong><em>Sur ${stats.total} lives</em></article>
    <article class="sbi-live-v2-stat"><span>Reports</span><strong>${stats.reports}</strong><em>Hors période prévue</em></article>
  `;
}

function renderPromotions() {
  const root = $('sbi-live-v2-promotions');
  if (!root) return;
  if (!state.promotions.length) {
    root.innerHTML = '<div class="sbi-live-v2-empty">Aucune promotion disponible.</div>';
    return;
  }
  root.innerHTML = state.promotions.map((promotion) => {
    const active = promotion.id === state.selectedPromotionId ? ' is-active' : '';
    const stats = getStats(promotion);
    return `
      <button class="sbi-live-v2-promotion${active}" type="button" data-promotion-id="${escapeHtml(promotion.id)}">
        <strong>${escapeHtml(getPromotionName(promotion))}</strong>
        <span>${escapeHtml(getCursusName(promotion))}</span>
        <div class="sbi-live-v2-promotion-grid">
          <span>${stats.total} lives cursus</span>
          <span>${stats.toPlan} à planifier</span>
          <span>${stats.scheduled} programmés</span>
        </div>
      </button>
    `;
  }).join('');

  root.querySelectorAll('[data-promotion-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedPromotionId = button.dataset.promotionId || '';
      state.selectedLiveId = '';
      renderAll();
    });
  });
}

function renderLives() {
  const root = $('sbi-live-v2-lives');
  const promotion = getSelectedPromotion();
  if (!root || !promotion) return;
  const rows = getLiveRows(promotion);
  if (!rows.length) {
    root.innerHTML = '<div class="sbi-live-v2-empty">Aucun live trouvé dans le cursus ou la promotion.</div>';
    return;
  }
  root.innerHTML = rows.map((row) => {
    const active = row.id === state.selectedLiveId || (!state.selectedLiveId && row === rows[0]) ? ' is-active' : '';
    return `
      <button class="sbi-live-v2-live${active}" type="button" data-live-id="${escapeHtml(row.id)}">
        <div class="sbi-live-v2-live-top">
          <strong>${escapeHtml(`${row.order + 1}. ${row.title}`)}</strong>
          ${chip(row.status)}
        </div>
        <span>Période prévue : ${escapeHtml(formatRange(row.windowStart, row.windowEnd))}</span>
        <span>Date prévue : ${escapeHtml(row.startAt ? formatRange(row.startAt, row.endAt) : 'non planifiée')}</span>
      </button>
    `;
  }).join('');

  root.querySelectorAll('[data-live-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLiveId = button.dataset.liveId || '';
      renderAll();
    });
  });
}

function renderDetail() {
  const root = $('sbi-live-v2-detail');
  const promotion = getSelectedPromotion();
  const row = getSelectedLiveRow(promotion);
  if (!root || !promotion || !row) {
    if (root) root.innerHTML = '<div class="sbi-live-v2-empty">Sélectionnez une promotion et un live.</div>';
    return;
  }
  root.innerHTML = `
    <div class="sbi-live-v2-detail">
      <div class="sbi-live-v2-live-top">
        <div>
          <h2>${escapeHtml(row.title)}</h2>
          <div class="sbi-live-v2-detail-sub">${escapeHtml(getPromotionName(promotion))}</div>
        </div>
        ${chip(row.status)}
      </div>

      <section class="sbi-live-v2-info">
        <h3>Informations cursus (non modifiables)</h3>
        <div class="sbi-live-v2-info-grid">
          <span>Promotion</span><strong>${escapeHtml(getPromotionName(promotion))}</strong>
          <span>Formation / Cursus</span><strong>${escapeHtml(getCursusName(promotion))}</strong>
          <span>Période prévue</span><strong>${escapeHtml(formatRange(row.windowStart, row.windowEnd))}</strong>
          <span>Source du titre</span><strong>${escapeHtml(row.source)}</strong>
        </div>
      </section>

      <section class="sbi-live-v2-info">
        <h3>Planification V2</h3>
        <div class="sbi-live-v2-info-grid">
          <span>Date prévue</span><strong>${escapeHtml(row.startAt ? formatRange(row.startAt, row.endAt) : 'Non planifiée')}</strong>
          <span>Session liée</span><strong>${escapeHtml(row.session?.id || row.planning?.liveSessionId || 'Aucune session liée')}</strong>
          <span>État</span><strong>${escapeHtml(row.status === 'report' ? 'Report hors période' : row.status === 'scheduled' ? 'Programmé' : 'À planifier')}</strong>
        </div>
      </section>

      <div class="sbi-live-v2-form-note">
        V2 est volontairement isolée : lecture propre du cursus d’abord, puis on branchera l’édition après validation de l’ergonomie.
      </div>
    </div>
  `;
}

function renderAll() {
  const promotion = getSelectedPromotion();
  if (promotion && !state.selectedPromotionId) state.selectedPromotionId = promotion.id;
  const row = getSelectedLiveRow(promotion);
  if (row && !state.selectedLiveId) state.selectedLiveId = row.id;
  renderSummary();
  renderPromotions();
  renderLives();
  renderDetail();
}

async function loadTemplatesForPromotions() {
  const ids = Array.from(new Set(state.promotions.map(getPromotionTemplateId).filter(Boolean)));
  await Promise.all(ids.map(async (id) => {
    if (state.templatesById.has(id)) return;
    try {
      const snap = await getDoc(doc(db, 'curriculumTemplates', id));
      if (snap.exists()) state.templatesById.set(id, { id: snap.id, ...snap.data() });
    } catch (error) {
      console.warn('[SBI Lives V2] Cursus inaccessible, fallback promotion :', id, error);
    }
  }));
}

async function refreshData() {
  setStatus('Chargement des lives V2…');
  try {
    const result = await getLiveSchedulerData({ role: state.role, version: 'v2' });
    const data = result?.data || {};
    state.promotions = Array.isArray(data.promotions) ? data.promotions : [];
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.promotions.sort((a, b) => getPromotionName(a).localeCompare(getPromotionName(b), 'fr', { sensitivity: 'base' }));
    await loadTemplatesForPromotions();
    renderAll();
    setStatus('Lives V2 chargé.', 'success');
  } catch (error) {
    console.error('[SBI Lives V2] Chargement impossible :', error);
    setStatus(error?.message || 'Chargement impossible.', 'error');
    renderAll();
  }
}

export function mountLiveSchedulerV2Page(role = 'teacher') {
  if (mounted) return null;
  mounted = true;
  state.role = role === 'admin' ? 'admin' : 'teacher';

  $('sbi-live-v2-refresh')?.addEventListener('click', refreshData);

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    state.uid = user.uid;
    await refreshData();
  });

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

if (document.querySelector('[data-sbi-live-v2]') && !window.SBI_APP_SHELL_CURRENT_URL) {
  mountLiveSchedulerV2Page(document.body.dataset.liveV2Role || 'teacher');
}
