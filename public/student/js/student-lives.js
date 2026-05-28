import { auth, app, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
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
} from '/js/live/live-shared.js?v=8.0P.167.215';

const state = {
  profile: null,
  promotions: [],
  sessions: [],
  attendanceByLiveId: {},
  view: 'list',
  tab: 'upcoming',
  uid: ''
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message = '') {
  const node = $('student-live-status');
  if (node) node.textContent = message;
}

function getLiveIdForRow(row = {}) {
  return row.session?.id || row.live?.liveSessionId || row.id || '';
}

function getRows() {
  const sessionMap = buildSessionMap(state.sessions);
  const rows = [];

  state.promotions.forEach((promotion) => {
    getPromotionLives(promotion).forEach((live) => {
      const session = getLiveSessionForItem(promotion, live, sessionMap);
      const liveId = session?.id || live.liveSessionId || `${promotion.id}-${clean(live.id || live.itemId || getLiveTitle(live))}`;
      rows.push({
        id: liveId,
        title: session?.title || getLiveTitle(live),
        promotion,
        live,
        session,
        startAt: session?.selectedStartAt || live.selectedLiveAt || '',
        endAt: session?.selectedEndAt || live.selectedLiveEndAt || '',
        replayUrl: session?.replayUrl || session?.replayAccessUrl || session?.liveTech?.replayUrl || live.replayUrl || '',
        replayStatus: session?.replayStatus || session?.liveTech?.replayStatus || live.replayStatus || '',
        status: session?.status || live.status || live.liveSchedulingStatus || 'to_schedule',
        providerReady: Boolean(session?.providerRoomName || session?.providerRoomUrl || session?.meetingUrl || session?.liveTech?.providerReady || live.providerReady || live.providerRoomName || live.providerRoomUrl)
      });
    });
  });

  state.sessions.forEach((session) => {
    if (rows.some((row) => row.session?.id === session.id || row.id === session.id)) return;
    rows.push({
      id: session.id,
      title: session.title || 'Live SBI',
      promotion: state.promotions.find((promotion) => promotion.id === session.promotionId) || {},
      live: {},
      session,
      startAt: session.selectedStartAt || '',
      endAt: session.selectedEndAt || '',
      replayUrl: session.replayUrl || session.replayAccessUrl || session.liveTech?.replayUrl || '',
      replayStatus: session.replayStatus || session.liveTech?.replayStatus || '',
      status: session.status || 'scheduled',
      providerReady: Boolean(session.providerRoomName || session.providerRoomUrl || session.meetingUrl || session.liveTech?.providerReady)
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
  const status = clean(row.status || '').toLowerCase();
  if (['cancelled', 'ended', 'replay_available', 'done', 'closed'].includes(status)) return false;
  if (['live', 'started', 'in_progress', 'ongoing', 'open'].includes(status)) return true;
  return false;
}

function getJoinClosedLabel(row = {}) {
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
  return `<a class="sbi-live-btn sbi-live-btn--ghost" href="/student/live-replay.html?liveId=${encodeURIComponent(liveId)}">Regarder</a>`;
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
      ${getAttendanceBadges(row)}
      <div class="sbi-live-card-actions">
        ${canJoinLive(row) ? `<a class="sbi-live-btn" href="/live-room.html?liveId=${encodeURIComponent(getLiveIdForRow(row))}">Rejoindre la salle</a>` : (state.tab === 'upcoming' ? `<span class="sbi-live-btn sbi-live-btn--ghost is-disabled" aria-disabled="true">${escapeHtml(getJoinClosedLabel(row))}</span>` : '')}
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
      <strong>${escapeHtml(row.startAt ? formatDateTime(row.startAt) : 'A planifier')}</strong>
      <span>${escapeHtml(row.title)}</span>
    </div>
  `).join('')}</div>`;
}

async function loadAttendanceForRows(uid = '') {
  if (!uid) return;
  const liveIds = [...new Set(getRows().map((row) => getLiveIdForRow(row)).filter(Boolean))];
  const entries = await Promise.all(liveIds.map(async (liveId) => {
    try {
      const snap = await getDoc(doc(db, 'liveSessions', liveId, 'attendance', uid));
      return [liveId, snap.exists() ? snap.data() : {}];
    } catch (error) {
      console.warn('[SBI Student Lives] Attendance indisponible :', liveId, error);
      return [liveId, {}];
    }
  }));
  state.attendanceByLiveId = Object.fromEntries(entries);
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
  state.uid = uid;
  state.profile = await loadProfile(uid);
  const promotionIds = getStudentPromotionIds(state.profile || {});
  state.promotions = promotionIds.length ? await loadPromotionsByIds(promotionIds) : [];
  state.sessions = promotionIds.length ? await loadLiveSessionsForPromotions(promotionIds) : [];
  await loadAttendanceForRows(uid);
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

function bootStudentLivesPage() {
  if (document.getElementById('student-live-content') && !window.__SBI_APP_SHELL_MOUNTING_STUDENT_LIVES) {
    mountStudentLivesPage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootStudentLivesPage, { once: true });
} else {
  bootStudentLivesPage();
}
