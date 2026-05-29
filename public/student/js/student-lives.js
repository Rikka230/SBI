import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import {
  buildSessionMap,
  clean,
  escapeHtml,
  formatDateRange,
  formatDateTime,
  getLiveSessionForItem,
  getLiveTitle,
  getLiveWindowLabel,
  getPromotionLives,
  getPromotionName,
  getStudentPromotionIds,
  loadLiveSessionsForPromotions,
  loadProfile,
  loadPromotionsByIds,
  renderEmpty
} from '/js/live/live-shared.js?v=8.0P.167.239';

const functionsInstance = getFunctions(app, 'europe-west1');
const getStudentLiveAttendance = httpsCallable(functionsInstance, 'getStudentLiveAttendance');
const getLiveSchedulerData = httpsCallable(functionsInstance, 'getLiveSchedulerData');

const state = {
  profile: null,
  promotions: [],
  sessions: [],
  templatesById: new Map(),
  attendanceByLiveId: {},
  view: 'list',
  tab: 'upcoming',
  uid: ''
};

function $(id) {
  return document.getElementById(id);
}

function forceRevealStudentLivesPage() {
  try { document.documentElement?.classList?.remove('preload'); } catch (_) {}
  try { document.body?.classList?.remove('preload'); } catch (_) {}
  const root = $('student-live-content');
  if (root) root.hidden = false;
}

function markStudentLivesAuthReady(isReady = true) {
  try {
    document.body?.classList?.toggle('auth-ready', Boolean(isReady));
  } catch (_) {}
}

function removeLegacyLivesShellOverrides() {
  document.querySelectorAll('style[data-sbi-pjax-source]').forEach((style) => {
    const source = String(style.getAttribute('data-sbi-pjax-source') || '').toLowerCase();
    const cssText = style.textContent || '';
    if ((source.includes('/student/lives') || cssText.includes('body.sbi-live-page'))
      && cssText.includes('#app-container')
      && cssText.includes('display: block')) {
      style.remove();
    }
  });
}

