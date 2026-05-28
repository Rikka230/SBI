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
  getLiveWindow,
  getLiveWindowLabel,
  getPromotionLives,
  getPromotionName,
  isTestLiveItem,
  loadLiveSessionsForPromotions,
  loadProfile,
  normalizeList,
  renderEmpty,
  toDateTimeLocal
} from '/js/live/live-shared.js?v=8.0P.167.231';

const functionsInstance = getFunctions(app, 'europe-west1');
const getLiveSchedulerData = httpsCallable(functionsInstance, 'getLiveSchedulerData');
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

function setHeroCopy() {
  const hero = document.querySelector('.sbi-live-hero');
  if (!hero) return;
  const heroCopy = hero.querySelector('div') || hero;
  const kicker = hero.querySelector('.sbi-live-kicker');
  const title = hero.querySelector('h1');
  let subtitle = hero.querySelector('p');
  if (!subtitle) {
    subtitle = document.createElement('p');
    heroCopy.appendChild(subtitle);
  }
  if (kicker) kicker.textContent = state.role === 'teacher' ? 'Professeur' : 'Administration';
  if (title) title.textContent = 'Gestion des lives';
  subtitle.textContent = 'Planifiez et gérez les sessions live de vos promotions et cursus.';
}

function ensureSummaryNode() {
  const wrapper = document.querySelector('[data-sbi-live-scheduler]');
  const hero = document.querySelector('.sbi-live-hero');
  if (!wrapper || !hero) return null;
  let summary = $('sbi-live-summary');
  if (!summary) {
    summary = document.createElement('section');
    summary.id = 'sbi-live-summary';
    summary.className = 'sbi-live-summary';
    hero.insertAdjacentElement('afterend', summary);
  }
  return summary;
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

async function loadSchedulerDataFromServer() {
  try {
    const result = await getLiveSchedulerData({ role: state.role });
    const data = result?.data || {};
    return {
      promotions: Array.isArray(data.promotions) ? data.promotions : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : []
    };
  } catch (error) {
    console.warn('[SBI Lives] Donnees live serveur indisponibles, fallback client :', error);
    return null;
  }
}

function getSelectedPromotion() {
  return state.promotions.find((promotion) => promotion.id === state.selectedPromotionId) || state.promotions[0] || null;
}

function getLiveId(live = {}, promotion = null) {
  return clean(live.id || live.itemId || live.sourceItemId || getLiveTitle(live, promotion));
}

function getPromotionLiveRows(promotion, sessionMap = new Map()) {
  const lives = getPromotionLives(promotion || {});
  return lives.map((live, index) => {
    const session = getLiveSessionForItem(promotion, live, sessionMap);
    const { start: windowStart, end: windowEnd } = getLiveWindow(live, promotion);
    const startAt = session?.selectedStartAt || live.selectedLiveAt || '';
    const endAt = session?.selectedEndAt || live.selectedLiveEndAt || '';
    const title = getLiveTitle(live, promotion);
    const liveId = getLiveId(live, promotion);
    const report = Boolean(session?.report || live.reportOutsideWindow || live.liveSchedulingStatus === 'report' || live.teacherSelectionStatus === 'reported');
    const outsideWindow = Boolean(startAt && ((windowStart && Date.parse(startAt) < Date.parse(windowStart)) || (windowEnd && Date.parse(startAt) > Date.parse(windowEnd))));
    const isScheduled = Boolean(startAt || live.liveSessionId || session?.id);
    const scheduleState = report || outsideWindow ? 'report' : (isScheduled ? 'scheduled' : 'to_plan');
    return {
      id: liveId,
      live,
      session,
      index,
      title,
      startAt,
      endAt,
      windowStart,
      windowEnd,
      windowLabel: getLiveWindowLabel(live, promotion),
      scheduleState,
      order: Number.isFinite(Number(live.order)) ? Number(live.order) : index
    };
  }).sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title, 'fr'));
}

