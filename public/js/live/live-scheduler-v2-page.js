import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const getLiveSchedulerData = httpsCallable(functionsInstance, 'getLiveSchedulerData');
const scheduleLiveSession = httpsCallable(functionsInstance, 'scheduleLiveSession');
const notifyLiveStarted = httpsCallable(functionsInstance, 'notifyLiveStarted');

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
let mountedRoot = null;
let unsubscribeAuth = null;
let bootTimer = null;

function $(id) { return document.getElementById(id); }

function forceRevealLiveSchedulerV2Page() {
  try { document.documentElement?.classList?.remove('preload'); } catch (_) {}
  try { document.body?.classList?.remove('preload'); } catch (_) {}
  const main = document.getElementById('main-content');
  if (main) {
    main.hidden = false;
    main.style.display = 'block';
    main.style.visibility = 'visible';
    main.style.opacity = '1';
    main.style.transform = 'none';
  }
  const root = document.querySelector('[data-sbi-live-v2]');
  if (root) {
    root.hidden = false;
    root.style.display = 'block';
    root.style.visibility = 'visible';
    root.style.opacity = '1';
    root.style.transform = 'none';
  }
}

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

function normalizeText(value = '') {
  return clean(value, 240).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isGenericLiveTitle(value = '') {
  const title = normalizeText(value);
  return !title || title === 'nouveau live' || title === 'nouvel atelier' || title === 'live sans titre' || title === 'live sbi';
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

function addDaysIso(value = '', days = 0) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
}

function formatDateOnly(value = '') {
  if (!value) return 'Non renseignée';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function formatPlannedWeek(row = {}) {
  const start = row.windowStart || row.item?.teacherSchedulingWindowStartAt || row.item?.schedulingWindow?.teacherCanSelectFrom || row.item?.schedulingWindow?.recommendedStartAt || '';
  if (!start) return formatRange(row.windowStart, row.windowEnd);
  const end = row.windowEnd && Date.parse(row.windowEnd) > Date.parse(start)
    ? row.windowEnd
    : addDaysIso(start, 6);
  return `Semaine du ${formatDateOnly(start)} au ${formatDateOnly(end)}`;
}

function getScheduleLineForRow(row = {}) {
  if (row.startAt) {
    const label = row.status === 'report' ? 'Date de report' : 'Date définie';
    return `${label} : ${formatRange(row.startAt, row.endAt)}`;
  }
  return `Période prévue : ${formatPlannedWeek(row)}`;
}

function toDateTimeLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function addMinutesIso(baseIso = '', minutes = 60) {
  const baseMs = Date.parse(baseIso || '');
  if (!Number.isFinite(baseMs)) return '';
  return new Date(baseMs + minutes * 60000).toISOString();
}

function durationMinutes(startAt = '', endAt = '') {
  const startMs = Date.parse(startAt || '');
  const endMs = Date.parse(endAt || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 60;
  return Math.max(15, Math.round((endMs - startMs) / 60000));
}

function setStatus(message = '', tone = 'muted') {
  forceRevealLiveSchedulerV2Page();
  const node = $('sbi-live-v2-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function getPromotionName(promotion = {}) {
  return clean(promotion.name || promotion.promotionName || promotion.title || promotion.titre || promotion.id || 'Promotion SBI');
}

function getPromotionTemplateId(promotion = {}) {
  return clean(
    promotion.curriculumTemplateId
    || promotion.templateId
    || promotion.cursusTemplateId
    || promotion.curriculumId
    || promotion.curriculumTemplate?.id
    || promotion.cursus?.id
    || '',
    180
  );
}

function getPromotionTemplate(promotion = {}) {
  const id = getPromotionTemplateId(promotion);
  return id ? state.templatesById.get(id) || null : null;
}

function getCursusName(promotion = {}) {
  const template = getPromotionTemplate(promotion);
  return clean(template?.title || promotion.curriculumTitle || promotion.formationName || promotion.formationTitle || 'Cursus SBI');
}

function getItemType(item = {}) {
  return clean(item.type || item.kind || item.sourceType || '', 80).toLowerCase();
}

function isLiveType(item = {}) {
  const type = getItemType(item);
  return type === 'live_session' || type === 'workshop' || Boolean(item.liveTracking && typeof item.liveTracking === 'object');
}

function isTestLive(item = {}) {
  const values = [item.id, item.itemId, item.sourceItemId, item.liveId, item.type, item.sourceType]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return item.isTestLive === true || item.testLive === true || values.includes('sbi-live-test') || values.includes('live_test');
}

function getItemIds(item = {}) {
  return [
    item.id,
    item.itemId,
    item.sourceItemId,
    item.liveId,
    item.templateItemId,
    item.liveTracking?.itemId,
    item.liveTracking?.sourceItemId,
    item.liveTracking?.templateItemId
  ].map((value) => clean(value, 180)).filter(Boolean);
}

function pickTitleWithSource(primary = {}, fallback = {}, tertiary = {}) {
  const candidates = [
    ['cursus', primary.title],
    ['cursus', primary.courseTitle],
    ['cursus', primary.liveTracking?.title],
    ['promotion-coursePlan', fallback.title],
    ['promotion-coursePlan', fallback.courseTitle],
    ['promotion-coursePlan', fallback.liveTracking?.title],
    ['promotion-livePlanning', tertiary.title],
    ['promotion-livePlanning', tertiary.courseTitle],
    ['promotion-livePlanning', tertiary.liveTracking?.title]
  ];
  const best = candidates.find(([, value]) => !isGenericLiveTitle(value));
  if (best) return { title: clean(best[1]), source: best[0] };
  const any = candidates.find(([, value]) => clean(value));
  return { title: clean(any?.[1] || 'Live sans titre'), source: any?.[0] || 'fallback' };
}

function getWindow(item = {}, fallback = {}, tertiary = {}) {
  const sources = [item, fallback, tertiary].filter(Boolean);
  for (const source of sources) {
    const tracking = source.liveTracking || {};
    const schedulingWindow = source.schedulingWindow || {};
    const start = clean(
      source.teacherSchedulingWindowStartAt
      || schedulingWindow.teacherCanSelectFrom
      || schedulingWindow.recommendedStartAt
      || source.recommendedStartAt
      || source.plannedStartAt
      || tracking.schedulingWindow?.teacherCanSelectFrom
      || tracking.schedulingWindow?.recommendedStartAt
      || '',
      80
    );
    const end = clean(
      source.teacherSchedulingWindowEndAt
      || schedulingWindow.teacherCanSelectUntil
      || schedulingWindow.recommendedEndAt
      || source.recommendedEndAt
      || source.plannedEndAt
      || source.deadlineAt
      || tracking.schedulingWindow?.teacherCanSelectUntil
      || tracking.schedulingWindow?.recommendedEndAt
      || '',
      80
    );
    if (start || end) return { start, end };
  }
  return { start: '', end: '' };
}

function getTemplateLiveItems(promotion = {}) {
  const template = getPromotionTemplate(promotion);
  return Array.isArray(template?.items) ? template.items.filter((item) => item && typeof item === 'object' && isLiveType(item) && !isTestLive(item)) : [];
}

function getCoursePlanLiveItems(promotion = {}) {
  return Array.isArray(promotion.coursePlan) ? promotion.coursePlan.filter((item) => item && typeof item === 'object' && isLiveType(item) && !isTestLive(item)) : [];
}

function getLivePlanningItems(promotion = {}) {
  return Array.isArray(promotion.livePlanning) ? promotion.livePlanning.filter((item) => item && typeof item === 'object' && !isTestLive(item)) : [];
}

function getSourceLiveItems(promotion = {}) {
  const templateItems = getTemplateLiveItems(promotion);
  const coursePlanItems = getCoursePlanLiveItems(promotion);
  const livePlanningItems = getLivePlanningItems(promotion);
  if (templateItems.length) return { source: 'cursus', items: templateItems };
  if (coursePlanItems.length) return { source: 'promotion-coursePlan', items: coursePlanItems };
  return { source: 'promotion-livePlanning', items: livePlanningItems };
}

function findMatchingByIds(items = [], sourceItem = {}) {
  const ids = new Set(getItemIds(sourceItem));
  if (!ids.size) return null;
  return items.find((item) => getItemIds(item).some((id) => ids.has(id))) || null;
}

function findMatchingByTitle(items = [], sourceItem = {}) {
  const sourceTitle = normalizeText(sourceItem.title || sourceItem.courseTitle || sourceItem.liveTracking?.title || '');
  if (!sourceTitle || isGenericLiveTitle(sourceTitle)) return null;
  return items.find((item) => normalizeText(item.title || item.courseTitle || item.liveTracking?.title || '') === sourceTitle) || null;
}

function findMatchingByOrder(items = [], sourceItem = {}, liveIndex = 0) {
  const sourceOrder = Number(sourceItem.order);
  if (Number.isFinite(sourceOrder)) {
    const byOrder = items.find((item) => Number(item.order) === sourceOrder);
    if (byOrder) return byOrder;
  }
  return items[liveIndex] || null;
}

function findMatchingCoursePlanItem(promotion = {}, sourceItem = {}, liveIndex = 0) {
  const items = getCoursePlanLiveItems(promotion);
  return findMatchingByIds(items, sourceItem)
    || findMatchingByTitle(items, sourceItem)
    || findMatchingByOrder(items, sourceItem, liveIndex);
}

function findMatchingPlanningItem(promotion = {}, sourceItem = {}, coursePlanItem = null, liveIndex = 0) {
  const planning = getLivePlanningItems(promotion);
  return findMatchingByIds(planning, sourceItem)
    || findMatchingByIds(planning, coursePlanItem || {})
    || findMatchingByTitle(planning, sourceItem)
    || findMatchingByOrder(planning, sourceItem, liveIndex);
}

function findMatchingSession(promotion = {}, sourceItem = {}, coursePlanItem = null, planningItem = null) {
  const ids = new Set([
    ...getItemIds(sourceItem),
    ...getItemIds(coursePlanItem || {}),
    ...getItemIds(planningItem || {})
  ]);
  const liveSessionId = clean(planningItem?.liveSessionId || coursePlanItem?.liveSessionId || sourceItem.liveSessionId || '', 180);
  return state.sessions.find((session) => {
    if (session.promotionId !== promotion.id) return false;
    if (liveSessionId && session.id === liveSessionId) return true;
    const sessionIds = [session.id, session.liveId, session.sourceItemId].map((value) => clean(value, 180)).filter(Boolean);
    return sessionIds.some((id) => ids.has(id));
  }) || null;
}

function getRowSortTime(row = {}) {
  const candidates = [row.windowStart, row.startAt, row.windowEnd, row.endAt];
  for (const value of candidates) {
    const time = Date.parse(value || '');
    if (Number.isFinite(time)) return time;
  }
  return Number.POSITIVE_INFINITY;
}

function getLiveRows(promotion = {}) {
  const { source, items } = getSourceLiveItems(promotion);
  return items.map((item, index) => {
    const coursePlan = source === 'cursus' ? findMatchingCoursePlanItem(promotion, item, index) : (source === 'promotion-coursePlan' ? item : null);
    const planning = findMatchingPlanningItem(promotion, item, coursePlan, index);
    const session = findMatchingSession(promotion, item, coursePlan, planning);
    const startAt = clean(session?.selectedStartAt || planning?.selectedLiveAt || coursePlan?.selectedLiveAt || item.selectedLiveAt || '', 80);
    const endAt = clean(session?.selectedEndAt || planning?.selectedLiveEndAt || coursePlan?.selectedLiveEndAt || item.selectedLiveEndAt || '', 80);
    const window = getWindow(item, coursePlan || {}, planning || {});
    const titleInfo = pickTitleWithSource(item, coursePlan || {}, planning || {});
    const status = session?.report || planning?.reportOutsideWindow || planning?.liveSchedulingStatus === 'report'
      ? 'report'
      : startAt
        ? 'scheduled'
        : 'to_plan';
    const id = clean(getItemIds(item)[0] || getItemIds(coursePlan || {})[0] || getItemIds(planning || {})[0] || `${promotion.id}-live-${index}`, 180);
    return {
      id,
      source,
      titleSource: titleInfo.source,
      index,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      title: titleInfo.title,
      item,
      coursePlan,
      planning,
      session,
      startAt,
      endAt,
      windowStart: window.start,
      windowEnd: window.end,
      status
    };
  }).sort((a, b) => {
    const dateDelta = getRowSortTime(a) - getRowSortTime(b);
    if (dateDelta !== 0) return dateDelta;
    return (a.order - b.order) || a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  });
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
  if (!root) return;
  if (!promotion) {
    root.innerHTML = '';
    return;
  }
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
  if (!root) return;
  if (!promotion) {
    root.innerHTML = '<div class="sbi-live-v2-empty">Aucune promotion sélectionnée.</div>';
    return;
  }
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
          <strong>${escapeHtml(row.title)}</strong>
          ${chip(row.status)}
        </div>
        <span>${escapeHtml(getScheduleLineForRow(row))}</span>
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

function getDefaultStartForRow(row = {}) {
  return row.startAt || row.windowStart || '';
}

function getRowSessionId(row = {}) {
  return row.session?.id || row.planning?.liveSessionId || row.coursePlan?.liveSessionId || row.item?.liveSessionId || '';
}

function getRowSourceId(row = {}) {
  return clean(
    row.item?.sourceItemId
    || row.item?.id
    || row.item?.itemId
    || row.coursePlan?.sourceItemId
    || row.coursePlan?.id
    || row.coursePlan?.itemId
    || row.planning?.sourceItemId
    || row.planning?.id
    || row.planning?.itemId
    || row.id,
    180
  );
}


function isLiveSessionOpen(session = {}) {
  if (!session || typeof session !== 'object') return false;
  const status = clean(
    session.status
    || session.liveSchedulingStatus
    || session.schedulingStatus
    || session.studentScheduleStatus
    || '',
    80
  ).toLowerCase();
  return ['live', 'started', 'in_progress', 'ongoing', 'open'].includes(status)
    || Boolean(session.startedAt || session.openedAt || session.liveStartedAt);
}

function isLiveSessionClosed(session = {}) {
  const status = clean(session?.status || session?.liveSchedulingStatus || session?.schedulingStatus || '', 80).toLowerCase();
  return ['ended', 'replay_available', 'cancelled', 'closed', 'done'].includes(status);
}

function getTestLiveSession(promotion = {}) {
  const matches = state.sessions.filter((session) => {
    if (session.promotionId !== promotion.id) return false;
    return isTestLive(session)
      || clean(session.sourceType).toLowerCase() === 'live_test'
      || clean(session.sourceItemId).toLowerCase() === 'sbi-live-test';
  });
  return matches.find(isLiveSessionOpen)
    || matches.find((session) => !isLiveSessionClosed(session))
    || matches[0]
    || null;
}

function renderTestRoomBox(promotion = {}) {
  if (state.role !== 'teacher') return '';
  const session = getTestLiveSession(promotion);
  const ready = Boolean(session?.id);
  const isOpen = isLiveSessionOpen(session);
  const label = isOpen
    ? 'Salle test ouverte : les élèves peuvent la rejoindre depuis leur liste de lives.'
    : ready
      ? 'Salle test existante : cliquez pour la rouvrir immédiatement aux élèves.'
      : 'Ouvre immédiatement une salle test visible par les élèves et envoie une notification.';
  return `
    <section class="sbi-live-v2-test-box">
      <div>
        <h3>Salle de test</h3>
        <p>${escapeHtml(label)}</p>
      </div>
      <button class="sbi-live-v2-btn" type="button" id="sbi-live-v2-test-room">
        ${isOpen ? 'Rejoindre la salle test' : 'Ouvrir la salle test maintenant'}
      </button>
    </section>
  `;
}

function renderDetail() {
  const root = $('sbi-live-v2-detail');
  const promotion = getSelectedPromotion();
  const row = getSelectedLiveRow(promotion);
  if (!root || !promotion || !row) {
    if (root) root.innerHTML = '<div class="sbi-live-v2-empty">Sélectionnez une promotion et un live.</div>';
    return;
  }

  const defaultStart = getDefaultStartForRow(row);
  const defaultDuration = durationMinutes(row.startAt || row.windowStart, row.endAt || row.windowEnd);
  const liveId = getRowSessionId(row);
  const selectedMode = row.status === 'report' ? 'report' : 'scheduled';
  const canOpen = Boolean(liveId);

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
          <span>Période prévue</span><strong>${escapeHtml(formatPlannedWeek(row))}</strong>
          <span>Source du titre</span><strong>${escapeHtml(row.titleSource)}</strong>
        </div>
      </section>

      ${renderTestRoomBox(promotion)}

      <form class="sbi-live-v2-form" id="sbi-live-v2-form">
        <section class="sbi-live-v2-info">
          <h3>Planification</h3>
          <label>Titre du live
            <input type="text" value="${escapeHtml(row.title)}" readonly>
          </label>
          <div class="sbi-live-v2-form-row">
            <label>Date prévue du live
              <input id="sbi-live-v2-start" type="datetime-local" value="${escapeHtml(toDateTimeLocal(defaultStart))}">
            </label>
            <label>Durée prévue
              <select id="sbi-live-v2-duration">
                ${[30, 45, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${defaultDuration === minutes ? 'selected' : ''}>${minutes} min</option>`).join('')}
              </select>
            </label>
          </div>
          <label>Statut de planification</label>
          <div class="sbi-live-v2-mode-toggle" id="sbi-live-v2-mode-toggle">
            <button type="button" class="sbi-live-v2-mode-btn${selectedMode === 'scheduled' ? ' is-active' : ''}" data-mode="scheduled">Dans la période prévue</button>
            <button type="button" class="sbi-live-v2-mode-btn${selectedMode === 'report' ? ' is-active' : ''}" data-mode="report">Report hors période</button>
          </div>
          <label>Lien salle externe provisoire
            <input id="sbi-live-v2-meeting-url" value="${escapeHtml(row.session?.meetingUrl || '')}" placeholder="https://...">
          </label>
          <div class="sbi-live-v2-form-note" id="sbi-live-v2-plan-note">
            ${selectedMode === 'report' ? 'Le live sera enregistré comme report hors période.' : 'La date prévue doit rester dans la période du cursus, sauf report.'}
          </div>
        </section>

        <div class="sbi-live-v2-actions">
          <button class="sbi-live-v2-btn sbi-live-v2-btn-primary" type="submit">Enregistrer la planification</button>
          <button class="sbi-live-v2-btn" type="button" id="sbi-live-v2-open-room" ${canOpen ? '' : 'disabled'}>Ouvrir la salle</button>
          <button class="sbi-live-v2-btn" type="button" id="sbi-live-v2-started" ${canOpen ? '' : 'disabled'}>Notifier le démarrage</button>
        </div>
      </form>
    </div>
  `;

  bindLiveV2DelegatedEvents();
}


function bindLiveV2DelegatedEvents() {
  const root = document.querySelector('[data-sbi-live-v2]');
  if (!root || root.dataset.sbiLiveV2Delegated === 'true') return;
  root.dataset.sbiLiveV2Delegated = 'true';

  root.addEventListener('click', async (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;

    const refreshButton = target?.closest?.('#sbi-live-v2-refresh');
    if (refreshButton && root.contains(refreshButton)) {
      event.preventDefault();
      await refreshData({ preserveSelection: true });
      return;
    }

    const modeButton = target?.closest?.('#sbi-live-v2-mode-toggle [data-mode]');
    if (modeButton && root.contains(modeButton)) {
      event.preventDefault();
      const toggle = $('sbi-live-v2-mode-toggle');
      toggle?.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item === modeButton));
      const note = $('sbi-live-v2-plan-note');
      if (note) note.textContent = modeButton.dataset.mode === 'report'
        ? 'Le live sera enregistré comme report hors période.'
        : 'La date prévue doit rester dans la période du cursus, sauf report.';
      return;
    }

    const promotionButton = target?.closest?.('[data-promotion-id]');
    if (promotionButton && root.contains(promotionButton)) {
      event.preventDefault();
      state.selectedPromotionId = promotionButton.dataset.promotionId || '';
      state.selectedLiveId = '';
      renderAll();
      return;
    }

    const liveButton = target?.closest?.('[data-live-id]');
    if (liveButton && root.contains(liveButton)) {
      event.preventDefault();
      state.selectedLiveId = liveButton.dataset.liveId || '';
      renderAll();
      return;
    }

    const openRoomButton = target?.closest?.('#sbi-live-v2-open-room');
    if (openRoomButton && root.contains(openRoomButton)) {
      event.preventDefault();
      const promotion = getSelectedPromotion();
      const row = getSelectedLiveRow(promotion);
      const id = getRowSessionId(row || {});
      if (id) window.open(`/live-room.html?liveId=${encodeURIComponent(id)}&start=1`, '_blank', 'noopener,noreferrer');
      return;
    }

    const startedButton = target?.closest?.('#sbi-live-v2-started');
    if (startedButton && root.contains(startedButton)) {
      event.preventDefault();
      const promotion = getSelectedPromotion();
      const row = getSelectedLiveRow(promotion);
      const id = getRowSessionId(row || {});
      if (id) await submitStarted(id);
      return;
    }

    const testButton = target?.closest?.('#sbi-live-v2-test-room');
    if (testButton && root.contains(testButton)) {
      event.preventDefault();
      const promotion = getSelectedPromotion();
      if (promotion) await openOrCreateTestRoom(promotion);
    }
  });

  root.addEventListener('submit', async (event) => {
    if (event.defaultPrevented) return;
    const form = event.target?.closest?.('#sbi-live-v2-form');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const promotion = getSelectedPromotion();
    const row = getSelectedLiveRow(promotion);
    if (promotion && row) await submitSchedule(promotion, row);
  });
}

async function submitSchedule(promotion, row) {
  const button = $('sbi-live-v2-form')?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus('Enregistrement de la planification…', 'muted');

  try {
    const startIso = fromDateTimeLocal($('sbi-live-v2-start')?.value || '');
    if (!startIso) throw new Error('Date prévue manquante.');
    const duration = Number($('sbi-live-v2-duration')?.value || 60) || 60;
    const endIso = addMinutesIso(startIso, duration);
    const mode = $('sbi-live-v2-mode-toggle')?.querySelector('.is-active')?.dataset?.mode || 'scheduled';
    const sourceItemId = getRowSourceId(row);

    const result = await scheduleLiveSession({
      promotionId: promotion.id,
      liveId: getRowSessionId(row) || row.id,
      sourceItemId,
      type: row.item?.type || row.coursePlan?.type || row.planning?.type || 'live_session',
      provider: 'daily',
      title: row.title,
      selectedStartAt: startIso,
      selectedEndAt: endIso,
      meetingUrl: $('sbi-live-v2-meeting-url')?.value || '',
      report: mode === 'report'
    });

    state.selectedPromotionId = promotion.id;
    state.selectedLiveId = row.id;
    setStatus(result?.data?.message || 'Live programmé.', 'success');
    await refreshData({ preserveSelection: true });
  } catch (error) {
    console.error('[SBI Lives V2] Planification impossible :', error);
    setStatus(error?.message || 'Planification impossible.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}


async function openOrCreateTestRoom(promotion = {}) {
  if (!promotion?.id) return;
  const button = $('sbi-live-v2-test-room');
  const popup = window.open('about:blank', '_blank');
  if (popup) {
    try { popup.document.write('<!doctype html><title>SBI</title><body style="font-family:Arial;padding:24px;background:#050914;color:white">Préparation de la salle test SBI…</body>'); } catch (_) {}
  }
  if (button) button.disabled = true;
  setStatus('Ouverture immédiate de la salle test…', 'muted');

  try {
    const result = await scheduleLiveSession({
      promotionId: promotion.id,
      liveId: 'sbi-live-test',
      sourceItemId: 'sbi-live-test',
      type: 'live_test',
      provider: 'daily',
      title: `Salle test - ${getPromotionName(promotion)}`,
      openNow: true,
      notifyStudents: true,
      report: false
    });
    const liveId = result?.data?.liveId || getTestLiveSession(promotion)?.id || '';
    if (!liveId) throw new Error('Salle test introuvable après ouverture.');

    const roomUrl = `/live-room.html?liveId=${encodeURIComponent(liveId)}&start=1`;
    if (popup && !popup.closed) {
      try { popup.opener = null; } catch (_) {}
      popup.location.href = roomUrl;
    } else {
      window.open(roomUrl, '_blank', 'noopener,noreferrer');
    }

    await refreshData({ preserveSelection: true });
    setStatus('Salle test ouverte et notification envoyée aux élèves.', 'success');
  } catch (error) {
    if (popup && !popup.closed) {
      try { popup.close(); } catch (_) {}
    }
    console.error('[SBI Lives V2] Salle test impossible :', error);
    setStatus(error?.message || 'Salle test impossible.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitStarted(liveId) {
  setStatus('Notification de démarrage…', 'muted');
  try {
    const result = await notifyLiveStarted({ liveId });
    setStatus(result?.data?.message || 'Notification envoyée.', 'success');
  } catch (error) {
    console.error('[SBI Lives V2] Notification impossible :', error);
    setStatus(error?.message || 'Notification impossible.', 'error');
  }
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

function loadTemplatesFromServer(templates = []) {
  state.templatesById = new Map();
  if (!Array.isArray(templates)) return;
  templates.forEach((template) => {
    const id = clean(template?.id || '', 180);
    if (!id) return;
    state.templatesById.set(id, template);
  });
}

async function refreshData(options = {}) {
  const previousPromotionId = state.selectedPromotionId;
  const previousLiveId = state.selectedLiveId;
  setStatus('Chargement des lives…');
  try {
    const result = await getLiveSchedulerData({ role: state.role, version: 'v2' });
    const data = result?.data || {};
    state.promotions = Array.isArray(data.promotions) ? data.promotions : [];
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    loadTemplatesFromServer(data.templates);
    state.promotions.sort((a, b) => getPromotionName(a).localeCompare(getPromotionName(b), 'fr', { sensitivity: 'base' }));
    if (options.preserveSelection) {
      state.selectedPromotionId = state.promotions.some((promotion) => promotion.id === previousPromotionId) ? previousPromotionId : '';
      state.selectedLiveId = previousLiveId || '';
    }
    renderAll();
    setStatus('Lives chargé.', 'success');
  } catch (error) {
    console.error('[SBI Lives V2] Chargement impossible :', error);
    forceRevealLiveSchedulerV2Page();
    setStatus(error?.message || 'Chargement impossible.', 'error');
    renderAll();
  }
}

export function mountLiveSchedulerV2Page(role = 'teacher') {
  forceRevealLiveSchedulerV2Page();
  const root = document.querySelector('[data-sbi-live-v2]');
  if (!root) return null;

  if (mounted && mountedRoot === root) {
    renderAll();
    return null;
  }

  if (mounted && mountedRoot !== root) {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    mounted = false;
  }

  mounted = true;
  mountedRoot = root;
  state.role = role === 'admin' ? 'admin' : 'teacher';

  bindLiveV2DelegatedEvents();
  $('sbi-live-v2-refresh')?.addEventListener('click', () => refreshData({ preserveSelection: true }));

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    forceRevealLiveSchedulerV2Page();
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    state.uid = user.uid;
    await refreshData({ preserveSelection: true });
  });

  return () => {
    mounted = false;
    mountedRoot = null;
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = null;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

function bootLiveSchedulerV2Page() {
  forceRevealLiveSchedulerV2Page();
  const root = document.querySelector('[data-sbi-live-v2]');
  if (root && (!mounted || mountedRoot !== root)) {
    mountLiveSchedulerV2Page(document.body.dataset.liveV2Role || 'teacher');
  } else if (root && mounted && mountedRoot === root) {
    renderAll();
  }
  if (bootTimer) clearTimeout(bootTimer);
  bootTimer = setTimeout(() => {
    forceRevealLiveSchedulerV2Page();
    const currentRoot = document.querySelector('[data-sbi-live-v2]');
    if (currentRoot && (!mounted || mountedRoot !== currentRoot)) {
      mountLiveSchedulerV2Page(document.body.dataset.liveV2Role || 'teacher');
    }
  }, 650);
}

if (document.querySelector('[data-sbi-live-v2]')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLiveSchedulerV2Page, { once: true });
  } else {
    bootLiveSchedulerV2Page();
  }
}


window.addEventListener('error', (event) => {
  forceRevealLiveSchedulerV2Page();
  console.error('[SBI Lives V2] Page error:', event?.error || event?.message);
});

window.addEventListener('unhandledrejection', (event) => {
  forceRevealLiveSchedulerV2Page();
  console.error('[SBI Lives V2] Promise rejection:', event?.reason);
});
