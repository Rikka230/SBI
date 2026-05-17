/**
 * SBI 8.0P.167.58 / P2I.1
 * Promotions / cohortes admin.
 *
 * Périmètre volontairement borné :
 * - CRUD léger des promotions côté admin ;
 * - association élève -> promotion via Function serveur adminUpdateUserAccount ;
 * - aucun LMS, aucun cursus/checkpoint dans cette brique.
 */

import { auth, db, app } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminUpdateUserAccount = httpsCallable(functionsInstance, 'adminUpdateUserAccount');

let mounted = false;
let unsubscribeAuth = null;
let unsubscribePromotions = null;
let currentAdmin = null;
let promotions = [];
let students = [];
let formations = [];

const dom = {};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clean(value = '', max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slugify(value = '') {
  return clean(value, 140)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function formatDate(value, fallback = 'Non renseigné') {
  if (!value) return fallback;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  const ms = toMillis(value);
  if (!ms) return fallback;

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(ms));
  } catch (_) {
    return fallback;
  }
}

function getStudentName(student = {}) {
  return clean(`${student.prenom || ''} ${student.nom || ''}`) || student.email || 'Élève sans nom';
}

function getPromotionLabel(promotion = {}) {
  return promotion?.name || promotion?.promotionName || 'Promotion sans nom';
}