function getSelectedLiveRow(promotion = getSelectedPromotion()) {
  const sessionMap = buildSessionMap(state.sessions);
  const rows = getPromotionLiveRows(promotion, sessionMap);
  return rows.find((row) => row.id === state.selectedLiveId) || rows[0] || null;
}

function getPromotionStats(promotion, sessionMap = new Map()) {
  const rows = getPromotionLiveRows(promotion, sessionMap);
  const total = rows.length;
  const scheduled = rows.filter((row) => row.scheduleState === 'scheduled').length;
  const reports = rows.filter((row) => row.scheduleState === 'report').length;
  const toPlan = rows.filter((row) => row.scheduleState === 'to_plan').length;
  return { total, scheduled, reports, toPlan };
}

function getSelectedFormationLabel(promotion = {}) {
  return clean(promotion.curriculumTitle || promotion.formationName || promotion.formationTitle || 'Cursus SBI');
}

function getStatusBadgeHtml(stateKey = 'to_plan') {
  const labels = {
    scheduled: 'Programmé',
    report: 'Report',
    to_plan: 'À planifier'
  };
  return `<span class="sbi-live-chip is-${escapeHtml(stateKey)}">${escapeHtml(labels[stateKey] || 'À planifier')}</span>`;
}

function renderSummary(sessionMap) {
  const root = ensureSummaryNode();
  if (!root) return;
  const promotion = getSelectedPromotion();
  if (!promotion) {
    root.innerHTML = '';
    return;
  }
  const stats = getPromotionStats(promotion, sessionMap);
  root.innerHTML = `
    <article class="sbi-live-summary-card is-promo">
      <span class="sbi-live-summary-card__label">Promotion sélectionnée</span>
      <strong>${escapeHtml(getPromotionName(promotion))}</strong>
      <span>${escapeHtml(getSelectedFormationLabel(promotion))}</span>
    </article>
    <article class="sbi-live-summary-card">
      <span class="sbi-live-summary-card__label">Formation / Cursus</span>
      <strong>${escapeHtml(getSelectedFormationLabel(promotion))}</strong>
      <span>${stats.total} live(s) cursus</span>
    </article>
    <article class="sbi-live-summary-card is-metric">
      <span class="sbi-live-summary-card__label">Lives à planifier</span>
      <strong>${stats.toPlan}</strong>
      <span>Sur ${stats.total} lives</span>
    </article>
    <article class="sbi-live-summary-card is-metric">
      <span class="sbi-live-summary-card__label">Lives programmés</span>
      <strong>${stats.scheduled}</strong>
      <span>Sur ${stats.total} lives</span>
    </article>
    <article class="sbi-live-summary-card is-metric">
      <span class="sbi-live-summary-card__label">Reports</span>
      <strong>${stats.reports}</strong>
      <span>Hors période prévue</span>
    </article>
  `;
}

