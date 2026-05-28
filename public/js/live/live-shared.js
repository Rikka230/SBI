import { collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { db } from '/js/firebase-init.js';

export const MAX_IN_VALUES = 10;
export const SBI_TEST_LIVE_ID = 'sbi-live-test';

export function isTestLiveItem(live = {}) {
  const ids = [live.id, live.itemId, live.sourceItemId, live.liveId, live.type]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return live.isTestLive === true
    || live.testLive === true
    || ids.includes(SBI_TEST_LIVE_ID)
    || ids.includes('live_test');
}

export function buildPromotionTestLive(promotion = {}) {
  return {
    id: SBI_TEST_LIVE_ID,
    itemId: SBI_TEST_LIVE_ID,
    sourceItemId: SBI_TEST_LIVE_ID,
    type: 'live_test',
    title: 'Live test',
    courseTitle: 'Live test',
    status: 'test_available',
    liveSchedulingStatus: 'test_available',
    isTestLive: true,
    testLive: true,
    promotionId: promotion.id || '',
    description: 'Salle de test hors cursus pour verifier la conference avec les eleves.'
  };
}

export function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean)));
}

export function chunk(values = [], size = MAX_IN_VALUES) {
  const items = normalizeList(values);
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function toDateTimeLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function formatDateTime(value = '') {
  if (!value) return 'A confirmer';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'A confirmer';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function formatDateRange(start = '', end = '') {
  const startLabel = formatDateTime(start);
  const endDate = new Date(end);
  if (!end || !Number.isFinite(endDate.getTime())) return startLabel;
  return `${startLabel} - ${new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(endDate)}`;
}

export function getPromotionName(promotion = {}) {
  return clean(promotion.name || promotion.promotionName || promotion.title || promotion.titre || promotion.id || 'Promotion SBI');
}

function buildLiveIdCandidates(live = {}) {
  return [live.id, live.itemId, live.sourceItemId, live.liveId, live.templateItemId]
    .map((value) => clean(value))
    .filter(Boolean);
}

export function findLinkedCoursePlanItem(promotion = {}, live = {}) {
  if (!promotion || typeof promotion !== 'object') return null;
  const coursePlan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan.filter((item) => item && typeof item === 'object') : [];
  if (!coursePlan.length) return null;
  const candidateIds = new Set(buildLiveIdCandidates(live));
  const liveTitle = clean(live.title || live.courseTitle || live.name || live.label || '').toLowerCase();

  const direct = coursePlan.find((item) => {
    const ids = [item.id, item.itemId, item.sourceItemId, item.liveId, item.templateItemId]
      .map((value) => clean(value))
      .filter(Boolean);
    if (ids.some((id) => candidateIds.has(id))) return true;
    const trackingIds = [
      item.liveTracking?.itemId,
      item.liveTracking?.sourceItemId,
      item.liveTracking?.templateItemId
    ].map((value) => clean(value)).filter(Boolean);
    if (trackingIds.some((id) => candidateIds.has(id))) return true;
    return false;
  });
  if (direct) return direct;

  if (!liveTitle) return null;
  return coursePlan.find((item) => {
    const titles = [item.title, item.courseTitle, item.liveTracking?.title]
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean);
    return titles.includes(liveTitle);
  }) || null;
}

export function getLiveTitle(live = {}, promotion = null) {
  if (isTestLiveItem(live)) return clean(live.title || live.courseTitle || 'Live test');
  const linked = promotion ? findLinkedCoursePlanItem(promotion, live) : null;
  return clean(
    linked?.title
    || linked?.courseTitle
    || linked?.liveTracking?.title
    || live.liveTracking?.title
    || live.courseTitle
    || live.title
    || live.name
    || live.label
    || 'Live SBI'
  );
}

export function getLiveWindow(live = {}, promotion = null) {
  const linked = promotion ? findLinkedCoursePlanItem(promotion, live) : null;
  const start = clean(
    live.teacherSchedulingWindowStartAt
    || live.schedulingWindow?.teacherCanSelectFrom
    || live.schedulingWindow?.recommendedStartAt
    || linked?.teacherSchedulingWindowStartAt
    || linked?.liveTracking?.schedulingWindow?.teacherCanSelectFrom
    || linked?.liveTracking?.schedulingWindow?.recommendedStartAt
    || ''
  );
  const end = clean(
    live.teacherSchedulingWindowEndAt
    || live.schedulingWindow?.teacherCanSelectUntil
    || live.schedulingWindow?.recommendedEndAt
    || linked?.teacherSchedulingWindowEndAt
    || linked?.liveTracking?.schedulingWindow?.teacherCanSelectUntil
    || linked?.liveTracking?.schedulingWindow?.recommendedEndAt
    || ''
  );
  return { start, end, linkedItem: linked };
}

export function getLiveWindowLabel(live = {}, promotion = null) {
  if (isTestLiveItem(live)) return 'Libre pour test - hors cursus';
  const { start, end } = getLiveWindow(live, promotion);
  if (!start && !end) return 'Plage non renseignee';
  if (start && end) return `${formatDateTime(start)} -> ${formatDateTime(end)}`;
  return start ? `A partir du ${formatDateTime(start)}` : `Jusqu\'au ${formatDateTime(end)}`;
}

export function makeLiveKey(promotionId = '', live = {}, promotion = null) {
  const linked = promotion ? findLinkedCoursePlanItem(promotion, live) : null;
  return `${clean(promotionId)}::${clean(live.id || live.itemId || live.sourceItemId || linked?.itemId || linked?.id || getLiveTitle(live, promotion))}`;
}

export function sessionKey(session = {}) {
  return makeLiveKey(session.promotionId, {
    id: session.sourceItemId || session.liveId || session.id,
    title: session.title
  });
}

export async function loadProfile(uid = '') {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadPromotionsByIds(ids = []) {
  const rows = [];
  await Promise.all(normalizeList(ids).map(async (id) => {
    const snap = await getDoc(doc(db, 'promotions', id));
    if (snap.exists()) rows.push({ id: snap.id, ...snap.data() });
  }));
  return rows;
}

export async function loadLiveSessionsForPromotions(promotionIds = []) {
  const rows = [];
  for (const part of chunk(promotionIds)) {
    const snap = await getDocs(query(collection(db, 'liveSessions'), where('promotionId', 'in', part)));
    snap.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  }
  return rows;
}

export function buildSessionMap(sessions = []) {
  const map = new Map();
  sessions.forEach((session) => {
    map.set(sessionKey(session), session);
    if (session.id) map.set(session.id, session);
    if (session.liveSessionId) map.set(session.liveSessionId, session);
  });
  return map;
}

export function getPromotionLives(promotion = {}, options = {}) {
  const rows = Array.isArray(promotion.livePlanning)
    ? promotion.livePlanning.filter((item) => item && typeof item === 'object')
    : [];

  if (options.includeTestLive !== true) return rows.filter((item) => !isTestLiveItem(item));

  const testLives = rows.filter(isTestLiveItem);
  const regularLives = rows.filter((item) => !isTestLiveItem(item));
  const testLive = testLives[0]
    ? { ...buildPromotionTestLive(promotion), ...testLives[0], isTestLive: true, testLive: true }
    : buildPromotionTestLive(promotion);

  return [testLive, ...regularLives];
}

export function getLiveSessionForItem(promotion = {}, item = {}, sessionMap = new Map()) {
  return sessionMap.get(makeLiveKey(promotion.id, item, promotion))
    || sessionMap.get(item.liveSessionId || '')
    || null;
}

export function getStudentPromotionIds(profile = {}) {
  return normalizeList([
    profile.promotionId,
    profile.currentPromotionId,
    profile.assignedPromotionId,
    profile.cohortId,
    ...(Array.isArray(profile.promotionIds) ? profile.promotionIds : []),
    ...(Array.isArray(profile.assignedPromotionIds) ? profile.assignedPromotionIds : [])
  ]);
}

export function renderEmpty(message = 'Aucun live a afficher.') {
  return `<div class="sbi-live-empty">${escapeHtml(message)}</div>`;
}