function isStudent(profile = {}) {
  const role = String(profile.role || '').toLowerCase();
  return ['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(role);
}

function setStatus(el, message = '', tone = 'muted') {
  if (!el) return;
  el.textContent = message;
  el.style.color = tone === 'success'
    ? '#2ed573'
    : tone === 'error'
      ? '#ff4a4a'
      : 'var(--text-muted, #9ca3af)';
}

function cacheDom() {
  dom.form = $('promotion-form');
  dom.formTitle = $('promotion-form-title');
  dom.id = $('promotion-id');
  dom.name = $('promotion-name');
  dom.formation = $('promotion-formation');
  dom.startDate = $('promotion-start-date');
  dom.endDate = $('promotion-end-date');
  dom.status = $('promotion-status');
  dom.submit = $('promotion-submit-btn');
  dom.reset = $('promotion-reset-btn');
  dom.formStatus = $('promotion-form-status');
  dom.refresh = $('promotions-refresh-btn');
  dom.list = $('promotions-list');
  dom.count = $('promotions-count');
  dom.assignForm = $('promotion-assign-form');
  dom.studentSelect = $('promotion-student-select');
  dom.assignSelect = $('promotion-assign-select');
  dom.assignBtn = $('promotion-assign-btn');
  dom.assignStatus = $('promotion-assign-status');
  dom.studentsRefresh = $('students-refresh-btn');
  dom.studentsList = $('promotion-students-list');
}

function getSelectedFormation() {
  const value = dom.formation?.value || '';
  if (!value) return { formationId: '', formationName: '' };

  const found = formations.find((formation) => formation.id === value) || null;
  return {
    formationId: found?.id || value,
    formationName: found?.title || found?.nom || found?.name || found?.slug || value
  };
}

function resetForm() {
  if (!dom.form) return;
  dom.id.value = '';
  dom.name.value = '';
  dom.formation.value = '';
  dom.startDate.value = '';
  dom.endDate.value = '';
  dom.status.value = 'active';
  if (dom.formTitle) dom.formTitle.textContent = 'Créer une promotion';
  if (dom.submit) dom.submit.textContent = 'Créer la promotion';
  setStatus(dom.formStatus, '');
}

function fillForm(promotion) {
  if (!promotion || !dom.form) return;
  dom.id.value = promotion.id || '';
  dom.name.value = promotion.name || '';
  dom.formation.value = promotion.formationId || '';
  dom.startDate.value = promotion.startDate || '';
  dom.endDate.value = promotion.endDate || '';
  dom.status.value = promotion.status || 'active';
  if (dom.formTitle) dom.formTitle.textContent = 'Modifier la promotion';
  if (dom.submit) dom.submit.textContent = 'Sauvegarder';
  setStatus(dom.formStatus, 'Mode édition actif.');
}

function buildPromotionPayload() {
  const name = clean(dom.name?.value || '', 120);
  if (!name) throw new Error('Le nom de la promotion est obligatoire.');

  const status = dom.status?.value === 'archived' ? 'archived' : 'active';
  const formation = getSelectedFormation();

  return {
    name,
    slug: slugify(name),
    status,
    formationId: formation.formationId,
    formationName: formation.formationName,
    startDate: dom.startDate?.value || '',
    endDate: dom.endDate?.value || '',
    updatedAt: serverTimestamp(),
    updatedBy: currentAdmin?.uid || '',
    updatedByEmail: currentAdmin?.email || ''
  };
}

async function savePromotion(event) {
  event?.preventDefault?.();
  if (!currentAdmin) return;

  if (dom.submit) {
    dom.submit.disabled = true;
    dom.submit.style.opacity = '0.65';
  }

  setStatus(dom.formStatus, 'Sauvegarde...');

  try {
    const payload = buildPromotionPayload();
    const editingId = dom.id?.value || '';

    if (editingId) {
      await setDoc(doc(db, 'promotions', editingId), payload, { merge: true });
      setStatus(dom.formStatus, 'Promotion mise à jour.', 'success');
    } else {
      await addDoc(collection(db, 'promotions'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentAdmin.uid,
        createdByEmail: currentAdmin.email || ''
      });
      setStatus(dom.formStatus, 'Promotion créée.', 'success');
      resetForm();
    }
  } catch (error) {
    console.warn('[SBI Promotions] Sauvegarde impossible :', error);
    setStatus(dom.formStatus, error?.message || 'Sauvegarde impossible.', 'error');
  } finally {
    if (dom.submit) {
      dom.submit.disabled = false;
      dom.submit.style.opacity = '';
    }
  }
}

async function toggleArchivePromotion(id) {
  const promotion = promotions.find((item) => item.id === id);
  if (!promotion) return;

  const nextStatus = promotion.status === 'archived' ? 'active' : 'archived';

  try {
    await updateDoc(doc(db, 'promotions', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin?.uid || '',
      updatedByEmail: currentAdmin?.email || ''
    });
    setStatus(dom.formStatus, nextStatus === 'archived' ? 'Promotion archivée.' : 'Promotion réactivée.', 'success');
  } catch (error) {
    console.warn('[SBI Promotions] Archivage impossible :', error);
    setStatus(dom.formStatus, 'Archivage impossible.', 'error');
  }
}

function renderPromotionSelects() {
  const activePromotions = promotions.filter((promotion) => promotion.status !== 'archived');

  if (dom.assignSelect) {
    const current = dom.assignSelect.value;
    dom.assignSelect.innerHTML = `
      <option value="">Aucune promotion</option>
      ${activePromotions.map((promotion) => `
        <option value="${escapeHtml(promotion.id)}">${escapeHtml(getPromotionLabel(promotion))}</option>
      `).join('')}
    `;
    if (current && activePromotions.some((promotion) => promotion.id === current)) dom.assignSelect.value = current;
  }
}

function renderPromotions() {
  if (!dom.list) return;

  const sorted = [...promotions].sort((a, b) => {
    if ((a.status || 'active') !== (b.status || 'active')) return (a.status || 'active') === 'active' ? -1 : 1;
    return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
  });

  if (dom.count) {
    const activeCount = sorted.filter((promotion) => promotion.status !== 'archived').length;
    dom.count.textContent = `${sorted.length} promotion${sorted.length > 1 ? 's' : ''} · ${activeCount} active${activeCount > 1 ? 's' : ''}`;
  }

  if (!sorted.length) {
    dom.list.innerHTML = '<div class="sbi-promotions-empty">Aucune promotion créée pour l’instant.</div>';
    renderPromotionSelects();
    return;
  }

  dom.list.innerHTML = sorted.map((promotion) => {
    const status = promotion.status === 'archived' ? 'archived' : 'active';
    const assignedCount = students.filter((student) => student.promotionId === promotion.id).length;
    const dates = [
      promotion.startDate ? `Début ${formatDate(promotion.startDate)}` : '',
      promotion.endDate ? `Fin ${formatDate(promotion.endDate)}` : ''
    ].filter(Boolean).join(' · ');

    return `
      <article class="sbi-promotions-row ${status === 'archived' ? 'is-archived' : ''}" data-promotion-id="${escapeHtml(promotion.id)}">
        <div>
          <strong>${escapeHtml(getPromotionLabel(promotion))}</strong>
          <p>${escapeHtml(promotion.formationName || 'Formation non liée')}</p>
          <div class="sbi-promotions-meta">
            <span class="sbi-promotions-pill ${status === 'archived' ? 'is-archived' : 'is-active'}">${status === 'archived' ? 'Archivée' : 'Active'}</span>
            <span class="sbi-promotions-pill">${assignedCount} élève${assignedCount > 1 ? 's' : ''}</span>
            ${dates ? `<span class="sbi-promotions-pill">${escapeHtml(dates)}</span>` : ''}
          </div>
        </div>
        <div class="sbi-promotions-actions">
          <button type="button" data-action="edit" data-id="${escapeHtml(promotion.id)}">Modifier</button>
          <button type="button" data-action="archive" data-id="${escapeHtml(promotion.id)}" class="${status === 'archived' ? '' : 'is-danger'}">${status === 'archived' ? 'Réactiver' : 'Archiver'}</button>
        </div>
      </article>
    `;
  }).join('');

  renderPromotionSelects();
}

function renderFormationSelect() {
  if (!dom.formation) return;

  const current = dom.formation.value;
  dom.formation.innerHTML = `
    <option value="">Aucune formation liée pour l’instant</option>
    ${formations.map((formation) => {
      const label = formation.title || formation.nom || formation.name || formation.slug || formation.id;
      return `<option value="${escapeHtml(formation.id)}">${escapeHtml(label)}</option>`;
    }).join('')}
  `;

  if (current && formations.some((formation) => formation.id === current)) dom.formation.value = current;
}

function renderStudents() {
  const sortedStudents = [...students].sort((a, b) => getStudentName(a).localeCompare(getStudentName(b), 'fr', { sensitivity: 'base' }));

  if (dom.studentSelect) {
    const current = dom.studentSelect.value;
    dom.studentSelect.innerHTML = sortedStudents.length
      ? `
        <option value="">Sélectionner un élève</option>
        ${sortedStudents.map((student) => `
          <option value="${escapeHtml(student.id)}">${escapeHtml(getStudentName(student))}${student.promotionName ? ` · ${escapeHtml(student.promotionName)}` : ''}</option>
        `).join('')}
      `
      : '<option value="">Aucun élève disponible</option>';

    if (current && sortedStudents.some((student) => student.id === current)) dom.studentSelect.value = current;
  }

  if (!dom.studentsList) return;

  if (!sortedStudents.length) {
    dom.studentsList.innerHTML = '<div class="sbi-promotions-empty">Aucun élève trouvé.</div>';
    return;
  }

  dom.studentsList.innerHTML = sortedStudents.map((student) => {
    const promotion = student.promotionId
      ? promotions.find((item) => item.id === student.promotionId)
      : null;
    const promotionName = promotion?.name || student.promotionName || 'Aucune promotion';
    const promotionTone = student.promotionId ? 'is-active' : '';

    return `
      <article class="sbi-promotions-student-row" data-student-id="${escapeHtml(student.id)}">
        <div>
          <strong>${escapeHtml(getStudentName(student))}</strong>
          <p>${escapeHtml(student.email || 'Email manquant')}</p>
        </div>
        <div class="sbi-promotions-meta" style="justify-content:flex-end;">
          <span class="sbi-promotions-pill ${promotionTone}">${escapeHtml(promotionName)}</span>
        </div>
      </article>
    `;
  }).join('');
}

async function loadFormations() {
  try {
    const snap = await getDocs(collection(db, 'publicFormations'));
    formations = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      formations.push({ id: docSnap.id, ...data });
    });
    formations.sort((a, b) => String(a.title || a.nom || a.name || '').localeCompare(String(b.title || b.nom || b.name || ''), 'fr', { sensitivity: 'base' }));
  } catch (error) {
    console.warn('[SBI Promotions] Formations publiques non chargées :', error);
    formations = [];
  }

  renderFormationSelect();
}