function readInitialTab() {
  try {
    const url = new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
    const tab = url.searchParams.get('tab') || new URLSearchParams(String(url.hash || '').replace(/^#/, '')).get('tab');
    if (['upcoming', 'replay'].includes(tab)) return tab;
  } catch (_) {}
  try {
    const stored = sessionStorage.getItem('sbi:lastStudentLivesTab');
    if (['upcoming', 'replay'].includes(stored)) return stored;
  } catch (_) {}
  return 'upcoming';
}

function setStatus(message = '') {
  forceRevealStudentLivesPage();
  const node = $('student-live-status');
  if (node) node.textContent = message;
}

function renderLoadError(message = '') {
  window.__SBI_STUDENT_LIVES_RENDERED = true;
  forceRevealStudentLivesPage();
  const root = $('student-live-content');
  if (root) root.innerHTML = renderEmpty(message || 'Chargement impossible. Rechargez la page.');
}

function getLiveIdForRow(row = {}) {
  return row.session?.id || row.live?.liveSessionId || row.live?.sessionId || row.live?.id || row.id || '';
}


function isGenericLiveTitle(value = '') {
  const title = clean(value).toLowerCase();
  return !title || title === 'live sbi' || title === 'live sans titre' || title === 'nouveau live' || title === 'nouvel atelier';
}

function pickLiveTitle(...values) {
  const cleaned = values.map((value) => clean(value, 240)).filter(Boolean);
  return cleaned.find((value) => !isGenericLiveTitle(value)) || cleaned[0] || 'Live SBI';
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

function getItemType(item = {}) {
  return clean(item.type || item.kind || item.sourceType || '', 80).toLowerCase();
}

function isLiveSourceItem(item = {}) {
  const type = getItemType(item);
  return type === 'live_session' || type === 'workshop' || Boolean(item.liveTracking && typeof item.liveTracking === 'object');
}

function isTestLive(item = {}) {
  const values = [item.id, item.itemId, item.sourceItemId, item.liveId, item.type, item.sourceType]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return item.isTestLive === true || item.testLive === true || values.includes('sbi-live-test') || values.includes('live_test');
}

function isLiveTestSession(session = {}) {
  return isTestLive(session)
    || clean(session.sourceType).toLowerCase() === 'live_test'
    || clean(session.sourceItemId).toLowerCase() === 'sbi-live-test';
}

function isVisibleLiveTestSession(session = {}) {
  if (!isLiveTestSession(session)) return false;
  const status = clean(session.status || '').toLowerCase();
  const hasRoom = Boolean(
    session.startedAt
    || session.openedAt
    || session.liveStartedAt
    || session.providerRoomUrl
    || session.providerRoomName
    || session.meetingUrl
    || session.liveTech?.roomUrl
    || session.liveTech?.roomName
    || session.liveTech?.providerReady
  );
  return hasRoom && ['live', 'started', 'in_progress', 'ongoing', 'open'].includes(status);
}

function isLiveTestRow(row = {}) {
  return isLiveTestSession(row.session || {}) || isTestLive(row.live || {});
}

function getItemIds(item = {}) {
  return [item.id, item.itemId, item.sourceItemId, item.liveId, item.templateItemId, item.liveTracking?.itemId, item.liveTracking?.sourceItemId, item.liveTracking?.templateItemId]
    .map((value) => clean(value, 180))
    .filter(Boolean);
}

function getSourceLiveItems(promotion = {}) {
  const template = getPromotionTemplate(promotion);
  const templateItems = Array.isArray(template?.items) ? template.items.filter((item) => isLiveSourceItem(item) && !isTestLive(item)) : [];
  const coursePlanItems = Array.isArray(promotion.coursePlan) ? promotion.coursePlan.filter((item) => isLiveSourceItem(item) && !isTestLive(item)) : [];
  const livePlanningItems = getPromotionLives(promotion).filter((item) => !isTestLive(item));
  if (templateItems.length) return templateItems;
  if (coursePlanItems.length) return coursePlanItems;
  return livePlanningItems;
}

function findMatchingPlanningItem(promotion = {}, sourceItem = {}) {
  const planning = getPromotionLives(promotion).filter((item) => !isTestLive(item));
  const ids = new Set(getItemIds(sourceItem));
  const title = pickLiveTitle(sourceItem.title, sourceItem.courseTitle, sourceItem.liveTracking?.title).toLowerCase();
  return planning.find((item) => getItemIds(item).some((id) => ids.has(id)))
    || planning.find((item) => title && pickLiveTitle(item.title, item.courseTitle, item.liveTracking?.title).toLowerCase() === title)
    || null;
}

function findMatchingSession(promotion = {}, sourceItem = {}, planningItem = null, sessionMap = new Map()) {
  const direct = planningItem ? getLiveSessionForItem(promotion, planningItem, sessionMap) : null;
  if (direct) return direct;
  const liveSessionId = clean(planningItem?.liveSessionId || sourceItem.liveSessionId || '', 180);
  const ids = new Set([...getItemIds(sourceItem), ...getItemIds(planningItem || {})]);
  return state.sessions.find((session) => {
    if (session.promotionId !== promotion.id) return false;
    if (liveSessionId && session.id === liveSessionId) return true;
    const sessionIds = [session.id, session.liveId, session.sourceItemId].map((value) => clean(value, 180)).filter(Boolean);
    return sessionIds.some((id) => ids.has(id));
  }) || null;
}

function getLiveWindow(source = {}, fallback = {}) {
  const tracking = source.liveTracking || {};
  const fallbackTracking = fallback.liveTracking || {};
  const start = clean(
    source.teacherSchedulingWindowStartAt
    || source.schedulingWindow?.teacherCanSelectFrom
    || source.schedulingWindow?.recommendedStartAt
    || source.recommendedStartAt
    || source.plannedStartAt
    || tracking.schedulingWindow?.teacherCanSelectFrom
    || tracking.schedulingWindow?.recommendedStartAt
    || fallback.teacherSchedulingWindowStartAt
    || fallback.schedulingWindow?.teacherCanSelectFrom
    || fallback.schedulingWindow?.recommendedStartAt
    || fallback.recommendedStartAt
    || fallback.plannedStartAt
    || fallbackTracking.schedulingWindow?.teacherCanSelectFrom
    || fallbackTracking.schedulingWindow?.recommendedStartAt
    || '',
    80
  );
  const end = clean(
    source.teacherSchedulingWindowEndAt
    || source.schedulingWindow?.teacherCanSelectUntil
    || source.schedulingWindow?.recommendedEndAt
    || source.recommendedEndAt
    || source.plannedEndAt
    || source.deadlineAt
    || tracking.schedulingWindow?.teacherCanSelectUntil
    || tracking.schedulingWindow?.recommendedEndAt
    || fallback.teacherSchedulingWindowEndAt
    || fallback.schedulingWindow?.teacherCanSelectUntil
    || fallback.schedulingWindow?.recommendedEndAt
    || fallback.recommendedEndAt
    || fallback.plannedEndAt
    || fallback.deadlineAt
    || fallbackTracking.schedulingWindow?.teacherCanSelectUntil
    || fallbackTracking.schedulingWindow?.recommendedEndAt
    || '',
    80
  );
  return { start, end };
}

function getChronologyMs(row = {}) {
  const candidates = [
    row.windowStart,
    row.startAt,
    row.windowEnd,
    row.live?.teacherSchedulingWindowStartAt,
    row.planning?.teacherSchedulingWindowStartAt,
    row.live?.schedulingWindow?.teacherCanSelectFrom,
    row.planning?.schedulingWindow?.teacherCanSelectFrom,
    row.live?.schedulingWindow?.recommendedStartAt,
    row.planning?.schedulingWindow?.recommendedStartAt,
    row.live?.liveTracking?.schedulingWindow?.teacherCanSelectFrom,
    row.planning?.liveTracking?.schedulingWindow?.teacherCanSelectFrom,
    row.live?.liveTracking?.schedulingWindow?.recommendedStartAt,
    row.planning?.liveTracking?.schedulingWindow?.recommendedStartAt
  ];
  for (const value of candidates) {
    const ms = Date.parse(value || '');
    if (Number.isFinite(ms)) return ms;
  }
  return Number.MAX_SAFE_INTEGER;
}

function getRowDateLabel(row = {}) {
  if (row.startAt) return formatDateRange(row.startAt, row.endAt);
  if (row.windowStart || row.windowEnd) return formatDateRange(row.windowStart, row.windowEnd);
  return getLiveWindowLabel(row.live, row.promotion);
}

function getRows() {
  const sessionMap = buildSessionMap(state.sessions);
  const rows = [];

  state.promotions.forEach((promotion) => {
    getSourceLiveItems(promotion).forEach((sourceLive, index) => {
      const planning = findMatchingPlanningItem(promotion, sourceLive);
      const session = findMatchingSession(promotion, sourceLive, planning, sessionMap);
      const liveId = session?.id || planning?.liveSessionId || sourceLive.liveSessionId || `${promotion.id}-${clean(getItemIds(sourceLive)[0] || getItemIds(planning || {})[0] || `live-${index}`)}`;
      const title = pickLiveTitle(
        sourceLive.title,
        sourceLive.courseTitle,
        sourceLive.liveTracking?.title,
        planning?.title,
        planning?.courseTitle,
        planning?.liveTracking?.title,
        session?.title,
        getLiveTitle(sourceLive, promotion)
      );
      const startAt = session?.selectedStartAt || planning?.selectedLiveAt || sourceLive.selectedLiveAt || '';
      const endAt = session?.selectedEndAt || planning?.selectedLiveEndAt || sourceLive.selectedLiveEndAt || '';
      const window = getLiveWindow(sourceLive, planning || {});
      rows.push({
        id: liveId,
        title,
        promotion,
        live: sourceLive,
        planning,
        session,
        startAt,
        endAt,
        windowStart: window.start,
        windowEnd: window.end,
        order: Number.isFinite(Number(sourceLive.order)) ? Number(sourceLive.order) : index,
        replayUrl: session?.replayUrl || session?.replayAccessUrl || session?.liveTech?.replayUrl || planning?.replayUrl || sourceLive.replayUrl || '',
        replayStatus: session?.replayStatus || session?.liveTech?.replayStatus || planning?.replayStatus || sourceLive.replayStatus || '',
        status: (session?.report === true || planning?.reportOutsideWindow === true || planning?.liveSchedulingStatus === 'report')
          ? 'report'
          : (session?.status || planning?.status || planning?.liveSchedulingStatus || sourceLive.status || sourceLive.liveSchedulingStatus || 'to_schedule'),
        providerReady: Boolean(session?.providerRoomName || session?.providerRoomUrl || session?.meetingUrl || session?.liveTech?.providerReady || planning?.providerReady || planning?.providerRoomName || planning?.providerRoomUrl || sourceLive.providerReady || sourceLive.providerRoomName || sourceLive.providerRoomUrl)
      });
    });
  });

  state.sessions.forEach((session) => {
    const testSession = isLiveTestSession(session);
    if (testSession && !isVisibleLiveTestSession(session)) return;
    if (rows.some((row) => row.session?.id === session.id || row.id === session.id)) return;
    rows.push({
      id: session.id,
      title: pickLiveTitle(session.title, testSession ? 'Live test' : 'Live SBI'),
      promotion: state.promotions.find((promotion) => promotion.id === session.promotionId) || {},
      live: testSession ? { isTestLive: true, testLive: true, type: 'live_test' } : {},
      planning: null,
      session,
      startAt: session.selectedStartAt || '',
      endAt: session.selectedEndAt || '',
      replayUrl: testSession ? '' : (session.replayUrl || session.replayAccessUrl || session.liveTech?.replayUrl || ''),
      replayStatus: testSession ? '' : (session.replayStatus || session.liveTech?.replayStatus || ''),
      status: testSession ? (session.status || 'live') : (session.report === true || session.schedulingStatus === 'report' ? 'report' : (session.status || 'scheduled')),
      providerReady: Boolean(session.providerRoomName || session.providerRoomUrl || session.meetingUrl || session.liveTech?.providerReady)
    });
  });

  return rows.sort((a, b) => {
    const chronology = getChronologyMs(a) - getChronologyMs(b);
    if (chronology !== 0) return chronology;
    const order = (Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER);
    if (order !== 0) return order;
    return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  });
}


function isReportRow(row = {}) {
  const status = clean(row.status || '').toLowerCase();
  const planningStatus = clean(row.planning?.liveSchedulingStatus || row.planning?.teacherSelectionStatus || '').toLowerCase();
  const sessionStatus = clean(row.session?.schedulingStatus || '').toLowerCase();
  return row.session?.report === true
    || row.planning?.reportOutsideWindow === true
    || row.live?.reportOutsideWindow === true
    || status === 'report'
    || planningStatus === 'report'
    || planningStatus === 'reported'
    || sessionStatus === 'report';
}

function isReplay(row) {
  if (row.replayUrl) return true;
  const status = clean(row.status).toLowerCase();
  const replayStatus = clean(row.replayStatus).toLowerCase();
  if (['available', 'ready', 'replay_available'].includes(replayStatus)) return true;
  if (!row.startAt) return false;
  return Date.parse(row.startAt) < Date.now() && ['ended', 'replay_available'].includes(status);
}

function canRequestReplay(row = {}) {
  const liveId = getLiveIdForRow(row);
  return Boolean(liveId) && isReplay(row);
}

function isLiveJoinOpen(row = {}) {
  const liveId = getLiveIdForRow(row);
  if (!liveId) return false;
  const status = clean(row.status || row.session?.status || row.live?.status || '').toLowerCase();
  if (['cancelled', 'ended', 'replay_available', 'done', 'closed', 'to_schedule', 'scheduled', 'validated', 'planned', 'pending'].includes(status)) return false;
  const hasHostOpenedRoom = Boolean(
    row.session?.startedAt ||
    row.session?.openedAt ||
    row.session?.liveStartedAt ||
    row.session?.providerRoomUrl ||
    row.session?.providerRoomName ||
    row.session?.liveTech?.roomUrl ||
    row.session?.liveTech?.roomName
  );
  return hasHostOpenedRoom && ['live', 'started', 'in_progress', 'ongoing', 'open'].includes(status);
}

function getJoinClosedLabel(row = {}) {
  if (isReportRow(row)) return 'Report hors période';
  const status = clean(row.status || '').toLowerCase();
  if (['ended', 'replay_available', 'done', 'closed'].includes(status)) return 'Live terminé';
  if (status === 'cancelled') return 'Live annulé';
  return 'Pas encore ouvert';
}

function canJoinLive(row = {}) {
  return isLiveJoinOpen(row);
}

function getAttendanceBadges(row = {}) {
  const liveId = getLiveIdForRow(row);
  const attendance = state.attendanceByLiveId[liveId] || {};
  const joinedLive = Boolean(attendance.lastTokenIssuedAt || attendance.joinedAt || attendance.joinedVia === 'joinLiveConference');
  const watchedReplay = Boolean(attendance.watchedReplay || attendance.replayWatchedAt);
  const badges = [
    joinedLive ? '✓ Live suivi' : '○ Live non rejoint',
    watchedReplay ? '✓ Replay regardé' : '○ Replay non regardé'
  ];
  return `<div class="sbi-live-attendance-badges">${badges.map((badge) => `<span class="${badge.startsWith('✓') ? 'is-ok' : 'is-muted'}">${escapeHtml(badge)}</span>`).join('')}</div>`;
}

function renderReplayButton(row = {}) {
  const liveId = getLiveIdForRow(row);
  if (!canRequestReplay(row)) return '';
  const encoded = encodeURIComponent(liveId);
  return `<a class="sbi-live-btn sbi-live-btn--ghost" data-live-replay-link="true" data-live-id="${encoded}" href="/student/live-replay/${encoded}?liveId=${encoded}#liveId=${encoded}">Regarder</a>`;
}

function renderList(rows) {
  const filtered = rows.filter((row) => state.tab === 'replay' ? isReplay(row) : !isReplay(row));
  if (!filtered.length) {
    return renderEmpty(state.tab === 'replay' ? 'Aucun replay disponible.' : 'Aucun live programme pour le moment.');
  }

  return `<div class="sbi-live-student-grid">${filtered.map((row) => `
    <article class="sbi-live-card">
      <strong>${escapeHtml(row.title)}</strong>
      <span>${escapeHtml(getPromotionName(row.promotion))}</span>
      <span>${escapeHtml(getRowDateLabel(row))}</span>
      ${isReportRow(row) ? '<span class="sbi-live-report-badge">Report hors période</span>' : ''}
      ${isLiveTestRow(row) ? '<span class="sbi-live-test-badge">Salle test ouverte</span>' : ''}
      ${getAttendanceBadges(row)}
      <div class="sbi-live-card-actions">
        ${canJoinLive(row) ? `<a class="sbi-live-btn" data-live-room-link="true" data-live-id="${encodeURIComponent(getLiveIdForRow(row))}" href="/live-room/${encodeURIComponent(getLiveIdForRow(row))}?liveId=${encodeURIComponent(getLiveIdForRow(row))}#liveId=${encodeURIComponent(getLiveIdForRow(row))}">Rejoindre la salle</a>` : (state.tab === 'upcoming' ? `<span class="sbi-live-btn sbi-live-btn--ghost is-disabled" aria-disabled="true">${escapeHtml(getJoinClosedLabel(row))}</span>` : '')}
        ${renderReplayButton(row)}
      </div>
    </article>
  `).join('')}</div>`;
}

function renderCalendar(rows) {
  const filtered = rows.filter((row) => state.tab === 'replay' ? isReplay(row) : !isReplay(row));
  if (!filtered.length) return renderEmpty('Aucun element a afficher.');

  return `<div class="sbi-live-calendar">${filtered.map((row) => `
    <div class="sbi-live-day">
      <strong>${escapeHtml(row.startAt ? formatDateTime(row.startAt) : row.windowStart ? formatDateTime(row.windowStart) : 'A planifier')}</strong>
      <span>${escapeHtml(row.title)}${isReportRow(row) ? ' · Report hors période' : ''}${isLiveTestRow(row) ? ' · Salle test' : ''}</span>
    </div>
  `).join('')}</div>`;
}

async function loadAttendanceForRows(uid = '') {
  if (!uid) return;
  const liveIds = [...new Set(getRows().map((row) => getLiveIdForRow(row)).filter(Boolean))].slice(0, 80);
  if (!liveIds.length) {
    state.attendanceByLiveId = {};
    return;
  }
  try {
    const result = await getStudentLiveAttendance({ liveIds });
    state.attendanceByLiveId = result?.data?.attendanceByLiveId || {};
  } catch (error) {
    console.warn('[SBI Student Lives] Attendance indisponible via callable :', error);
    state.attendanceByLiveId = {};
  }
}

function render() {
  window.__SBI_STUDENT_LIVES_RENDERED = true;
  forceRevealStudentLivesPage();
  const root = $('student-live-content');
  if (!root) return;
  const rows = getRows();
  root.innerHTML = state.view === 'calendar' ? renderCalendar(rows) : renderList(rows);

  document.querySelectorAll('[data-live-replay-link]').forEach((link) => {
    link.addEventListener('click', () => {
      const liveId = decodeURIComponent(link.dataset.liveId || '');
      if (liveId) {
        sessionStorage.setItem('sbi:lastReplayLiveId', liveId);
        localStorage.setItem('sbi:lastReplayLiveId', liveId);
        sessionStorage.setItem('sbi:lastStudentLivesTab', 'replay');
      }
    });
  });
  document.querySelectorAll('[data-live-room-link]').forEach((link) => {
    link.addEventListener('click', () => {
      const liveId = decodeURIComponent(link.dataset.liveId || '');
      if (liveId) {
        sessionStorage.setItem('sbi:lastLiveRoomId', liveId);
        localStorage.setItem('sbi:lastLiveRoomId', liveId);
        sessionStorage.setItem('sbi:lastStudentLivesTab', 'upcoming');
      }
    });
  });

  document.querySelectorAll('[data-student-live-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.studentLiveTab === state.tab);
  });
  document.querySelectorAll('[data-student-live-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.studentLiveView === state.view);
  });
}

async function loadStudentLiveDataFromServer() {
  const result = await getLiveSchedulerData({ role: 'student', source: 'student-lives' });
  const data = result?.data || {};
  return {
    promotions: Array.isArray(data.promotions) ? data.promotions : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    templates: Array.isArray(data.templates) ? data.templates : []
  };
}

async function loadForUser(uid) {
  setStatus('Chargement...');
  state.uid = uid;
  state.profile = await loadProfile(uid);

  try {
    const serverData = await loadStudentLiveDataFromServer();
    state.promotions = serverData.promotions;
    state.sessions = serverData.sessions;
    state.templatesById = new Map(serverData.templates.map((template) => [clean(template.id, 180), template]).filter(([id]) => Boolean(id)));
  } catch (error) {
    console.warn('[SBI Student Lives] Donnees serveur indisponibles, fallback client :', error);
    const promotionIds = getStudentPromotionIds(state.profile || {});
    state.promotions = promotionIds.length ? await loadPromotionsByIds(promotionIds) : [];
    state.sessions = promotionIds.length ? await loadLiveSessionsForPromotions(promotionIds) : [];
    state.templatesById = new Map();
  }

  await loadAttendanceForRows(uid);
  setStatus('');
  render();
}

function bindControls() {
  document.querySelectorAll('[data-student-live-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.studentLiveTab || 'upcoming';
      try { sessionStorage.setItem('sbi:lastStudentLivesTab', state.tab); } catch (_) {}
      render();
    });
  });
  document.querySelectorAll('[data-student-live-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.studentLiveView || 'list';
      render();
    });
  });
}

