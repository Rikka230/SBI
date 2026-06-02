import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let currentUid = '';
let unsubscribeAlerts = null;
let latestAlert = null;
let toastHideTimer = null;
const shownAlertIds = new Set();

function escapeHTML(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isDismissed(alert) {
  return Array.isArray(alert?.dismissedBy) && alert.dismissedBy.includes(currentUid);
}

function isActive(alert) {
  return alert?.status !== 'resolved' && !alert?.resolvedAt && !isDismissed(alert);
}

function getProfileUrl(alert = {}) {
  const uid = encodeURIComponent(String(alert.studentUid || alert.courseId || ''));
  return uid ? `/admin/admin-profile.html?id=${uid}` : '/admin/admin-accounts.html';
}

function ensureToast() {
  let toast = document.getElementById('sbi-student-doc-alert-toast');
  if (toast) return toast;

  toast = document.createElement('aside');
  toast.id = 'sbi-student-doc-alert-toast';
  toast.className = 'sbi-student-doc-alert-toast';
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="sbi-student-doc-alert-toast__icon">✓</div>
    <div class="sbi-student-doc-alert-toast__body">
      <strong data-student-doc-alert-title>Documents élèves reçus</strong>
      <span data-student-doc-alert-body>Un élève a transmis ses documents.</span>
      <div class="sbi-student-doc-alert-toast__actions">
        <button type="button" data-student-doc-alert-open>Ouvrir le profil</button>
        <button type="button" data-student-doc-alert-close>Masquer</button>
      </div>
    </div>
  `;
  document.body.appendChild(toast);

  toast.querySelector('[data-student-doc-alert-open]')?.addEventListener('click', async () => {
    if (!latestAlert) return;
    window.clearTimeout(toastHideTimer);
    await dismissAlert(latestAlert.id).catch(() => {});
    window.location.assign(getProfileUrl(latestAlert));
  });

  toast.querySelector('[data-student-doc-alert-close]')?.addEventListener('click', () => {
    // Masque seulement la pancarte temporaire. La notification reste dans l’assistant.
    window.clearTimeout(toastHideTimer);
    toast.classList.remove('is-visible');
  });

  return toast;
}

function renderToast(alert) {
  if (!alert?.id || shownAlertIds.has(alert.id)) return;

  const toast = ensureToast();
  const studentName = alert?.studentName || 'Un élève';
  const count = Number(alert?.documentCount || 0) || '';
  latestAlert = alert;
  shownAlertIds.add(alert.id);

  const title = toast.querySelector('[data-student-doc-alert-title]');
  const body = toast.querySelector('[data-student-doc-alert-body]');
  if (title) title.textContent = `${studentName} a envoyé ses documents`;
  if (body) body.textContent = count ? `${count} document(s) à vérifier dans le coffre élève.` : 'Documents à vérifier dans le coffre élève.';

  window.clearTimeout(toastHideTimer);
  toast.classList.add('is-visible');
  toastHideTimer = window.setTimeout(() => {
    if (latestAlert?.id === alert.id) {
      toast.classList.remove('is-visible');
    }
  }, 6500);
}

async function dismissAlert(alertId) {
  if (!alertId || !currentUid) return;
  await updateDoc(doc(db, 'notifications', alertId), {
    dismissedBy: arrayUnion(currentUid)
  });
}

function startAlerts(uid) {
  unsubscribeAlerts?.();
  if (!uid) return;

  const alertsQuery = query(
    collection(db, 'notifications'),
    where('destinataireId', '==', uid),
    where('type', '==', 'student_documents.submitted'),
    limit(8)
  );

  unsubscribeAlerts = onSnapshot(alertsQuery, (snapshot) => {
    const alerts = [];
    snapshot.forEach((docSnap) => alerts.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
    alerts.sort((a, b) => {
      const aMs = typeof a.dateCreation?.toMillis === 'function' ? a.dateCreation.toMillis() : 0;
      const bMs = typeof b.dateCreation?.toMillis === 'function' ? b.dateCreation.toMillis() : 0;
      return bMs - aMs;
    });
    const active = alerts.find(isActive);
    // SBI 8.0P.167.280 — Le rendu + le routage du clic de ce type sont desormais
    // geres par le registre central (admin-notifications.js). Ce module ne fait
    // plus que le toast transitoire (plus de monkey-patch DOM ni de hijack de clic).
    if (active) renderToast(active);
  }, (error) => {
    console.warn('[SBI Documents] Notifications documents indisponibles :', error?.message || error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    currentUid = user?.uid || '';
    if (!currentUid) {
      unsubscribeAlerts?.();
      unsubscribeAlerts = null;
      latestAlert = null;
      shownAlertIds.clear();
      window.clearTimeout(toastHideTimer);
      document.getElementById('sbi-student-doc-alert-toast')?.classList.remove('is-visible');
      return;
    }
    startAlerts(currentUid);
  });
});