async function loadStudents() {
  if (dom.studentsRefresh) {
    dom.studentsRefresh.disabled = true;
    dom.studentsRefresh.style.opacity = '0.65';
  }

  try {
    const snap = await getDocs(collection(db, 'users'));
    students = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (isStudent(data)) students.push({ id: docSnap.id, ...data });
    });
    renderStudents();
    renderPromotions();
    setStatus(dom.assignStatus, `${students.length} élève${students.length > 1 ? 's' : ''} chargé${students.length > 1 ? 's' : ''}.`, 'success');
  } catch (error) {
    console.warn('[SBI Promotions] Élèves non chargés :', error);
    setStatus(dom.assignStatus, 'Chargement élèves impossible.', 'error');
  } finally {
    if (dom.studentsRefresh) {
      dom.studentsRefresh.disabled = false;
      dom.studentsRefresh.style.opacity = '';
    }
  }
}

function startPromotionsSnapshot() {
  unsubscribePromotions?.();

  unsubscribePromotions = onSnapshot(query(collection(db, 'promotions')), (snapshot) => {
    promotions = [];
    snapshot.forEach((docSnap) => {
      promotions.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });
    renderPromotions();
    renderStudents();
  }, (error) => {
    console.warn('[SBI Promotions] Snapshot promotions impossible :', error);
    if (dom.list) dom.list.innerHTML = '<div class="sbi-promotions-empty">Lecture promotions impossible. Vérifiez les règles Firestore.</div>';
  });
}

