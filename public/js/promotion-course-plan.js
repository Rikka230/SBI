/**
 * SBI 8.0P.167.125
 * Helpers partagés pour afficher les dates issues de promotions.coursePlan.
 *
 * Ce module est volontairement léger :
 * - il ne modifie pas les documents Firestore ;
 * - il tolère les droits Firestore incomplets ;
 * - il garde les anciens affichages si aucune promotion exploitable n'est trouvée.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const MAX_IN_QUERY = 10;

export function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
}

export function clean(value = '', max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function escapeHTML(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function chunkArray(items, size = MAX_IN_QUERY) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isExpectedAccessError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied')
    || code.includes('failed-precondition')
    || message.includes('missing or insufficient permissions')
    || message.includes('permission')
    || message.includes('index');
}

async function safeGetDoc(docRef, label = 'document') {
  try {
    return await getDoc(docRef);
  } catch (error) {
    if (isExpectedAccessError(error)) {
      if (isDebugEnabled()) console.debug(`[SBI CoursePlan] ${label} inaccessible :`, error);
      return null;
    }
    console.warn(`[SBI CoursePlan] ${label} inaccessible :`, error);
    return null;
  }
}

async function safeGetDocs(queryRef, label = 'requête') {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    if (isExpectedAccessError(error)) {
      if (isDebugEnabled()) console.debug(`[SBI CoursePlan] ${label} ignorée :`, error);
      return null;
    }
    console.warn(`[SBI CoursePlan] ${label} ignorée :`, error);
    return null;
  }
}

function isDebugEnabled() {
  try {
    return window.localStorage?.getItem('sbiDebugAccess') === 'true';
  } catch {
    return false;
  }
}

function snapToArray(snapshot) {
  const rows = [];
  snapshot?.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  return rows;
}

export function toDateMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export function formatDateFr(value, fallback = '') {
  const ms = toDateMs(value);
  if (!ms) return fallback;

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(ms));
  } catch {
    return fallback;
  }
}

export function formatShortDateFr(value, fallback = '') {
  const ms = toDateMs(value);
  if (!ms) return fallback;

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit'
    }).format(new Date(ms));
  } catch {
    return fallback;
  }
}

export function getPromotionIdsFromUser(userData = {}) {
  return normalizeList([
    userData.promotionId,
    userData.currentPromotionId,
    userData.activePromotionId,
    userData.assignedPromotionId,
    ...(Array.isArray(userData.promotionIds) ? userData.promotionIds : []),
    ...(Array.isArray(userData.promotionsIds) ? userData.promotionsIds : []),
    ...(Array.isArray(userData.assignedPromotionIds) ? userData.assignedPromotionIds : [])
  ]);
}

export function getFormationIdsFromUser(userData = {}) {
  return normalizeList([
    userData.formationId,
    userData.currentFormationId,
    ...(Array.isArray(userData.formationIds) ? userData.formationIds : [])
  ]);
}

export async function loadUserProfile(db, uid) {
  if (!db || !uid) return null;
  const snap = await safeGetDoc(doc(db, 'users', uid), `profil ${uid}`);
  return snap?.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
}

export async function loadPromotionsByIds(db, promotionIds = []) {
  const ids = normalizeList(promotionIds);
  if (!db || !ids.length) return [];

  const rows = [];
  await Promise.all(ids.map(async (promotionId) => {
    const snap = await safeGetDoc(doc(db, 'promotions', promotionId), `promotion ${promotionId}`);
    if (snap?.exists()) rows.push({ id: snap.id, ...(snap.data() || {}) });
  }));

  return rows;
}

export async function loadPromotionsByFormationIds(db, formationIds = []) {
  const ids = normalizeList(formationIds);
  if (!db || !ids.length) return [];

  const rows = [];
  for (const chunk of chunkArray(ids)) {
    const snap = await safeGetDocs(
      query(collection(db, 'promotions'), where('formationId', 'in', chunk)),
      'promotions par formationId'
    );
    rows.push(...snapToArray(snap));
  }

  return uniquePromotions(rows);
}

export function uniquePromotions(promotions = []) {
  const map = new Map();
  promotions.forEach((promotion) => {
    if (promotion?.id) map.set(promotion.id, promotion);
  });
  return Array.from(map.values());
}

export function isActivePromotion(promotion = {}) {
  return String(promotion.status || 'active').toLowerCase() !== 'archived';
}

export function normalizePlanItems(coursePlan = []) {
  if (!Array.isArray(coursePlan)) return [];

  return coursePlan
    .map((item, index) => {
      const type = item?.type || item?.itemType || (item?.courseId ? 'real_course' : '');
      return {
        ...item,
        type,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
        courseId: clean(item?.courseId || '', 180),
        courseTitle: clean(item?.courseTitle || item?.title || '', 180),
        title: clean(item?.title || item?.courseTitle || '', 180),
        recommendedStartAt: item?.recommendedStartAt || item?.plannedStartAt || item?.startAt || '',
        recommendedEndAt: item?.recommendedEndAt || item?.plannedEndAt || item?.endAt || '',
        deadlineAt: item?.deadlineAt || item?.dueAt || item?.recommendedEndAt || '',
        dueAt: item?.dueAt || item?.deadlineAt || item?.recommendedEndAt || ''
      };
    })
    .filter((item) => item.courseId && ['real_course', 'course'].includes(item.type))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

export function getCoursePlanDateRangeLabel(item = {}) {
  const start = item.recommendedStartAt || item.plannedStartAt || item.startAt || '';
  const end = item.recommendedEndAt || item.plannedEndAt || item.endAt || '';
  if (!start && !end) return '';

  if (start && end && start !== end) {
    return `Prévu du ${formatShortDateFr(start, '?')} au ${formatDateFr(end, '?')}`;
  }

  return `Prévu le ${formatDateFr(start || end, '?')}`;
}

export function getDeadlineLabel(item = {}) {
  const deadline = item.deadlineAt || item.dueAt || '';
  if (!deadline) return '';
  return `Échéance ${formatDateFr(deadline, '?')}`;
}

export function getPriorityLabel(priority = 'normal') {
  if (priority === 'urgent') return 'Urgent';
  if (priority === 'high') return 'Priorité haute';
  return '';
}

function getPromotionDateScore(promotion = {}, item = {}) {
  const now = Date.now();
  const start = toDateMs(item.recommendedStartAt) || toDateMs(promotion.startDate);
  const end = toDateMs(item.recommendedEndAt) || toDateMs(promotion.endDate) || start;

  if (start && end && now >= start && now <= end) return 0;
  if (start && start > now) return 1 + Math.min(999999999, start - now) / 1000000000000;
  if (end && end < now) return 3 + Math.min(999999999, now - end) / 1000000000000;
  return 2;
}

export function buildCoursePlanIndex(promotions = []) {
  const index = new Map();

  uniquePromotions(promotions)
    .filter(isActivePromotion)
    .forEach((promotion) => {
      const planItems = normalizePlanItems(promotion.coursePlan || []);

      planItems.forEach((item) => {
        const entry = {
          promotion,
          promotionId: promotion.id,
          promotionName: promotion.name || promotion.promotionName || 'Promotion',
          curriculumTitle: promotion.curriculumTitle || '',
          item,
          score: getPromotionDateScore(promotion, item),
          order: Number(item.order || 0),
          startMs: toDateMs(item.recommendedStartAt),
          endMs: toDateMs(item.recommendedEndAt)
        };

        const existing = index.get(item.courseId);
        if (!existing || compareCoursePlanEntries(entry, existing) < 0) {
          index.set(item.courseId, entry);
        }
      });
    });

  return index;
}

export function compareCoursePlanEntries(a, b) {
  const scoreA = Number(a?.score ?? 999);
  const scoreB = Number(b?.score ?? 999);
  if (scoreA !== scoreB) return scoreA - scoreB;

  const startA = Number(a?.startMs || 0);
  const startB = Number(b?.startMs || 0);
  if (startA && startB && startA !== startB) return startA - startB;
  if (startA && !startB) return -1;
  if (!startA && startB) return 1;

  return Number(a?.order || 0) - Number(b?.order || 0);
}

export function getCoursePlanSortValue(entry) {
  if (!entry) return Number.MAX_SAFE_INTEGER;
  const start = Number(entry.startMs || 0);
  if (start) return start;
  return 10_000_000_000_000 + Number(entry.order || 0);
}

export function getCoursePlanBadgeHTML(entry, { includePromotion = true } = {}) {
  if (!entry?.item) return '';

  const range = getCoursePlanDateRangeLabel(entry.item);
  const deadline = getDeadlineLabel(entry.item);
  const priority = getPriorityLabel(entry.item.priorityLevel);
  const bits = [
    range,
    deadline && deadline !== range ? deadline : '',
    priority,
    includePromotion ? entry.promotionName : ''
  ].filter(Boolean);

  if (!bits.length) return '';

  return `
    <span class="sbi-course-plan-date-pill">
      ${bits.map(escapeHTML).join(' · ')}
    </span>
  `;
}

export async function loadStudentCoursePlanContext({ db, uid, userData = null } = {}) {
  const profile = userData || await loadUserProfile(db, uid) || {};
  const directPromotionIds = getPromotionIdsFromUser(profile);
  const formationIds = getFormationIdsFromUser(profile);

  const directPromotions = await loadPromotionsByIds(db, directPromotionIds);
  const fallbackPromotions = directPromotions.length
    ? []
    : await loadPromotionsByFormationIds(db, formationIds);

  const promotions = uniquePromotions([...directPromotions, ...fallbackPromotions]).filter(isActivePromotion);

  return {
    profile,
    promotions,
    coursePlanIndex: buildCoursePlanIndex(promotions)
  };
}

export async function loadTeacherCoursePlanContext({ db, uid, userData = null } = {}) {
  const profile = userData || await loadUserProfile(db, uid) || {};
  const formationIds = getFormationIdsFromUser(profile);
  const promotions = (await loadPromotionsByFormationIds(db, formationIds)).filter(isActivePromotion);

  return {
    profile,
    promotions,
    coursePlanIndex: buildCoursePlanIndex(promotions)
  };
}
