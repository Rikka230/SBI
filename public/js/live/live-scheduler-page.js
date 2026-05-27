import { auth, db, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import {
  buildSessionMap,
  chunk,
  clean,
  escapeHtml,
  formatDateRange,
  formatDateTime,
  fromDateTimeLocal,
  getLiveSessionForItem,
  getLiveTitle,
  getLiveWindowLabel,
  getPromotionLives,
  getPromotionName,
  loadLiveSessionsForPromotions,
  loadProfile,
  normalizeList,
  renderEmpty,
  toDateTimeLocal
} from '/js/live/live-shared.js?v=8.0P.167.203';

const functionsInstance = getFunctions(app, 'europe-west1');
const scheduleLiveSession = httpsCallable(functionsInstance, 'scheduleLiveSession');
const notifyLiveStarted = httpsCallable(functionsInstance, 'notifyLiveStarted');

const state = {
  role: 'admin',
  uid: '',
  profile: null,
  promotions: [],
  sessions: [],
  selectedPromotionId: '',
  selectedLiveId: ''
};

let mounted = false;
let unsubscribeAuth = null;

function $(id) {
  return document.getElementById(id);
}

function setStatus(message = '', tone = 'muted') {
  const node = $('sbi-live-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

async function safeGetDocsForLive(queryRef, label = 'requete live') {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    console.warn(`[SBI Lives] ${label} ignoree :`, error);
    return null;
  }
}

async function safeGetDocForLive(docRef, label = 'document live') {
  try {
    return await getDoc(docRef);
  } catch (error) {
    console.warn(`[SBI Lives] ${label} inaccessible :`, error);
    return null;
  }
}

function pushUniqueRow(rows, seen, item) {
  if (!item?.id || seen.has(item.id)) return;
  seen.add(item.id);
  rows.push(item);
}

async function loadFormationsByTitles(titles = []) {
  const rows = [];
  const seen = new Set();
  for (const part of chunk(normalizeList(titles))) {
    const snap = await safeGetDocsForLive(query(collection(db, 'formations'), where('titre', 'in', part)), 'formations prof par titres');
    snap?.forEach((item) => pushUniqueRow(rows, seen, { id: item.id, ...item.data() }));
  }
  return rows;
}

async function loadTeacherFormations(uid = '', profile = {}) {
  const formations = [];
  const seen = new Set();

  try {
    const snap = await safeGetDocsForLive(query(collection(db, 'formations'), where('profs', 'array-contains', uid)), 'formations prof via profs');
    snap?.forEach((item) => {
      seen.add(item.id);
      formations.push({ id: item.id, ...item.data() });
    });
  } catch (error) {
    console.warn('[SBI Lives] Formations prof via profs indisponibles :', error);
  }

  for (const id of normalizeList(profile.formationIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const snap = await safeGetDocForLive(doc(db, 'formations', id), `formation ${id}`);
      if (snap.exists()) formations.push({ id: snap.id, ...snap.data() });
    } catch (_) {}
  }

  for (const formation of await loadFormationsByTitles(profile.formationsAcces || [])) {
    if (seen.has(formation.id)) continue;
    seen.add(formation.id);
    formations.push(formation);
  }

  return formations;
}

async function loadPromotionsByIds(ids = []) {
  const rows = [];
  const seen = new Set();
  for (const id of normalizeList(ids)) {
    const snap = await safeGetDocForLive(doc(db, 'promotions', id), `promotion ${id}`);
    if (snap?.exists()) pushUniqueRow(rows, seen, { id: snap.id, ...snap.data() });
  }
  return rows;
}

async function loadPromotionsForRole(uid = '', profile = {}) {
  if (state.role === 'admin') {
    const snap = await safeGetDocsForLive(collection(db, 'promotions'), 'promotions admin');
    const rows = [];
    snap?.forEach((item) => rows.push({ id: item.id, ...item.data() }));
    return rows;
  }

  const formations = await loadTeacherFormations(uid, profile);
  const formationIds = normalizeList([
    ...formations.map((formation) => formation.id),
    ...normalizeList(profile.formationIds)
  ]);
  const formationTitles = normalizeList([
    ...formations.map((formation) => formation.titre || formation.title),
    ...normalizeList(profile.formationsAcces)
  ]);
  const rows = [];
  const seen = new Set();

  for (const promotion of await loadPromotionsByIds([
    profile.promotionId,
    profile.currentPromotionId,
    profile.assignedPromotionId,
    profile.cohortId,
    ...(Array.isArray(profile.promotionIds) ? profile.promotionIds : []),
    ...(Array.isArray(profile.assignedPromotionIds) ? profile.assignedPromotionIds : [])
  ])) {
    pushUniqueRow(rows, seen, promotion);
  }

  for (const part of chunk(formationIds)) {
    const snap = await safeGetDocsForLive(query(collection(db, 'promotions'), where('formationId', 'in', part)), 'promotions par formationId');
    snap?.forEach((item) => pushUniqueRow(rows, seen, { id: item.id, ...item.data() }));
  }

  for (const part of chunk(formationTitles)) {
    const snap = await safeGetDocsForLive(query(collection(db, 'promotions'), where('formationName', 'in', part)), 'promotions par formationName');
    snap?.forEach((item) => pushUniqueRow(rows, seen, { id: item.id, ...item.data() }));
  }

  return rows;
}

function getSelectedPromotion() {
  return state.promotions.find((promotion) => promotion.id === state.selectedPromotionId) || state.promotions[0] || null;
}

function getSelectedLive(promotion = getSelectedPromotion()) {
  const lives = getPromotionLives(promotion || {});
  return lives.find((live) => clean(live.id || live.itemId || live.title) === state.selectedLiveId) || lives[0] || null;
}

function renderPromotionList() {
  const root = $('sbi-live-promotions');
  if (!root) return;
  if (!state.promotions.length) {
    root.innerHTML = renderEmpty(state.role === 'admin' ? 'Aucune promotion trouvee.' : 'Aucune promotion rattachee a vos formations.');
    return;
  }

  root.innerHTML = state.promotions.map((promotion) => {
    const lives = getPromotionLives(promotion);
    const scheduled = lives.filter((live) => live.selectedLiveAt || live.liveSessionId).length;
    const active = promotion.id === state.selectedPromotionId ? ' is-active' : '';
    return `
      <button class="sbi-live-promotion${active}" type="button" data-promotion-id="${escapeHtml(promotion.id)}">
        <strong>${escapeHtml(getPromotionName(promotion))}</strong>
        <span>${lives.length} live(s) prevu(s) - ${scheduled} date(s) validee(s)</span>
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

function renderLiveList(promotion, sessionMap) {
  const root = $('sbi-live-items');
  if (!root) return;
  const lives = getPromotionLives(promotion || {});
  if (!lives.length) {
    root.innerHTML = renderEmpty('Aucun bloc live dans le cursus de cette promotion.');
    return;
  }

  root.innerHTML = lives.map((live) => {
    const id = clean(live.id || live.itemId || getLiveTitle(live));
    const session = getLiveSessionForItem(promotion, live, sessionMap);
    const selected = state.selectedLiveId === id || (!state.selectedLiveId && live === lives[0]);
    const date = session?.selectedStartAt || live.selectedLiveAt || '';
    return `
      <button class="sbi-live-item${selected ? ' is-active' : ''}" type="button" data-live-id="${escapeHtml(id)}">
        <strong>${escapeHtml(getLiveTitle(live))}</strong>
        <span>${date ? formatDateRange(date, session?.selectedEndAt || live.selectedLiveEndAt) : getLiveWindowLabel(live)}</span>
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

function renderCalendar(promotion, sessionMap) {
  const root = $('sbi-live-calendar');
  if (!root) return;
  const lives = getPromotionLives(promotion || {});
  if (!lives.length) {
    root.innerHTML = renderEmpty('Aucun live a placer.');
    return;
  }

  root.innerHTML = lives.map((live) => {
    const session = getLiveSessionForItem(promotion, live, sessionMap);
    const date = session?.selectedStartAt || live.selectedLiveAt || live.teacherSchedulingWindowStartAt || '';
    return `
      <div class="sbi-live-day">
        <strong>${escapeHtml(date ? formatDateTime(date) : 'A planifier')}</strong>
        <span>${escapeHtml(getLiveTitle(live))}</span>
      </div>
    `;
  }).join('');
}

function renderDetail(promotion, live, sessionMap) {
  const root = $('sbi-live-detail');
  if (!root) return;
  if (!promotion || !live) {
    root.innerHTML = renderEmpty('Selectionnez une promotion et un bloc live.');
    return;
  }

  const session = getLiveSessionForItem(promotion, live, sessionMap);
  const start = session?.selectedStartAt || live.selectedLiveAt || '';
  const end = session?.selectedEndAt || live.selectedLiveEndAt || '';
  const canStart = Boolean(session?.id || live.liveSessionId);

  root.innerHTML = `
    <div class="sbi-live-panel__head">
      <strong>${escapeHtml(getLiveTitle(live))}</strong>
      <span>${escapeHtml(getPromotionName(promotion))}</span>
    </div>
    <form class="sbi-live-form" id="sbi-live-form">
      <label>Titre affiche
        <input id="sbi-live-title" value="${escapeHtml(session?.title || getLiveTitle(live))}">
      </label>
      <label>Debut valide
        <input id="sbi-live-start" type="datetime-local" value="${escapeHtml(toDateTimeLocal(start))}">
      </label>
      <label>Fin validee
        <input id="sbi-live-end" type="datetime-local" value="${escapeHtml(toDateTimeLocal(end))}">
      </label>
      <label>Lien salle externe provisoire
        <input id="sbi-live-meeting-url" value="${escapeHtml(session?.meetingUrl || '')}" placeholder="https://...">
      </label>
      <div class="sbi-live-room-note">
        Provider live: ${escapeHtml(session?.provider || 'a connecter')}. Watermark nominatif, chat et fichiers sont prevus dans la structure de session.
      </div>
      <div class="sbi-live-actions">
        <button class="sbi-live-btn" type="submit">Valider la date</button>
        <button class="sbi-live-btn sbi-live-btn--ghost" type="button" id="sbi-live-started" ${canStart ? '' : 'disabled'}>Notifier le demarrage</button>
      </div>
    </form>
  `;

  $('sbi-live-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitSchedule(promotion, live, session);
  });
  $('sbi-live-started')?.addEventListener('click', async () => {
    const liveId = session?.id || live.liveSessionId || '';
    if (!liveId) return;
    await submitStarted(liveId);
  });
}

async function submitSchedule(promotion, live, session) {
  const button = $('sbi-live-form')?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus('Programmation du live...', 'muted');

  try {
    const result = await scheduleLiveSession({
      promotionId: promotion.id,
      liveId: session?.id || live.liveSessionId || live.id || live.itemId || '',
      sourceItemId: live.id || live.itemId || '',
      title: $('sbi-live-title')?.value || getLiveTitle(live),
      selectedStartAt: fromDateTimeLocal($('sbi-live-start')?.value || ''),
      selectedEndAt: fromDateTimeLocal($('sbi-live-end')?.value || ''),
      meetingUrl: $('sbi-live-meeting-url')?.value || ''
    });
    setStatus(result?.data?.message || 'Live programme.', 'success');
    await refreshData();
  } catch (error) {
    console.error('[SBI Lives] Programmation impossible :', error);
    setStatus(error?.message || 'Programmation impossible.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitStarted(liveId) {
  setStatus('Envoi de la notification de demarrage...', 'muted');
  try {
    const result = await notifyLiveStarted({ liveId });
    setStatus(result?.data?.message || 'Notification envoyee.', 'success');
  } catch (error) {
    console.error('[SBI Lives] Notification demarrage impossible :', error);
    setStatus(error?.message || 'Notification impossible.', 'error');
  }
}

function renderAll() {
  const promotion = getSelectedPromotion();
  if (promotion && !state.selectedPromotionId) state.selectedPromotionId = promotion.id;
  const sessionMap = buildSessionMap(state.sessions);
  const live = getSelectedLive(promotion);
  if (live && !state.selectedLiveId) state.selectedLiveId = clean(live.id || live.itemId || getLiveTitle(live));

  renderPromotionList();
  renderLiveList(promotion, sessionMap);
  renderCalendar(promotion, sessionMap);
  renderDetail(promotion, live, sessionMap);
}

async function refreshData() {
  setStatus('Chargement des lives...', 'muted');
  state.promotions = await loadPromotionsForRole(state.uid, state.profile);
  state.promotions.sort((a, b) => getPromotionName(a).localeCompare(getPromotionName(b), 'fr'));
  const promotionIds = state.promotions.map((promotion) => promotion.id);
  state.sessions = promotionIds.length ? await loadLiveSessionsForPromotions(promotionIds) : [];
  renderAll();
  setStatus('', 'muted');
}

export function mountLiveSchedulerPage(role = 'admin') {
  if (mounted) return null;
  mounted = true;
  state.role = role === 'teacher' ? 'teacher' : 'admin';

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    state.uid = user.uid;
    state.profile = await loadProfile(user.uid);
    if (!state.profile) {
      setStatus('Profil introuvable.', 'error');
      return;
    }

    await refreshData();
  });

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

if (document.querySelector('[data-sbi-live-scheduler]') && !window.SBI_APP_SHELL_CURRENT_URL) {
  mountLiveSchedulerPage(document.body.dataset.liveRole || 'admin');
}