async function assignStudent(event) {
  event?.preventDefault?.();

  const uid = dom.studentSelect?.value || '';
  const promotionId = dom.assignSelect?.value || '';

  if (!uid) {
    setStatus(dom.assignStatus, 'Sélectionnez un élève.', 'error');
    return;
  }

  const promotion = promotionId ? promotions.find((item) => item.id === promotionId) : null;
  if (promotionId && !promotion) {
    setStatus(dom.assignStatus, 'Promotion introuvable.', 'error');
    return;
  }

  if (dom.assignBtn) {
    dom.assignBtn.disabled = true;
    dom.assignBtn.style.opacity = '0.65';
  }

  setStatus(dom.assignStatus, 'Affectation en cours...');

  try {
    await adminUpdateUserAccount({
      uid,
      promotionId,
      promotionName: promotion ? getPromotionLabel(promotion) : '',
      promotionStatus: promotion ? (promotion.status || 'active') : ''
    });

    setStatus(dom.assignStatus, promotion ? 'Élève affecté à la promotion.' : 'Promotion retirée de l’élève.', 'success');
    await loadStudents();
  } catch (error) {
    console.warn('[SBI Promotions] Affectation impossible :', error);
    setStatus(dom.assignStatus, String(error?.message || 'Affectation impossible.').replace(/^Firebase:\s*/i, ''), 'error');
  } finally {
    if (dom.assignBtn) {
      dom.assignBtn.disabled = false;
      dom.assignBtn.style.opacity = '';
    }
  }
}

function bindEvents() {
  dom.form?.addEventListener('submit', savePromotion);
  dom.reset?.addEventListener('click', resetForm);
  dom.refresh?.addEventListener('click', () => {
    loadFormations();
    loadStudents();
    startPromotionsSnapshot();
  });
  dom.studentsRefresh?.addEventListener('click', loadStudents);
  dom.assignForm?.addEventListener('submit', assignStudent);

  dom.list?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action][data-id]');
    if (!button) return;

    const promotion = promotions.find((item) => item.id === button.dataset.id);
    if (!promotion) return;

    if (button.dataset.action === 'edit') fillForm(promotion);
    if (button.dataset.action === 'archive') toggleArchivePromotion(promotion.id);
  });
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Authentification requise.');
  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists()) throw new Error('Profil admin introuvable.');

  const profile = profileSnap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');

  currentAdmin = {
    uid: user.uid,
    email: user.email || profile.email || '',
    profile
  };
}

function showUnauthorized(message) {
  const root = $('view-promotions');
  if (!root) return;
  root.innerHTML = `
    <div class="sbi-promotions-card">
      <h3>Accès impossible</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

export function mountAdminPromotions() {
  if (mounted && document.getElementById('view-promotions')) return window.SBI_ADMIN_PROMOTIONS_UNMOUNT || (() => {});
  if (!document.getElementById('view-promotions')) return () => {};

  mounted = true;
  cacheDom();
  bindEvents();
  resetForm();

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await Promise.all([loadFormations(), loadStudents()]);
      startPromotionsSnapshot();
    } catch (error) {
      console.warn('[SBI Promotions] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });

  const cleanup = () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    unsubscribePromotions?.();
    unsubscribePromotions = null;
  };

  window.SBI_ADMIN_PROMOTIONS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminPromotions(), { once: true });
} else {
  mountAdminPromotions();
}
