/**
 * SBI 8.0P.167.89 / P2I.5-B
 * Promotions / cohortes admin + mapping cursus/cours prioritaires.
 *
 * Périmètre volontairement borné :
 * - CRUD léger des promotions côté admin ;
 * - lecture des élèves par promotion sélectionnée ;
 * - affectation élève -> promotion déplacée dans le profil élève ;
 * - mapping non destructif Promotion -> Cursus -> cours prioritaires ;
 * - aucun calcul progression/checkpoint bloquant dans cette brique.
 */

import { auth, db } from '/js/firebase-init.js';
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
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let mounted = false;
let unsubscribeAuth = null;
let unsubscribePromotions = null;
let currentAdmin = null;
let promotions = [];
let rosterStudents = [];
let formations = [];
let courses = [];
let activeRosterPromotionId = '';

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

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  dom.curriculumTitle = $('promotion-curriculum-title');
  dom.coursePlanStatus = $('promotion-course-plan-status');
  dom.coursePlanList = $('promotion-course-plan-list');
  dom.submit = $('promotion-submit-btn');
  dom.reset = $('promotion-reset-btn');
  dom.formStatus = $('promotion-form-status');
  dom.refresh = $('promotions-refresh-btn');
  dom.list = $('promotions-list');
  dom.count = $('promotions-count');
  dom.rosterSelect = $('promotion-roster-select');
  dom.rosterSearch = $('promotion-roster-search');
  dom.rosterRefresh = $('promotion-roster-refresh-btn');
  dom.rosterStatus = $('promotion-roster-status');
  dom.rosterList = $('promotion-roster-list');
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 160)).filter(Boolean);
  if (typeof value === 'string') return clean(value, 160) ? [clean(value, 160)] : [];
  return [];
}

function getCourseTitle(course = {}) {
  return clean(course.titre || course.title || course.nom || course.name || 'Cours sans titre', 180);
}

function getCourseBlockLabel(course = {}) {
  return clean(course.bloc || course.blockTitle || course.blockName || course.moduleTitle || '', 100);
}

function getCourseStatusLabel(course = {}) {
  if (course.actif === true || course.lmsStatus === 'published' || course.statutValidation === 'approved') return 'Publié';
  if (course.lmsStatus === 'pending_review' || course.statutValidation === 'pending') return 'En attente';
  return 'Brouillon';
}

function getCourseFormationRefs(course = {}) {
  return Array.from(new Set([
    ...normalizeArray(course.formationIds),
    ...normalizeArray(course.formationsIds),
    ...normalizeArray(course.targetFormationIds),
    ...normalizeArray(course.formations),
    ...normalizeArray(course.targetFormationTitles)
  ].map((item) => normalizeSearch(item)).filter(Boolean)));
}

function courseMatchesFormation(course = {}, formation = {}) {
  if (!formation.formationId && !formation.formationName) return false;
  const refs = getCourseFormationRefs(course);
  const formationRefs = [formation.formationId, formation.formationName]
    .map((item) => normalizeSearch(item))
    .filter(Boolean);
  return formationRefs.some((ref) => refs.includes(ref));
}

function findPlanItem(coursePlan = [], courseId = '') {
  if (!Array.isArray(coursePlan) || !courseId) return null;
  return coursePlan.find((item) => item?.courseId === courseId) || null;
}

function getActiveCoursePlanFromDom() {
  if (!dom.coursePlanList) return [];
  return Array.from(dom.coursePlanList.querySelectorAll('[data-course-plan-row]'))
    .filter((row) => row.querySelector('[data-course-plan-check]')?.checked)
    .map((row, index) => ({
      courseId: row.dataset.courseId || '',
      courseTitle: clean(row.dataset.courseTitle || '', 180),
      courseStatus: clean(row.dataset.courseStatus || '', 80),
      blockTitle: clean(row.dataset.blockTitle || '', 120),
      recommendedStartAt: row.querySelector('[data-course-plan-start]')?.value || '',
      recommendedEndAt: row.querySelector('[data-course-plan-end]')?.value || '',
      deadlineAt: row.querySelector('[data-course-plan-deadline]')?.value || '',
      priorityLevel: row.querySelector('[data-course-plan-priority]')?.value || 'normal',
      isBlockingPrerequisite: false,
      order: index,
      source: 'promotion-course-plan-v1'
    }))
    .filter((item) => item.courseId);
}

function setCoursePlanInputsDisabled(row, disabled) {
  row.querySelectorAll('[data-course-plan-start], [data-course-plan-end], [data-course-plan-deadline], [data-course-plan-priority]')
    .forEach((input) => { input.disabled = disabled; });
  row.classList.toggle('is-selected', !disabled);
}

