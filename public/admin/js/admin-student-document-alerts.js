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

async function getNotificationById(notifId = '') {
  if (!notifId) return null;
  try {
    const snap = await getDoc(doc(db, 'notifications', notifId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() || {}) };
  } catch (error) {
    console.warn('[SBI Documents] Lecture notification impossible :', error?.message || error);
    return null;
  }
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
    await dismissAlert(latestAlert.id).catch(() => {});
    window.location.assign(getProfileUrl(latestAlert));
  });

  toast.querySelector('[data-student-doc-alert-close]')?.addEventListener('click', async () => {
    if (latestAlert?.id) await dismissAlert(latestAlert.id).catch(() => {});
    toast.classList.remove('is-visible');
  });

  return toast;
}

function renderToast(alert) {
  const toast = ensureToast();
  const studentName = alert?.studentName || 'Un élève';
  const count = Number(alert?.documentCount || 0) || '';
  latestAlert = alert;

  const title = toast.querySelector('[data-student-doc-alert-title]');
  const body = toast.querySelector('[data-student-doc-alert-body]');
  if (title) title.textContent = `${studentName} a envoyé ses documents`;
  if (body) body.textContent = count ? `${count} document(s) à vérifier dans le coffre élève.` : 'Documents à vérifier dans le coffre élève.';
  toast.classList.add('is-visible');
}

async function dismissAlert(alertId) {
  if (!alertId || !currentUid) return;
  await updateDoc(doc(db, 'notifications', alertId), {
    dismissedBy: arrayUnion(currentUid)
  });
}

function patchNotificationPanel() {
  document.querySelectorAll('.notif-item[data-type="student_documents.submitted"]').forEach((item) => {
    if (item.dataset.studentDocsPatched === 'true') return;
    item.dataset.studentDocsPatched = 'true';
    const studentUid = item.getAttribute('data-student-uid') || item.getAttribute('data-course') || '';
    const studentName = item.getAttribute('data-author') || item.getAttribute('data-title') || 'Élève SBI';
    const title = item.querySelector('p:first-of-type');
    const body = item.querySelector('p:nth-of-type(2)');
    if (title) title.textContent = 'Documents élève à vérifier';
    if (body) body.innerHTML = `<strong>${escapeHTML(studentName)}</strong> a transmis des documents.`;
    if (studentUid) item.setAttribute('data-student-uid', studentUid);
  });
}

async function openStudentProfileFromNotificationItem(item) {
  if (!item) return;
  const notifId = item.getAttribute('data-id') || '';
  let studentUid = item.getAttribute('data-student-uid') || item.getAttribute('data-course') || '';

  if (!studentUid && notifId) {
    const notification = await getNotificationById(notifId);
    studentUid = notification?.studentUid || notification?.courseId || '';
  }

  if (notifId) await dismissAlert(notifId).catch(() => {});
  window.location.assign(studentUid ? `/admin/admin-profile.html?id=${encodeURIComponent(studentUid)}` : '/admin/admin-accounts.html');
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
    patchNotificationPanel();
    if (active) renderToast(active);
  }, (error) => {
    console.warn('[SBI Documents] Notifications documents indisponibles :', error?.message || error);
  });
}

window.addEventListener('sbi:notifications-updated', patchNotificationPanel);

document.addEventListener('click', async (event) => {
  const item = event.target.closest?.('.notif-item[data-type="student_documents.submitted"]');
  if (!item) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  await openStudentProfileFromNotificationItem(item);
}, true);

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    currentUid = user?.uid || '';
    if (!currentUid) {
      unsubscribeAlerts?.();
      unsubscribeAlerts = null;
      latestAlert = null;
      document.getElementById('sbi-student-doc-alert-toast')?.classList.remove('is-visible');
      return;
    }
    startAlerts(currentUid);
  });
});
