/**
 * SBI 8.0P.167.104.1-GPT2.1
 * Promotions cursus selector fix - hotfix anti-freeze.
 *
 * Le patch 8.0P.167.104 rendait bien les cursus visibles, mais utilisait
 * un MutationObserver trop large : l'ouverture du sélecteur pouvait provoquer
 * une boucle render -> mutation -> render.
 *
 * Cette version supprime totalement l'observer. Elle se contente :
 * - d'écouter les clics utiles ;
 * - de charger curriculumTemplates à la demande ;
 * - de repeindre la liste quelques frames après l'ouverture native du modal ;
 * - d'intercepter la sauvegarde uniquement si un cursus a été choisi via ce bridge.
 */

import { auth, db } from '/js/firebase-init.js';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let templates = [];
let loadingPromise = null;
let selectedTemplate = null;
let selectedPlan = [];
let lastRenderSignature = '';

function $(id) {
  return document.getElementById(id);
}

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getView() {
  return $('view-promotions');
}

function getSelectedFormation() {
  const select = $('promotion-formation');
  const formationId = select?.value || '';
  const selectedOption = select?.selectedOptions?.[0] || null;
  const formationName = formationId ? clean(selectedOption?.textContent || '', 180) : '';
  return { formationId, formationName };
}

function setText(id, value = '') {
  const node = $(id);
  if (node) node.textContent = value;
}

function setFormStatus(message = '', tone = 'muted') {
  const node = $('promotion-form-status');
  if (!node) return;
  node.textContent = message;
  node.style.color = tone === 'success'
    ? '#2ed573'
    : tone === 'error'
      ? '#ff4a4a'
      : 'var(--text-muted, #9ca3af)';
}

function setTemplateStatus(message = '') {
  const node = $('promotion-curriculum-template-status');
  if (node) node.textContent = message;
}

function getItemType(item = {}) {
  const rawType = item.type || item.itemType || '';
  if (rawType === 'course') return item.courseId ? 'real_course' : 'placeholder_course';
  if (rawType === 'real_course') return 'real_course';
  if (rawType) return rawType;
  return item.courseId ? 'real_course' : 'placeholder_course';
}

function makePlanningItemId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDurationDays(item = {}) {
  return Math.max(1, Math.round(toNumber(
    item.durationDays || item.estimatedDurationDays || item.estimatedDurationMinDays || 7,
    7
  )));
}

function getPlanDurationDays(plan = []) {
  return plan.reduce((total, item) => {
    const type = getItemType(item);
    if (['real_course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'].includes(type)) {
      return total + getDurationDays(item);
    }
    return total;
  }, 0);
}

function getTypeLabel(type = '') {
  const map = {
    real_course: 'Cours',
    course: 'Cours',
    placeholder_course: 'Cours futur',
    buffer_period: 'Marge',
    revision_period: 'Révisions',
    catchup_period: 'Rattrapage',
    assignment: 'Devoir',
    exam: 'Examen',
    evaluation: 'Évaluation',
    live_session: 'Live',
    workshop: 'Atelier'
  };
  return map[type] || type || 'Élément';
}

function getLayerForType(type = '') {
  if (['real_course', 'course', 'placeholder_course'].includes(type)) return 'courses';
  if (type === 'assignment') return 'assignments';
  if (['exam', 'evaluation'].includes(type)) return 'assessments';
  if (['live_session', 'workshop'].includes(type)) return 'lives';
  return 'buffers';
}

function templateMatchesFormation(template = {}, formation = getSelectedFormation()) {
  if (!formation.formationId && !formation.formationName) return false;

  const templateRefs = [
    template.formationId,
    template.formationName,
    template.displayContextFormationId,
    template.displayContextFormationName,
    template.sourceFormationId,
    template.sourceFormationName
  ].map(normalize).filter(Boolean);

  const probes = [formation.formationId, formation.formationName].map(normalize).filter(Boolean);
  return probes.some((probe) => templateRefs.includes(probe));
}