function renderCoursePlanOptions(coursePlan = getActiveCoursePlanFromDom()) {
  if (!dom.coursePlanList || !dom.coursePlanStatus) return;

  const formation = getSelectedFormation();
  if (!formation.formationId) {
    dom.coursePlanStatus.textContent = 'Choisissez une formation liée pour charger les cours.';
    dom.coursePlanList.innerHTML = '';
    return;
  }

  const matchingCourses = courses
    .filter((course) => courseMatchesFormation(course, formation))
    .sort((a, b) => getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' }));

  if (!matchingCourses.length) {
    dom.coursePlanStatus.textContent = 'Aucun cours rattaché à cette formation pour l’instant.';
    dom.coursePlanList.innerHTML = '';
    return;
  }

  dom.coursePlanStatus.textContent = `${matchingCourses.length} cours disponible${matchingCourses.length > 1 ? 's' : ''} pour cette formation.`;
  dom.coursePlanList.innerHTML = matchingCourses.map((course) => {
    const saved = findPlanItem(coursePlan, course.id);
    const checked = Boolean(saved);
    const title = getCourseTitle(course);
    const block = getCourseBlockLabel(course);
    const status = getCourseStatusLabel(course);
    const priority = saved?.priorityLevel || course.priorityLevel || 'normal';

    return `
      <article class="sbi-course-plan-row ${checked ? 'is-selected' : ''}" data-course-plan-row data-course-id="${escapeHtml(course.id)}" data-course-title="${escapeHtml(title)}" data-course-status="${escapeHtml(status)}" data-block-title="${escapeHtml(block)}">
        <label class="sbi-course-plan-main">
          <input type="checkbox" data-course-plan-check ${checked ? 'checked' : ''}>
          <span>
            <strong>${escapeHtml(title)}</strong>
            <small>
              <span>${escapeHtml(status)}</span>
              ${block ? `<span>Bloc : ${escapeHtml(block)}</span>` : ''}
            </small>
          </span>
        </label>
        <div class="sbi-course-plan-fields">
          <div>
            <label>Début conseillé</label>
            <input type="date" data-course-plan-start value="${escapeHtml(saved?.recommendedStartAt || '')}" ${checked ? '' : 'disabled'}>
          </div>
          <div>
            <label>Fin conseillée</label>
            <input type="date" data-course-plan-end value="${escapeHtml(saved?.recommendedEndAt || '')}" ${checked ? '' : 'disabled'}>
          </div>
          <div>
            <label>Deadline</label>
            <input type="date" data-course-plan-deadline value="${escapeHtml(saved?.deadlineAt || '')}" ${checked ? '' : 'disabled'}>
          </div>
          <div>
            <label>Priorité</label>
            <select data-course-plan-priority ${checked ? '' : 'disabled'}>
              ${['normal', 'high', 'urgent'].map((level) => `<option value="${level}" ${priority === level ? 'selected' : ''}>${level === 'normal' ? 'Normal' : level === 'high' ? 'Haute' : 'Urgente'}</option>`).join('')}
            </select>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function resetForm() {
  if (!dom.form) return;
  dom.id.value = '';
  dom.name.value = '';
  dom.formation.value = '';
  dom.startDate.value = '';
  dom.endDate.value = '';
  dom.status.value = 'active';
  if (dom.curriculumTitle) dom.curriculumTitle.value = '';
  renderCoursePlanOptions([]);
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
  if (dom.curriculumTitle) dom.curriculumTitle.value = promotion.curriculumTitle || '';
  renderCoursePlanOptions(Array.isArray(promotion.coursePlan) ? promotion.coursePlan : []);
  if (dom.formTitle) dom.formTitle.textContent = 'Modifier la promotion';
  if (dom.submit) dom.submit.textContent = 'Sauvegarder';
  setStatus(dom.formStatus, 'Mode édition actif.');
}

function buildPromotionPayload() {
  const name = clean(dom.name?.value || '', 120);
  if (!name) throw new Error('Le nom de la promotion est obligatoire.');

  const status = dom.status?.value === 'archived' ? 'archived' : 'active';
  const formation = getSelectedFormation();

  const curriculumTitle = clean(dom.curriculumTitle?.value || formation.formationName || name, 140);
  const coursePlan = getActiveCoursePlanFromDom();

  return {
    name,
    slug: slugify(name),
    status,
    formationId: formation.formationId,
    formationName: formation.formationName,
    startDate: dom.startDate?.value || '',
    endDate: dom.endDate?.value || '',
    curriculumId: slugify(curriculumTitle || name),
    curriculumTitle,
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-v1',
    coursePlanCount: coursePlan.length,
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

function sortedPromotions() {
  return [...promotions].sort((a, b) => {
    if ((a.status || 'active') !== (b.status || 'active')) return (a.status || 'active') === 'active' ? -1 : 1;
    return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
  });
}

function renderRosterSelect() {
  if (!dom.rosterSelect) return;

  const current = dom.rosterSelect.value || activeRosterPromotionId || '';
  const rows = sortedPromotions();

  dom.rosterSelect.innerHTML = `
    <option value="">Sélectionner une promotion</option>
    ${rows.map((promotion) => `
      <option value="${escapeHtml(promotion.id)}">${escapeHtml(getPromotionLabel(promotion))}${promotion.status === 'archived' ? ' · archivée' : ''}</option>
    `).join('')}
  `;

  if (current && rows.some((promotion) => promotion.id === current)) {
    dom.rosterSelect.value = current;
    activeRosterPromotionId = current;
  } else {
    activeRosterPromotionId = '';
  }
}

function renderPromotions() {
  if (!dom.list) return;

  const sorted = sortedPromotions();

  if (dom.count) {
    const activeCount = sorted.filter((promotion) => promotion.status !== 'archived').length;
    dom.count.textContent = `${sorted.length} promotion${sorted.length > 1 ? 's' : ''} · ${activeCount} active${activeCount > 1 ? 's' : ''}`;
  }

  if (!sorted.length) {
    dom.list.innerHTML = '<div class="sbi-promotions-empty">Aucune promotion créée pour l’instant.</div>';
    renderRosterSelect();
    return;
  }

  dom.list.innerHTML = sorted.map((promotion) => {
    const status = promotion.status === 'archived' ? 'archived' : 'active';
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
            ${dates ? `<span class="sbi-promotions-pill">${escapeHtml(dates)}</span>` : ''}
            ${promotion.curriculumTitle ? `<span class="sbi-promotions-pill is-curriculum">Cursus : ${escapeHtml(promotion.curriculumTitle)}</span>` : ''}
            ${Number(promotion.coursePlanCount || 0) > 0 ? `<span class="sbi-promotions-pill">${Number(promotion.coursePlanCount || 0)} cours prioritaire${Number(promotion.coursePlanCount || 0) > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <div class="sbi-promotions-actions">
          <button type="button" data-action="roster" data-id="${escapeHtml(promotion.id)}" class="is-primary">Voir élèves</button>
          <button type="button" data-action="edit" data-id="${escapeHtml(promotion.id)}">Modifier</button>
          <button type="button" data-action="archive" data-id="${escapeHtml(promotion.id)}" class="${status === 'archived' ? '' : 'is-danger'}">${status === 'archived' ? 'Réactiver' : 'Archiver'}</button>
        </div>
      </article>
    `;
  }).join('');

  renderRosterSelect();
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

function renderRosterStudents() {
  if (!dom.rosterList) return;

  if (!activeRosterPromotionId) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Sélectionnez une promotion pour afficher ses élèves.</div>';
    setStatus(dom.rosterStatus, '');
    return;
  }

  const search = normalizeSearch(dom.rosterSearch?.value || '');
  const selectedPromotion = promotions.find((promotion) => promotion.id === activeRosterPromotionId);
  const filtered = rosterStudents
    .filter((student) => {
      if (!search) return true;
      const haystack = normalizeSearch(`${getStudentName(student)} ${student.email || ''}`);
      return haystack.includes(search);
    })
    .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b), 'fr', { sensitivity: 'base' }));

  if (dom.rosterStatus) {
    dom.rosterStatus.textContent = selectedPromotion
      ? `${filtered.length}/${rosterStudents.length} élève${rosterStudents.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''} · ${getPromotionLabel(selectedPromotion)}`
      : `${filtered.length} élève${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}`;
    dom.rosterStatus.style.color = 'var(--text-muted, #9ca3af)';
  }

  if (!rosterStudents.length) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Aucun élève rattaché à cette promotion pour l’instant.</div>';
    return;
  }

  if (!filtered.length) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Aucun élève ne correspond à cette recherche dans la promotion sélectionnée.</div>';
    return;
  }

  dom.rosterList.innerHTML = filtered.map((student) => `
    <article class="sbi-promotions-student-row" data-student-id="${escapeHtml(student.id)}">
      <div>
        <strong>${escapeHtml(getStudentName(student))}</strong>
        <p>${escapeHtml(student.email || 'Email manquant')}</p>
      </div>
      <div class="sbi-promotions-actions">
        <button type="button" data-action="profile" data-id="${escapeHtml(student.id)}" class="is-primary">Ouvrir profil</button>
      </div>
    </article>
  `).join('');
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

async function loadCoursesForPlan() {
  try {
    const snap = await getDocs(collection(db, 'courses'));
    courses = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      courses.push({ id: docSnap.id, ...data });
    });
  } catch (error) {
    console.warn('[SBI Promotions] Cours non chargés pour le plan de promotion :', error);
    courses = [];
    if (dom.coursePlanStatus) dom.coursePlanStatus.textContent = 'Chargement des cours impossible.';
  }

  renderCoursePlanOptions();
}

async function loadPromotionStudents(promotionId = activeRosterPromotionId) {
  activeRosterPromotionId = promotionId || '';
  rosterStudents = [];

  if (dom.rosterSelect && dom.rosterSelect.value !== activeRosterPromotionId) {
    dom.rosterSelect.value = activeRosterPromotionId;
  }

  if (!activeRosterPromotionId) {
    renderRosterStudents();
    return;
  }

  if (dom.rosterRefresh) {
    dom.rosterRefresh.disabled = true;
    dom.rosterRefresh.style.opacity = '0.65';
  }

  setStatus(dom.rosterStatus, 'Chargement des élèves de la promotion...');

  try {
    const snap = await getDocs(query(collection(db, 'users'), where('promotionId', '==', activeRosterPromotionId)));
    rosterStudents = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (isStudent(data)) rosterStudents.push({ id: docSnap.id, ...data });
    });
    renderRosterStudents();
  } catch (error) {
    console.warn('[SBI Promotions] Élèves de la promotion non chargés :', error);
    setStatus(dom.rosterStatus, 'Chargement des élèves impossible.', 'error');
    if (dom.rosterList) dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Lecture élèves impossible.</div>';
  } finally {
    if (dom.rosterRefresh) {
      dom.rosterRefresh.disabled = false;
      dom.rosterRefresh.style.opacity = '';
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

    if (activeRosterPromotionId && promotions.some((promotion) => promotion.id === activeRosterPromotionId)) {
      loadPromotionStudents(activeRosterPromotionId);
    } else {
      rosterStudents = [];
      renderRosterStudents();
    }
  }, (error) => {
    console.warn('[SBI Promotions] Snapshot promotions impossible :', error);
    if (dom.list) dom.list.innerHTML = '<div class="sbi-promotions-empty">Lecture promotions impossible. Vérifiez les règles Firestore.</div>';
  });
}

async function openProfile(uid) {
  if (!uid) return;
  const href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}`;
  const url = new URL(href, window.location.origin);

  try {
    window.__SBI_ADMIN_PROFILE_TARGET_UID = uid;
    window.__SBI_ADMIN_PROFILE_TARGET_URL = url.href;
    sessionStorage.setItem('sbiAdminProfileTargetUid', uid);
    sessionStorage.setItem('sbiAdminProfileTargetUrl', url.href);
  } catch {}

  try {
    if (window.SBI_APP_SHELL && typeof window.SBI_APP_SHELL.navigate === 'function') {
      const handled = await window.SBI_APP_SHELL.navigate(url, {
        historyMode: 'push',
        source: 'promotions-profile-button'
      });
      if (handled) return;
    }

    if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(url.href, {
        historyMode: 'push',
        source: 'promotions-profile-button'
      });
      if (handled) return;
    }
  } catch (error) {
    console.warn('[SBI Promotions] Navigation profil PJAX indisponible, fallback reload :', error);
  }

  window.location.assign(url.pathname + url.search);
}

function bindEvents() {
  dom.form?.addEventListener('submit', savePromotion);
  dom.reset?.addEventListener('click', resetForm);
  dom.refresh?.addEventListener('click', () => {
    loadFormations().then(loadCoursesForPlan);
    startPromotionsSnapshot();
    if (activeRosterPromotionId) loadPromotionStudents(activeRosterPromotionId);
  });
  dom.rosterRefresh?.addEventListener('click', () => loadPromotionStudents(dom.rosterSelect?.value || activeRosterPromotionId));
  dom.rosterSelect?.addEventListener('change', () => loadPromotionStudents(dom.rosterSelect.value));
  dom.rosterSearch?.addEventListener('input', renderRosterStudents);
  dom.formation?.addEventListener('change', () => renderCoursePlanOptions([]));
  dom.coursePlanList?.addEventListener('change', (event) => {
    const row = event.target.closest?.('[data-course-plan-row]');
    if (!row) return;
    if (event.target.matches?.('[data-course-plan-check]')) {
      setCoursePlanInputsDisabled(row, !event.target.checked);
    }
  });

  dom.list?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action][data-id]');
    if (!button) return;

    const promotion = promotions.find((item) => item.id === button.dataset.id);
    if (!promotion) return;

    if (button.dataset.action === 'edit') fillForm(promotion);
    if (button.dataset.action === 'archive') toggleArchivePromotion(promotion.id);
    if (button.dataset.action === 'roster') loadPromotionStudents(promotion.id);
  });

  dom.rosterList?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action="profile"][data-id]');
    if (!button) return;
    openProfile(button.dataset.id);
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
  renderRosterStudents();

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadFormations();
      await loadCoursesForPlan();
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
