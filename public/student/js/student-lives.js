import { auth } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
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
} from '/js/live/live-shared.js?v=8.0P.167.207';

const state = {
  profile: null,
  promotions: [],
  sessions: [],
  view: 'list',
  tab: 'upcoming'
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message = '') {
  const node = $('student-live-status');
  if (node) node.textContent = message;
}

function getRows() {
  const sessionMap = buildSessionMap(state.sessions);
  const rows = [];

  state.promotions.forEach((promotion) => {
    getPromotionLives(promotion).forEach((live) => {
      const session = getLiveSessionForItem(promotion, live, sessionMap);
      rows.push({
        id: session?.id || live.liveSessionId || `${promotion.id}-${clean(live.id || live.itemId || getLiveTitle(live))}`,
        title: session?.title || getLiveTitle(live),
        promotion,
        live,
        session,
        startAt: session?.selectedStartAt || live.selectedLiveAt || '',
        endAt: session?.selectedEndAt || live.selectedLiveEndAt || '',
        replayUrl: session?.replayUrl || live.replayUrl || '',
        status: session?.status || live.status || live.liveSchedulingStatus || 'to_schedule'
      });
    });
  });

  state.sessions.forEach((session) => {
    if (rows.some((row) => row.session?.id === session.id)) return;
    rows.push({
      id: session.id,
      title: session.title || 'Live SBI',
      promotion: state.promotions.find((promotion) => promotion.id === session.promotionId) || {},
      live: {},
      session,
      startAt: session.selectedStartAt || '',
      endAt: session.selectedEndAt || '',
      replayUrl: session.replayUrl || '',
      status: session.status || 'scheduled'
    });
  });

  return rows.sort((a, b) => {
    const aMs = a.startAt ? Date.parse(a.startAt) : Number.MAX_SAFE_INTEGER;
    const bMs = b.startAt ? Date.parse(b.startAt) : Number.MAX_SAFE_INTEGER;
    return aMs - bMs;
  });
}

function isReplay(row) {
  if (row.replayUrl) return true;
  if (!row.startAt) return false;
  return Date.parse(row.startAt) < Date.now() && ['ended', 'replay_available'].includes(clean(row.status).toLowerCase());
}

function canJoinLive(row = {}) {
  const liveId = row.session?.id || row.live?.liveSessionId || '';
  const status = clean(row.status || '').toLowerCase();
  return Boolean(liveId) && !['cancelled', 'ended', 'replay_available'].includes(status);
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
      <span>${row.startAt ? escapeHtml(formatDateRange(row.startAt, row.endAt)) : escapeHtml(getLiveWindowLabel(row.live))}</span>
      <div class="sbi-live-card-actions">
        ${canJoinLive(row) ? `<a class="sbi-live-btn" href="/live-room.html?liveId=${encodeURIComponent(row.session?.id || row.live?.liveSessionId || '')}">Rejoindre la salle</a>` : ''}
        ${row.replayUrl ? `<a class="sbi-live-btn sbi-live-btn--ghost" href="${escapeHtml(row.replayUrl)}" target="_blank" rel="noopener noreferrer">Voir le replay</a>` : ''}
      </div>
    </article>
  `).join('')}</div>`;
}

function renderCalendar(rows) {
  const filtered = rows.filter((row) => state.tab === 'replay' ? isReplay(row) : !isReplay(row));
  if (!filtered.length) return renderEmpty('Aucun element a afficher.');

  return `<div class="sbi-live-calendar">${filtered.map((row) => `
    <div class="sbi-live-day">
      <strong>${escapeHtml(row.startAt ? formatDateTime(row.startAt) : 'A planifier')}</strong>
      <span>${escapeHtml(row.title)}</span>
    </div>
  `).join('')}</div>`;
}

function render() {
  const root = $('student-live-content');
  if (!root) return;
  const rows = getRows();
  root.innerHTML = state.view === 'calendar' ? renderCalendar(rows) : renderList(rows);

  document.querySelectorAll('[data-student-live-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.studentLiveTab === state.tab);
  });
  document.querySelectorAll('[data-student-live-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.studentLiveView === state.view);
  });
}

async function loadForUser(uid) {
  setStatus('Chargement...');
  state.profile = await loadProfile(uid);
  const promotionIds = getStudentPromotionIds(state.profile || {});
  state.promotions = promotionIds.length ? await loadPromotionsByIds(promotionIds) : [];
  state.sessions = promotionIds.length ? await loadLiveSessionsForPromotions(promotionIds) : [];
  setStatus('');
  render();
}

function bindControls() {
  document.querySelectorAll('[data-student-live-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.studentLiveTab || 'upcoming';
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

export function mountStudentLivesPage() {
  if (mounted) return null;
  mounted = true;
  bindControls();

  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    loadForUser(user.uid).catch((error) => {
      console.error('[SBI Student Lives] Chargement impossible :', error);
      setStatus(error?.message || 'Chargement impossible.');
    });
  });

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

if (document.getElementById('student-live-content') && !window.SBI_APP_SHELL_CURRENT_URL) {
  mountStudentLivesPage();
}