function sortTemplatesForFormation(rows = [], formation = getSelectedFormation()) {
  return [...rows]
    .filter((template) => (template.status || 'draft') !== 'archived')
    .sort((a, b) => {
      const aMatch = templateMatchesFormation(a, formation) ? 0 : 1;
      const bMatch = templateMatchesFormation(b, formation) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' });
    });
}

function getVisibleTemplates() {
  const formation = getSelectedFormation();
  const rows = sortTemplatesForFormation(templates, formation);
  const matching = rows.filter((template) => templateMatchesFormation(template, formation));

  return matching.length ? matching : rows;
}

async function loadTemplates({ force = false } = {}) {
  if (loadingPromise) return loadingPromise;
  if (!force && templates.length) return templates;

  loadingPromise = getDocs(collection(db, 'curriculumTemplates'))
    .then((snap) => {
      templates = [];
      snap.forEach((docSnap) => templates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
      return templates;
    })
    .catch((error) => {
      console.warn('[SBI Promotions] Bridge cursus : chargement impossible', error);
      templates = [];
      setTemplateStatus('Chargement des cursus impossible.');
      return templates;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

function buildPlanFromTemplate(template = {}) {
  const items = Array.isArray(template.items) ? template.items : [];
  const formation = getSelectedFormation();

  return items.map((item, index) => {
    const type = getItemType(item);
    const isCourse = type === 'real_course';
    const fallbackTitle = isCourse ? 'Cours sans titre' : getTypeLabel(type);
    const title = clean(item.courseTitle || item.title || item.label || fallbackTitle, 180);

    return {
      type,
      layer: item.layer || getLayerForType(type),
      itemId: isCourse ? '' : (item.itemId || item.id || makePlanningItemId(type)),
      courseId: isCourse ? clean(item.courseId || '', 180) : '',
      courseTitle: title,
      title,
      courseStatus: clean(item.courseStatus || item.status || (isCourse ? 'Cours' : getTypeLabel(type)), 80),
      blockTitle: clean(item.blockTitle || item.blockName || '', 120),
      durationDays: getDurationDays(item),
      recommendedStartAt: '',
      recommendedEndAt: '',
      deadlineAt: '',
      dueAt: '',
      relatedCourseId: clean(item.relatedCourseId || '', 160),
      relatedCourseTitle: clean(item.relatedCourseTitle || '', 180),
      priorityLevel: ['normal', 'high', 'urgent'].includes(item.priorityLevel) ? item.priorityLevel : 'normal',
      isRequired: item.isRequired !== false,
      isLocked: false,
      isBlockingPrerequisite: item.isBlockingPrerequisite === true || item.isBlocking === true,
      isBlocking: item.isBlocking === true || item.isBlockingPrerequisite === true,
      isQualiopiEvidence: item.isQualiopiEvidence === true,
      sourceFormationId: clean(item.sourceFormationId || template.formationId || '', 160),
      sourceFormationName: clean(item.sourceFormationName || template.formationName || '', 180),
      displayContextFormationId: clean(formation.formationId || item.displayContextFormationId || '', 160),
      displayContextFormationName: clean(formation.formationName || item.displayContextFormationName || '', 180),
      isSharedCourse: item.isSharedCourse === true,
      grantedByCurriculum: item.grantedByCurriculum === false ? false : true,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      source: 'curriculum-template-applied-by-promotions-bridge-v2'
    };
  }).sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
    .map((item, index) => ({ ...item, order: index }));
}

function renderTemplateList() {
  const list = $('promotion-curriculum-template-list');
  const status = $('promotion-curriculum-template-status');
  if (!getView() || !list || !status) return;

  const formation = getSelectedFormation();
  if (!formation.formationId) {
    status.textContent = 'Sélectionnez une formation liée pour afficher les cursus disponibles.';
    list.innerHTML = '<div class="sbi-promotions-empty">Aucune formation liée.</div>';
    lastRenderSignature = '';
    return;
  }

  const rows = getVisibleTemplates();
  const matchingCount = rows.filter((template) => templateMatchesFormation(template, formation)).length;
  const signature = JSON.stringify({
    formationId: formation.formationId,
    selected: selectedTemplate?.id || '',
    rows: rows.map((template) => [template.id, template.title, template.updatedAt?.seconds || template.updatedAt || ''])
  });

  if (signature === lastRenderSignature && list.dataset.sbiBridgeRendered === 'true') return;
  lastRenderSignature = signature;
  list.dataset.sbiBridgeRendered = 'true';

  status.textContent = rows.length
    ? `${rows.length} cursus disponible${rows.length > 1 ? 's' : ''}${matchingCount ? ` · ${matchingCount} lié${matchingCount > 1 ? 's' : ''} à ${formation.formationName || 'cette formation'}` : ' · affichage de secours tous cursus non archivés'}.`
    : 'Aucun cursus sauvegardé disponible.';

  if (!rows.length) {
    list.innerHTML = '<div class="sbi-promotions-empty">Aucun cursus disponible. Créez-le depuis l’onglet Cursus, puis revenez le sélectionner ici.</div>';
    return;
  }

  list.innerHTML = rows.map((template) => {
    const count = Number(template.itemCount || (Array.isArray(template.items) ? template.items.length : 0));
    const duration = Number(template.durationDays || getPlanDurationDays(template.items || []));
    const isLinked = templateMatchesFormation(template, formation);
    const isActive = selectedTemplate?.id === template.id;
    return `
      <article class="sbi-curriculum-template-row ${isActive ? 'is-active-template' : ''}" data-sbi-bridge-template-id="${escapeHtml(template.id)}">
        <div>
          <strong>${escapeHtml(template.title || 'Cursus sans nom')}</strong>
          <small>
            <span>${escapeHtml(template.formationName || 'Formation non renseignée')}</span>
            <span>${count} élément${count > 1 ? 's' : ''}</span>
            <span>${duration} jour${duration > 1 ? 's' : ''} estimé${duration > 1 ? 's' : ''}</span>
            <span>${isLinked ? 'Formation liée' : 'Autre formation / secours'}</span>
          </small>
        </div>
        <div class="sbi-curriculum-template-actions">
          <button type="button" data-sbi-bridge-apply-template="${escapeHtml(template.id)}">Appliquer</button>
        </div>
      </article>
    `;
  }).join('');
}

async function refreshAndRenderTemplates({ force = false } = {}) {
  if (!getView()) return;
  setTemplateStatus('Chargement des cursus...');
  await loadTemplates({ force });
  renderTemplateList();
}

function scheduleTemplateRender() {
  window.setTimeout(() => refreshAndRenderTemplates({ force: true }), 80);
  window.setTimeout(() => renderTemplateList(), 260);
  window.setTimeout(() => renderTemplateList(), 700);
}

function closeTemplateModal() {
  const modal = $('promotion-curriculum-template-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function applyTemplate(templateId = '') {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  selectedTemplate = template;
  selectedPlan = buildPlanFromTemplate(template);

  const titleInput = $('promotion-curriculum-title');
  if (titleInput) titleInput.value = template.title || '';

  const duration = getPlanDurationDays(selectedPlan);
  setText('promotion-planning-summary-title', template.title || 'Cursus sélectionné');
  setText(
    'promotion-planning-summary-meta',
    `${selectedPlan.length} élément${selectedPlan.length > 1 ? 's' : ''} · ${duration} jour${duration > 1 ? 's' : ''} estimé${duration > 1 ? 's' : ''} · sauvegardez la promotion pour confirmer.`
  );

  setFormStatus(`Cursus « ${template.title || 'sans nom'} » sélectionné. Sauvegardez la promotion pour enregistrer ce choix.`, 'success');
  closeTemplateModal();
}

function getPromotionPayload() {
  const name = clean($('promotion-name')?.value || '', 120);
  if (!name) throw new Error('Le nom de la promotion est obligatoire.');

  const formation = getSelectedFormation();
  const title = clean($('promotion-curriculum-title')?.value || selectedTemplate?.title || formation.formationName || name, 140);
  const coursePlan = selectedPlan.length ? selectedPlan : [];
  const user = auth.currentUser;

  return {
    name,
    slug: slugify(name),
    status: $('promotion-status')?.value === 'archived' ? 'archived' : 'active',
    formationId: formation.formationId,
    formationName: formation.formationName,
    startDate: $('promotion-start-date')?.value || '',
    endDate: $('promotion-end-date')?.value || '',
    curriculumId: slugify(title || name),
    curriculumTitle: title,
    curriculumTemplateId: selectedTemplate?.id || '',
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-multilayer-v1',
    coursePlanCount: coursePlan.length,
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || '',
    updatedByEmail: user?.email || ''
  };
}

async function savePromotionWithSelectedTemplate(event) {
  if (!selectedTemplate) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const submit = $('promotion-submit-btn');
  if (submit) {
    submit.disabled = true;
    submit.style.opacity = '0.65';
  }

  setFormStatus('Sauvegarde de la promotion avec le cursus sélectionné...');

  try {
    const payload = getPromotionPayload();
    const editingId = $('promotion-id')?.value || '';
    const user = auth.currentUser;

    if (editingId) {
      await setDoc(doc(db, 'promotions', editingId), payload, { merge: true });
      setFormStatus('Promotion mise à jour avec le cursus sélectionné.', 'success');
    } else {
      await addDoc(collection(db, 'promotions'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || '',
        createdByEmail: user?.email || ''
      });
      setFormStatus('Promotion créée avec le cursus sélectionné.', 'success');
    }
  } catch (error) {
    console.warn('[SBI Promotions] Bridge cursus : sauvegarde impossible', error);
    setFormStatus(error?.message || 'Sauvegarde impossible.', 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.style.opacity = '';
    }
  }
}

function clearSelection() {
  selectedTemplate = null;
  selectedPlan = [];
  lastRenderSignature = '';
}

function bindEvents() {
  if (document.body.dataset.sbiPromotionsCursusFixV1041 === 'true') return;
  document.body.dataset.sbiPromotionsCursusFixV1041 = 'true';

  document.addEventListener('click', (event) => {
    if (!getView()) return;

    const open = event.target.closest?.('#promotion-planning-open-btn, #promotion-curriculum-load-btn');
    if (open) {
      lastRenderSignature = '';
      scheduleTemplateRender();
      return;
    }

    const apply = event.target.closest?.('[data-sbi-bridge-apply-template]');
    if (apply) {
      event.preventDefault();
      event.stopPropagation();
      applyTemplate(apply.dataset.sbiBridgeApplyTemplate || '');
      return;
    }

    const edit = event.target.closest?.('button[data-action="edit"][data-id]');
    if (edit) {
      clearSelection();
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (!getView()) return;
    if (event.target?.id !== 'promotion-form') return;
    savePromotionWithSelectedTemplate(event);
  }, true);

  document.addEventListener('change', (event) => {
    if (!getView()) return;
    if (event.target?.id !== 'promotion-formation') return;
    clearSelection();
    if ($('promotion-curriculum-template-modal')?.classList.contains('is-open')) {
      scheduleTemplateRender();
    }
  }, true);
}

export function initAdminPromotionsCursusSelectorFix() {
  if (installed) {
    bindEvents();
    return;
  }

  installed = true;
  bindEvents();

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(bindEvents, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(bindEvents, 80));
}

initAdminPromotionsCursusSelectorFix();