function renderPromotionList(sessionMap) {
  const root = $('sbi-live-promotions');
  if (!root) return;
  if (!state.promotions.length) {
    root.innerHTML = renderEmpty(state.role === 'admin' ? 'Aucune promotion trouvée.' : 'Aucune promotion rattachée à vos formations.');
    return;
  }

  root.innerHTML = `${state.promotions.map((promotion) => {
    const stats = getPromotionStats(promotion, sessionMap);
    const active = promotion.id === state.selectedPromotionId ? ' is-active' : '';
    return `
      <button class="sbi-live-promotion${active}" type="button" data-promotion-id="${escapeHtml(promotion.id)}">
        <strong>${escapeHtml(getPromotionName(promotion))}</strong>
        <span class="sbi-live-promotion__sub">${escapeHtml(getSelectedFormationLabel(promotion))}</span>
        <div class="sbi-live-promotion__meta">
          <span>${stats.total} lives cursus</span>
          <span>${stats.toPlan} à planifier</span>
          <span>${stats.scheduled} programmés</span>
        </div>
      </button>
    `;
  }).join('')}
  <div class="sbi-live-list-footer">Liste des promotions accessibles</div>`;

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
  const rows = getPromotionLiveRows(promotion || {}, sessionMap);
  if (!rows.length) {
    root.innerHTML = renderEmpty('Aucun bloc live dans le cursus de cette promotion.');
    return;
  }

  root.innerHTML = rows.map((row, idx) => {
    const selected = state.selectedLiveId === row.id || (!state.selectedLiveId && idx === 0);
    return `
      <button class="sbi-live-item${selected ? ' is-active' : ''}" type="button" data-live-id="${escapeHtml(row.id)}">
        <div class="sbi-live-item__top">
          <strong>${escapeHtml(`${row.order + 1}. ${row.title}`)}</strong>
          ${getStatusBadgeHtml(row.scheduleState)}
        </div>
        <span>Période prévue : ${escapeHtml(row.windowLabel)}</span>
        <span>${row.startAt ? `Date prévue : ${escapeHtml(formatDateRange(row.startAt, row.endAt))}` : 'Date prévue : non planifiée'}</span>
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
  const rows = getPromotionLiveRows(promotion || {}, sessionMap);
  if (!rows.length) {
    root.innerHTML = renderEmpty('Aucun live à placer.');
    return;
  }

  root.innerHTML = rows.map((row) => `
    <div class="sbi-live-day is-${escapeHtml(row.scheduleState)}">
      <strong>${escapeHtml(row.startAt ? formatDateTime(row.startAt) : 'À planifier')}</strong>
      <span>${escapeHtml(row.title)}</span>
      <small>${escapeHtml(row.windowLabel)}</small>
    </div>
  `).join('');
}

function getDetailScheduleMode(row = {}) {
  if (!row) return 'to_plan';
  return row.scheduleState === 'report' ? 'report' : 'scheduled';
}

function getDurationMinutes(startAt = '', endAt = '') {
  const startMs = Date.parse(startAt || '');
  const endMs = Date.parse(endAt || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 60;
  return Math.max(15, Math.round((endMs - startMs) / 60000));
}

function addMinutesIso(baseIso = '', minutes = 60) {
  const baseMs = Date.parse(baseIso || '');
  if (!Number.isFinite(baseMs)) return '';
  return new Date(baseMs + minutes * 60000).toISOString();
}

function renderDetail(promotion, row, sessionMap) {
  const root = $('sbi-live-detail');
  if (!root) return;
  if (!promotion || !row) {
    root.innerHTML = renderEmpty('Sélectionnez une promotion et un bloc live.');
    return;
  }

  const session = row.session || getLiveSessionForItem(promotion, row.live, sessionMap);
  const canOpen = Boolean(session?.id || row.live.liveSessionId);
  const duration = getDurationMinutes(row.startAt || row.windowStart, row.endAt || row.windowEnd);
  const selectedStartLocal = toDateTimeLocal(row.startAt || row.windowStart || '');
  const selectedMode = getDetailScheduleMode(row);

  root.innerHTML = `
    <div class="sbi-live-panel__head sbi-live-panel__head--detail">
      <div>
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(getPromotionName(promotion))}</span>
      </div>
      ${getStatusBadgeHtml(row.scheduleState)}
    </div>
    <form class="sbi-live-form" id="sbi-live-form">
      <section class="sbi-live-info-block">
        <h3>Informations cursus (non modifiables)</h3>
        <div class="sbi-live-info-grid">
          <span>Promotion</span><strong>${escapeHtml(getPromotionName(promotion))}</strong>
          <span>Formation / Cursus</span><strong>${escapeHtml(getSelectedFormationLabel(promotion))}</strong>
          <span>Période prévue dans le cursus</span><strong>${escapeHtml(row.windowStart || row.windowEnd ? `Du ${formatDateTime(row.windowStart)} au ${formatDateTime(row.windowEnd)}` : 'Non renseignée')}</strong>
        </div>
      </section>

      <section class="sbi-live-info-block">
        <h3>Planification</h3>
        <div class="sbi-live-form-row">
          <label>Date prévue du live
            <input id="sbi-live-start" type="datetime-local" value="${escapeHtml(selectedStartLocal)}">
          </label>
          <label>Durée prévue
            <select id="sbi-live-duration">
              ${[30, 45, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${duration === minutes ? 'selected' : ''}>${minutes} min</option>`).join('')}
            </select>
          </label>
        </div>
        <label>Statut de planification</label>
        <div class="sbi-live-mode-toggle" id="sbi-live-mode-toggle">
          <button type="button" class="sbi-live-mode-btn${selectedMode === 'scheduled' ? ' is-active' : ''}" data-mode="scheduled">Dans la période prévue</button>
          <button type="button" class="sbi-live-mode-btn${selectedMode === 'report' ? ' is-active' : ''}" data-mode="report">Report hors période</button>
        </div>
        <div class="sbi-live-room-note" id="sbi-live-mode-note">${selectedMode === 'report' ? 'Le live sera enregistré comme report hors période prévue.' : 'La date prévue doit rester dans la période autorisée du cursus.'}</div>
        <label>Lien de salle externe (optionnel)
          <input id="sbi-live-meeting-url" value="${escapeHtml(session?.meetingUrl || '')}" placeholder="https://...">
        </label>
      </section>

      <div class="sbi-live-actions">
        <button class="sbi-live-btn sbi-live-btn--primary" type="submit">Enregistrer la planification</button>
        <button class="sbi-live-btn sbi-live-btn--ghost" type="button" id="sbi-live-open-room" ${canOpen ? '' : 'disabled'}>Ouvrir la salle</button>
        <button class="sbi-live-btn sbi-live-btn--ghost" type="button" id="sbi-live-started" ${canOpen ? '' : 'disabled'}>Notifier le démarrage</button>
      </div>

      <div class="sbi-live-test-box">
        <strong>Ouvrir une salle test</strong>
        <span>Salle test accessible uniquement à vous pour cette promotion.</span>
        <button class="sbi-live-btn sbi-live-btn--ghost" type="button" id="sbi-live-open-test">Préparer la salle test</button>
      </div>
    </form>
  `;

  $('sbi-live-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitSchedule(promotion, row, session);
  });

  $('sbi-live-mode-toggle')?.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      $('sbi-live-mode-toggle')?.querySelectorAll('[data-mode]').forEach((node) => node.classList.toggle('is-active', node === button));
      const note = $('sbi-live-mode-note');
      if (note) note.textContent = button.dataset.mode === 'report'
        ? 'Le live sera enregistré comme report hors période prévue.'
        : 'La date prévue doit rester dans la période autorisée du cursus.';
    });
  });

  $('sbi-live-open-room')?.addEventListener('click', () => {
    const liveId = session?.id || row.live.liveSessionId || '';
    if (!liveId) return;
    window.open(`/live-room.html?liveId=${encodeURIComponent(liveId)}&start=1`, '_blank', 'noopener,noreferrer');
  });

  $('sbi-live-started')?.addEventListener('click', async () => {
    const liveId = session?.id || row.live.liveSessionId || '';
    if (!liveId) return;
    await submitStarted(liveId);
  });

  $('sbi-live-open-test')?.addEventListener('click', async () => {
    await openOrCreateTestRoom(promotion);
  });
}

