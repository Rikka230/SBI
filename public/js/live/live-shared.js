import { collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { db } from '/js/firebase-init.js';

export const MAX_IN_VALUES = 10;

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

export function getLiveTitle(live = {}) {
  return clean(live.title || live.courseTitle || live.name || live.label || 'Live SBI');
}

export function getLiveWindowLabel(live = {}) {
  const start = live.teacherSchedulingWindowStartAt || live.schedulingWindow?.teacherCanSelectFrom || live.schedulingWindow?.recommendedStartAt || '';
  const end = live.teacherSchedulingWindowEndAt || live.schedulingWindow?.teacherCanSelectUntil || live.schedulingWindow?.recommendedEndAt || '';
  if (!start && !end) return 'Plage non renseignee';
  if (start && end) return `${formatDateTime(start)} -> ${formatDateTime(end)}`;
  return start ? `A partir du ${formatDateTime(start)}` : `Jusqu'au ${formatDateTime(end)}`;
}

export function makeLiveKey(promotionId = '', live = {}) {
  return `${clean(promotionId)}::${clean(live.id || live.itemId || live.sourceItemId || getLiveTitle(live))}`;
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

export function getPromotionLives(promotion = {}) {
  return Array.isArray(promotion.livePlanning)
    ? promotion.livePlanning.filter((item) => item && typeof item === 'object')
    : [];
}

export function getLiveSessionForItem(promotion = {}, item = {}, sessionMap = new Map()) {
  return sessionMap.get(makeLiveKey(promotion.id, item))
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