let mounted = false;
let unsubscribeAuth = null;
let mountedRoot = null;
let bootTimer = null;

export function mountStudentLivesPage() {
  removeLegacyLivesShellOverrides();
  forceRevealStudentLivesPage();
  const root = $('student-live-content');
  if (!root) return null;

  if (mounted && mountedRoot === root) {
    forceRevealStudentLivesPage();
    render();
    return null;
  }

  if (mounted && mountedRoot !== root) {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    mounted = false;
  }

  mounted = true;
  mountedRoot = root;
  state.tab = readInitialTab();
  bindControls();

  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    forceRevealStudentLivesPage();
    if (!user) {
      markStudentLivesAuthReady(false);
      window.location.replace('/login.html');
      return;
    }
    markStudentLivesAuthReady(true);
    loadForUser(user.uid).catch((error) => {
      console.error('[SBI Student Lives] Chargement impossible :', error);
      setStatus(error?.message || 'Chargement impossible.');
      renderLoadError(error?.message || 'Chargement impossible. Rechargez la page.');
    });
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

function bootStudentLivesPage() {
  removeLegacyLivesShellOverrides();
  forceRevealStudentLivesPage();
  const root = document.getElementById('student-live-content');
  if (root && (!mounted || mountedRoot !== root)) {
    mountStudentLivesPage();
  } else if (root && mounted && mountedRoot === root) {
    render();
  }
  if (bootTimer) clearTimeout(bootTimer);
  bootTimer = setTimeout(() => {
    forceRevealStudentLivesPage();
    const currentRoot = document.getElementById('student-live-content');
    if (currentRoot && (!mounted || mountedRoot !== currentRoot)) mountStudentLivesPage();
  }, 700);
}

window.addEventListener('pageshow', () => {
  removeLegacyLivesShellOverrides();
  forceRevealStudentLivesPage();
  if (!mounted || mountedRoot !== $('student-live-content')) bootStudentLivesPage();
});
window.addEventListener('focus', forceRevealStudentLivesPage);
window.addEventListener('error', (event) => {
  forceRevealStudentLivesPage();
  console.error('[SBI Student Lives] Page error:', event?.error || event?.message);
});
window.addEventListener('unhandledrejection', (event) => {
  forceRevealStudentLivesPage();
  console.error('[SBI Student Lives] Promise rejection:', event?.reason);
});

window.SBI_STUDENT_LIVES_REBOOT = bootStudentLivesPage;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootStudentLivesPage, { once: true });
} else {
  bootStudentLivesPage();
}