async function submitSchedule(promotion, row, session) {
  const button = $('sbi-live-form')?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus('Programmation du live...', 'muted');

  try {
    const startIso = fromDateTimeLocal($('sbi-live-start')?.value || '');
    const durationMinutes = Number($('sbi-live-duration')?.value || 60) || 60;
    const selectedMode = $('sbi-live-mode-toggle')?.querySelector('.is-active')?.dataset?.mode || 'scheduled';
    const endIso = addMinutesIso(startIso, durationMinutes);
    const result = await scheduleLiveSession({
      promotionId: promotion.id,
      liveId: session?.id || row.live.liveSessionId || row.live.id || row.live.itemId || '',
      sourceItemId: row.live.sourceItemId || row.live.id || row.live.itemId || '',
      type: row.live.type || 'live_session',
      provider: 'daily',
      selectedStartAt: startIso,
      selectedEndAt: endIso,
      meetingUrl: $('sbi-live-meeting-url')?.value || '',
      report: selectedMode === 'report'
    });
    setStatus(result?.data?.message || 'Live programmé.', 'success');
    await refreshData();
  } catch (error) {
    console.error('[SBI Lives] Programmation impossible :', error);
    setStatus(error?.message || 'Programmation impossible.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function openOrCreateTestRoom(promotion) {
  if (!promotion?.id) return;
  setStatus('Préparation de la salle test...', 'muted');
  try {
    const sessionMap = buildSessionMap(state.sessions);
    const testLive = getPromotionLives(promotion, { includeTestLive: true }).find((item) => isTestLiveItem(item));
    const testSession = testLive ? getLiveSessionForItem(promotion, testLive, sessionMap) : null;
    let liveId = testSession?.id || testLive?.liveSessionId || '';

    if (!liveId) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5, 0, 0);
      const startIso = now.toISOString();
      const endIso = addMinutesIso(startIso, 60);
      const result = await scheduleLiveSession({
        promotionId: promotion.id,
        liveId: 'sbi-live-test',
        sourceItemId: 'sbi-live-test',
        type: 'live_test',
        provider: 'daily',
        title: 'Live test',
        selectedStartAt: startIso,
        selectedEndAt: endIso,
        report: false
      });
      liveId = result?.data?.liveId || '';
      await refreshData();
    }

    if (liveId) {
      window.open(`/live-room.html?liveId=${encodeURIComponent(liveId)}&start=1`, '_blank', 'noopener,noreferrer');
      setStatus('Salle test prête.', 'success');
    }
  } catch (error) {
    console.error('[SBI Lives] Salle test impossible :', error);
    setStatus(error?.message || 'Préparation de la salle test impossible.', 'error');
  }
}

async function submitStarted(liveId) {
  setStatus('Envoi de la notification de démarrage...', 'muted');
  try {
    const result = await notifyLiveStarted({ liveId });
    setStatus(result?.data?.message || 'Notification envoyée.', 'success');
  } catch (error) {
    console.error('[SBI Lives] Notification démarrage impossible :', error);
    setStatus(error?.message || 'Notification impossible.', 'error');
  }
}

function renderAll() {
  setHeroCopy();
  const promotion = getSelectedPromotion();
  if (promotion && !state.selectedPromotionId) state.selectedPromotionId = promotion.id;
  const sessionMap = buildSessionMap(state.sessions);
  const row = getSelectedLiveRow(promotion);
  if (row && !state.selectedLiveId) state.selectedLiveId = row.id;

  renderSummary(sessionMap);
  renderPromotionList(sessionMap);
  renderLiveList(promotion, sessionMap);
  renderCalendar(promotion, sessionMap);
  renderDetail(promotion, row, sessionMap);
}

async function refreshData() {
  setStatus('Chargement des lives...', 'muted');
  try {
    const serverData = await loadSchedulerDataFromServer();
    if (serverData) {
      state.promotions = serverData.promotions;
      state.sessions = serverData.sessions;
    } else {
      state.promotions = await loadPromotionsForRole(state.uid, state.profile);
      state.promotions.sort((a, b) => getPromotionName(a).localeCompare(getPromotionName(b), 'fr'));
      const promotionIds = state.promotions.map((promotion) => promotion.id);
      state.sessions = promotionIds.length ? await loadLiveSessionsForPromotions(promotionIds) : [];
    }

    state.promotions.sort((a, b) => getPromotionName(a).localeCompare(getPromotionName(b), 'fr'));
    renderAll();
    setStatus('', 'muted');
  } catch (error) {
    console.error('[SBI Lives] Chargement impossible :', error);
    state.promotions = [];
    state.sessions = [];
    renderAll();
    setStatus(error?.message || 'Chargement des lives impossible.', 'error');
  }
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
