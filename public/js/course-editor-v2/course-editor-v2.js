import { app, db, auth } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

import {
  clearPendingMediaForChapter,
  formatBytes,
  getPendingResourceFileMeta,
  hasPendingMedia,
  restoreCurrentMediaPreview,
  setPendingImageFile,
  setPendingResourceFile,
  setPendingVideoFile,
  syncChapterMediaFromDom,
  uploadPendingMediaForChapters,
  validateCourseDocumentSize
} from '/admin/js/course-media-storage.js?v=8.0P.167.205';

const MAX_QUERY_VALUES = 10;
const VERSION = '8.0P.167.205';
const functionsInstance = getFunctions(app, 'europe-west1');
const submitCourseForValidationCallable = httpsCallable(functionsInstance, 'submitCourseForValidation');
const reviewCourseValidationCallable = httpsCallable(functionsInstance, 'reviewCourseValidation');
const syncCourseBlockReferenceCallable = httpsCallable(functionsInstance, 'syncCourseBlockReference');

const BLOCK_TYPES = [
  { type: 'course_info', label: 'Course Info', subtitle: 'Informations générales', icon: 'i', static: true },
  { type: 'objectives', label: 'Objectifs', subtitle: 'Objectifs pédagogiques', icon: '◎', static: true },
  { type: 'lesson', label: 'Leçon', subtitle: 'Contenu à transmettre', icon: 'L' },
  { type: 'fill_blank', label: 'Texte à trous', subtitle: 'Complétion de texte', icon: '□' },
  { type: 'quiz', label: 'QCM', subtitle: 'Évaluation rapide', icon: '?' },
  { type: 'resource', label: 'Ressource', subtitle: 'Document à consulter', icon: 'R' },
  { type: 'assignment', label: 'Devoir', subtitle: 'Travail à réaliser', icon: 'D' },
  { type: 'checkpoint', label: 'Checkpoint', subtitle: 'Point de contrôle', icon: '✓' },
  { type: 'case_study', label: 'Étude de cas', subtitle: 'Cas pratique', icon: 'C' }
];

const BLOCK_TYPE_MAP = new Map(BLOCK_TYPES.map((item) => [item.type, item]));
const PEDAGOGIC_BLOCK_TYPES = new Set(['resource', 'assignment', 'checkpoint', 'case_study']);
const PEDAGOGIC_PRIMARY_FIELDS = {
  resource: 'resourceDescription',
  assignment: 'assignmentPrompt',
  checkpoint: 'checkpointGoal',
  case_study: 'scenario'
};

const QUALIOPI_EVIDENCE_OPTIONS = [
  {
    value: '2.2 Moyens pédagogiques',
    title: '2.2 Moyens pédagogiques',
    help: 'Support, méthode, ressource ou situation utilisée pour apprendre.'
  },
  {
    value: '2.4 Modalités d’évaluation',
    title: '2.4 Modalités d’évaluation',
    help: 'Quiz, devoir, checkpoint ou activité qui mesure une acquisition.'
  },
  {
    value: '3.1 Adaptation pédagogique',
    title: '3.1 Adaptation pédagogique',
    help: 'Contenu adapté au niveau, au besoin ou au rythme de l’apprenant.'
  }
];

const QUILL_TOOLBAR_OPTIONS = [
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ align: [] }],
  ['link', 'image', 'video'],
  ['clean']
];

let lastQuillSelection = null;

function rememberQuillSelection(range) {
  if (range && range.length > 0) {
    lastQuillSelection = { index: range.index, length: range.length };
  }
}

function decorateQuillTooltip(element, label) {
  if (!element || !label) return;
  element.dataset.sbiTooltip = label;
  element.classList.add('sbi-editor-v2-quill-tooltip-anchor');
  element.setAttribute('title', label);
  element.setAttribute('aria-label', label);
  if (element.tagName === 'BUTTON') element.setAttribute('type', 'button');
}

function applyQuillTooltips(toolbarRoot) {
  if (!toolbarRoot) return;
  const labels = [
    ['.ql-size', 'Taille du texte'],
    ['.ql-bold', 'Gras'],
    ['.ql-italic', 'Italique'],
    ['.ql-underline', 'Souligner'],
    ['.ql-strike', 'Barrer'],
    ['.ql-color', 'Couleur du caractère'],
    ['.ql-background', 'Surlignage du caractère'],
    ['.ql-list[value="ordered"]', 'Liste numérotée'],
    ['.ql-list[value="bullet"]', 'Liste à puces'],
    ['.ql-align', 'Alignement'],
    ['.ql-link', 'Ajouter un lien'],
    ['.ql-image', 'Insérer une image'],
    ['.ql-video', 'Insérer une vidéo'],
    ['.ql-clean', 'Nettoyer la mise en forme']
  ];

  labels.forEach(([selector, label]) => {
    toolbarRoot.querySelectorAll(selector).forEach((element) => {
      decorateQuillTooltip(element, label);

      if (element.tagName === 'SELECT') {
        const picker = element.nextElementSibling?.classList?.contains('ql-picker') ? element.nextElementSibling : null;
        if (picker) {
          decorateQuillTooltip(picker, label);
          decorateQuillTooltip(picker.querySelector('.ql-picker-label'), label);
        }
      }

      if (element.classList?.contains('ql-picker')) {
        decorateQuillTooltip(element.querySelector('.ql-picker-label'), label);
      }
    });
  });
}


const SBI_QUILL_PRESETS = [
  { value: '', label: 'Style SBI' },
  { value: 'title_1', label: 'Titre SBI 1' },
  { value: 'section_title', label: 'Titre de partie' },
  { value: 'highlight', label: 'Texte important' },
  { value: 'body', label: 'Texte normal' }
];

function installSbiPresetPicker(quill) {
  const toolbarRoot = quill?.getModule?.('toolbar')?.container;
  if (!toolbarRoot || toolbarRoot.dataset.sbiPresetInstalled === 'true') return;
  toolbarRoot.dataset.sbiPresetInstalled = 'true';

  const group = document.createElement('span');
  group.className = 'ql-formats sbi-quill-preset-group';

  const select = document.createElement('select');
  select.className = 'sbi-quill-preset-select';
  select.setAttribute('title', 'Styles SBI');
  select.setAttribute('aria-label', 'Styles SBI');

  SBI_QUILL_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.value;
    option.textContent = preset.label;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    if (!select.value) return;
    applySbiQuillPreset(quill, select.value);
    select.value = '';
  });

  group.appendChild(select);
  toolbarRoot.insertBefore(group, toolbarRoot.firstChild);
}

function applySbiQuillPreset(quill, preset) {
  if (!quill || !preset) return;
  const current = quill.getSelection();
  const range = current || lastQuillSelection || { index: Math.max(0, quill.getLength() - 1), length: 0 };
  const length = Math.max(range.length || 0, 1);

  quill.focus();
  quill.setSelection(range.index, range.length || 0, 'silent');

  if (preset === 'title_1') {
    quill.formatLine(range.index, length, 'header', 1, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, color: '#0f172a' }, 'user');
  } else if (preset === 'section_title') {
    quill.formatLine(range.index, length, 'header', 2, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, color: '#2A57FF' }, 'user');
  } else if (preset === 'highlight') {
    quill.formatLine(range.index, length, 'header', false, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, background: '#fff3e8', color: '#0f172a' }, 'user');
  } else if (preset === 'body') {
    quill.formatLine(range.index, length, 'header', false, 'user');
    quill.formatText(range.index, range.length || 0, {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      color: false,
      background: false,
      size: false
    }, 'user');
  }

  syncQuillToActiveBlock();
  markDirty();
  renderPreview();
}

const state = {
  role: 'teacher',
  uid: '',
  profile: null,
  courseId: '',
  status: 'draft',
  activeBlockId: 'course_info',
  formations: [],
  selectedFormationIds: [],
  blockOptions: [],
  dirty: false,
  readOnly: false,
  dragBlockId: '',
  quill: null,
  quillBlockId: '',
  course: {
    title: '',
    bloc: '',
    objectives: '',
    estimatedDurationMinutes: 0,
    competency: '',
    qualiopiEvidence: '',
    visibleInProgram: true,
    validationRule: 'score_minimum',
    validationScore: 70,
    learningBlocks: []
  }
};

function releasePreloadSafety() {
  document.body?.classList?.remove('preload');
  document.documentElement?.classList?.add('sbi-admin-loader-released');

  const hardVisibleNodes = [
    document.getElementById('app-container'),
    document.getElementById('main-content'),
    document.querySelector('.content-wrapper'),
    document.getElementById('sbi-course-editor-v2')
  ].filter(Boolean);

  hardVisibleNodes.forEach((node) => {
    node.style.opacity = '1';
    node.style.visibility = 'visible';
  });

  const main = document.getElementById('main-content');
  if (main) main.style.display = 'block';
}

function renderFatalEditorError(error) {
  const root = document.getElementById('sbi-course-editor-v2');
  if (!root) return;
  root.innerHTML = `
    <div class="sbi-editor-v2-fallback">
      <strong>Éditeur V2 indisponible.</strong>
      <span>${escapeHtml(error?.message || 'Erreur d’initialisation.')}</span>
    </div>
  `;
}


function updateFixedBlockBankOffset() {
  const bank = document.querySelector('.sbi-block-bank');
  const app = document.getElementById('app-container');
  if (!bank || !app) return;

  bank.classList.add('sbi-block-bank--viewport');
  bank.dataset.editorBank = 'viewport';
  if (bank.parentElement !== app) app.appendChild(bank);

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const collapsed = app.classList.contains('left-collapsed');
  const leftPanel = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-panel-width')) || 230;
  const leftMini = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-panel-mini-width')) || 60;
  const left = isMobile ? 8 : (collapsed ? leftMini + 24 : leftPanel + 24);
  const right = isMobile ? 8 : 24;

  bank.style.position = 'fixed';
  bank.style.left = `${left}px`;
  bank.style.right = `${right}px`;
  bank.style.bottom = '0px';
  bank.style.width = 'auto';
  bank.style.maxWidth = 'none';
  bank.style.margin = '0';
  bank.style.zIndex = '260';
}

function scheduleFixedBlockBankOffset() {
  window.requestAnimationFrame(updateFixedBlockBankOffset);
}

function cleanupEditorFloatingUi(root = activeRoot) {
  document.querySelectorAll('.sbi-editor-dialog-backdrop').forEach((node) => node.remove());

  document.querySelectorAll('.sbi-block-bank, [data-editor-bank], .sbi-editor-dialog-backdrop').forEach((bank) => {
    bank.remove();
  });

  if (root) {
    root.querySelectorAll('.sbi-block-bank').forEach((bank) => bank.remove());
  }
}

function isCourseEditorV2Route() {
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  return path === '/admin/course-editor.html' || path === '/teacher/course-editor.html';
}

function cleanupEditorUiIfRouteChanged() {
  const root = document.getElementById('sbi-course-editor-v2');
  if (root && isCourseEditorV2Route()) return;
  cleanupEditorFloatingUi(root || activeRoot);
}

function handleEditorRouteCleanupClick(event) {
  const anchor = event.target?.closest?.('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

  try {
    const target = new URL(href, window.location.href);
    const targetPath = target.pathname.replace(/\/+$/, '').toLowerCase();
    if (target.origin === window.location.origin
      && targetPath !== '/admin/course-editor.html'
      && targetPath !== '/teacher/course-editor.html') {
      cleanupEditorFloatingUi(activeRoot);
    }
  } catch (_) {}
}

function bindEditorRouteCleanupGuards() {
  if (activeRouteCleanupBound) return;
  window.addEventListener('sbi:app-shell:navigated', cleanupEditorUiIfRouteChanged);
  window.addEventListener('sbi:app-shell:main-replaced', cleanupEditorUiIfRouteChanged);
  window.addEventListener('sbi:app-shell:main-restored', cleanupEditorUiIfRouteChanged);
  window.addEventListener('pagehide', cleanupEditorUiIfRouteChanged);
  document.addEventListener('click', handleEditorRouteCleanupClick, true);
  activeRouteCleanupBound = true;
}

function unbindEditorRouteCleanupGuards() {
  if (!activeRouteCleanupBound) return;
  window.removeEventListener('sbi:app-shell:navigated', cleanupEditorUiIfRouteChanged);
  window.removeEventListener('sbi:app-shell:main-replaced', cleanupEditorUiIfRouteChanged);
  window.removeEventListener('sbi:app-shell:main-restored', cleanupEditorUiIfRouteChanged);
  window.removeEventListener('pagehide', cleanupEditorUiIfRouteChanged);
  document.removeEventListener('click', handleEditorRouteCleanupClick, true);
  activeRouteCleanupBound = false;
}

function bindViewportBankResize() {
  if (activeResizeBound) return;
  window.addEventListener('resize', scheduleFixedBlockBankOffset, { passive: true });
  activeResizeBound = true;
}

function unbindViewportBankResize() {
  if (!activeResizeBound) return;
  window.removeEventListener('resize', scheduleFixedBlockBankOffset);
  activeResizeBound = false;
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeString).filter(Boolean)));
}

function chunkArray(items, size = MAX_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function escapeHtml(value) {
  return normalizeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function makeId(prefix = 'block') {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPositiveMinutes(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, minutes);
}

function calculateEstimatedDurationMinutes(blocks = state.course.learningBlocks) {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((total, block) => total + toPositiveMinutes(block?.durationMinutes), 0);
}

function updateComputedCourseDuration() {
  const total = calculateEstimatedDurationMinutes();
  state.course.estimatedDurationMinutes = total;
  return total;
}

function getBlockScore(block = {}) {
  if (!block) return 0;
  if (block.type === 'fill_blank') {
    return normalizeFillBlankRows(block).reduce((total, blank) => total + Number(blank.points || 0), 0);
  }
  if (block.type === 'quiz') {
    return normalizeQuizQuestions(block).reduce((total, question) => total + Number(question.points || 0), 0);
  }
  if (block.type === 'checkpoint') {
    const score = Number(block.checkpointScore ?? block.xpReward ?? block.score ?? 10);
    return Number.isFinite(score) && score > 0 ? score : 10;
  }
  const score = Number(block.score || 0);
  return Number.isFinite(score) && score > 0 ? score : 0;
}

function calculateCourseMaxScore(blocks = state.course.learningBlocks) {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((total, block) => {
    if (!block || block.visibleInProgram === false) return total;
    return total + getBlockScore(block);
  }, 0);
}

function forceAutonomousCorrectionBlock(block = {}) {
  if (!block || typeof block !== 'object') return block;
  if (block.type === 'assignment') {
    return {
      ...block,
      manualValidation: false,
      correctionMode: 'self',
      teacherSubmissionPlanned: true
    };
  }
  if (block.type === 'case_study') {
    return {
      ...block,
      correctionMode: 'self',
      teacherSubmissionPlanned: true
    };
  }
  return block;
}

function isAdminLike(profile = state.profile) {
  return profile?.isGod === true || profile?.role === 'admin' || state.role === 'admin';
}

function isTeacherLike(profile = state.profile) {
  return ['teacher', 'prof', 'professeur', 'enseignant'].includes(String(profile?.role || '').toLowerCase());
}

function getBackUrl() {
  return state.role === 'admin' ? '/admin/formations-cours.html' : '/teacher/mes-cours.html';
}

function getViewerUrl() {
  return state.role === 'admin' ? '/student/cours-viewer.html' : '/teacher/cours-viewer.html';
}

function getStatusLabel(status = state.status) {
  if (status === 'pending') return 'En attente';
  if (status === 'approved' || status === 'published') return 'Publié';
  if (status === 'rejected') return 'À corriger';
  return 'Brouillon';
}

function getStatusTone(status = state.status) {
  if (status === 'pending') return 'pending';
  if (status === 'approved' || status === 'published') return 'published';
  return 'draft';
}

function isTeacherPendingLocked() {
  return state.role === 'teacher'
    && state.courseId
    && state.status === 'pending';
}

function isAdminPendingReview() {
  return state.role === 'admin'
    && state.courseId
    && state.status === 'pending';
}

function syncWorkflowControls() {
  const isPendingAdmin = isAdminPendingReview();
  const submitButton = $('#course-v2-submit');
  const rejectButton = $('#course-v2-reject');

  if (submitButton) {
    submitButton.textContent = state.role === 'admin' ? 'Mettre en ligne' : 'Soumettre';
    submitButton.hidden = false;
  }

  if (rejectButton) {
    rejectButton.hidden = state.role !== 'admin' || !isPendingAdmin;
    rejectButton.disabled = state.role !== 'admin' || !isPendingAdmin;
  }
}

function applyEditorLockState() {
  const locked = isTeacherPendingLocked();
  state.readOnly = locked;
  syncWorkflowControls();

  const root = $('#sbi-course-editor-v2');
  const shell = root?.querySelector('.sbi-editor-shell');
  const banner = $('#course-v2-lock-banner');
  const allowedWhenLocked = new Set(['course-v2-back-library', 'course-v2-preview']);

  if (shell) shell.classList.toggle('sbi-editor-shell--locked', locked);
  if (banner) banner.hidden = !locked;

  [root, document.querySelector('.sbi-block-bank')].filter(Boolean).forEach((controlRoot) => {
    $all('input, textarea, select, button', controlRoot).forEach((control) => {
      if (allowedWhenLocked.has(control.id) || control.classList.contains('sbi-structure-item')) {
        control.disabled = false;
        control.removeAttribute('aria-disabled');
        return;
      }
      control.disabled = locked;
      if (locked) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    });
  });

  const topTitle = $('#course-v2-title');
  if (topTitle) topTitle.readOnly = locked;

  if (state.quill?.enable) {
    state.quill.enable(!locked);
  }

  if (locked) {
    setStatus('Cours en attente de validation. Modification verrouillée.', 'pending');
  }
}

function snapToArray(snapshot) {
  const rows = [];
  if (!snapshot) return rows;
  snapshot.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  return rows;
}

async function safeGetDocs(queryRef, label = 'requête') {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    console.warn(`[SBI Course Editor V2] ${label} ignorée :`, error);
    return null;
  }
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function loadFormationsByIds(ids = []) {
  const safeIds = normalizeList(ids);
  if (!safeIds.length) return [];

  const formations = [];
  for (const chunk of chunkArray(safeIds)) {
    const snap = await safeGetDocs(
      query(collection(db, 'formations'), where(documentId(), 'in', chunk)),
      'formations par IDs'
    );
    formations.push(...snapToArray(snap));
  }
  return formations;
}

async function loadFormationsByTitles(titles = []) {
  const safeTitles = normalizeList(titles);
  if (!safeTitles.length) return [];

  const formations = [];
  for (const chunk of chunkArray(safeTitles)) {
    const snap = await safeGetDocs(
      query(collection(db, 'formations'), where('titre', 'in', chunk)),
      'formations par titres'
    );
    formations.push(...snapToArray(snap));
  }
  return formations;
}

async function loadFormationsByTeacher(uid) {
  if (!uid) return [];
  const snap = await safeGetDocs(
    query(collection(db, 'formations'), where('profs', 'array-contains', uid)),
    'formations par professeur'
  );
  return snapToArray(snap);
}

function uniqById(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
}

async function loadAccessibleFormations(uid, profile = {}) {
  if (isAdminLike(profile)) {
    const snap = await getDocs(collection(db, 'formations'));
    return snapToArray(snap).sort((a, b) => String(a.titre || '').localeCompare(String(b.titre || ''), 'fr'));
  }

  const formations = [
    ...(await loadFormationsByIds(profile.formationIds || [])),
    ...(await loadFormationsByTitles(profile.formationsAcces || [])),
    ...(await loadFormationsByTeacher(uid))
  ];

  return uniqById(formations).sort((a, b) => String(a.titre || '').localeCompare(String(b.titre || ''), 'fr'));
}

function getFormationTitle(formationId) {
  return state.formations.find((formation) => formation.id === formationId)?.titre || formationId;
}

function getSelectedFormations() {
  return state.formations.filter((formation) => state.selectedFormationIds.includes(formation.id));
}

function collectTeacherTargets(formations = getSelectedFormations()) {
  const teachers = new Set();
  formations.forEach((formation) => {
    if (Array.isArray(formation.profs)) formation.profs.forEach((uid) => uid && teachers.add(uid));
  });
  return Array.from(teachers);
}

function collectStudentTargets(formations = getSelectedFormations()) {
  const students = new Set();
  formations.forEach((formation) => {
    if (Array.isArray(formation.students)) formation.students.forEach((uid) => uid && students.add(uid));
  });
  return Array.from(students);
}

async function loadBlockOptionsFromCourses() {
  const blocks = new Set();
  const selectedIds = normalizeList(state.selectedFormationIds);

  async function absorbCourseBlockSnapshot(snapshot) {
    snapToArray(snapshot).forEach((blockRef) => {
      const title = normalizeString(blockRef.title || blockRef.blockTitle || blockRef.name);
      if (title) blocks.add(title);
    });
  }

  async function absorbCourseSnapshot(snapshot) {
    snapToArray(snapshot).forEach((course) => {
      const bloc = normalizeString(course.bloc || course.blockTitle || course.blockName);
      if (bloc) blocks.add(bloc);
    });
  }

  for (const chunk of chunkArray(selectedIds)) {
    const byCourseBlocks = await safeGetDocs(
      query(collection(db, 'courseBlocks'), where('formationIds', 'array-contains-any', chunk)),
      'référentiel courseBlocks par formation'
    );
    await absorbCourseBlockSnapshot(byCourseBlocks);
  }

  if (state.uid) {
    const ownCourseBlocks = await safeGetDocs(
      query(collection(db, 'courseBlocks'), where('authorIds', 'array-contains', state.uid)),
      'référentiel courseBlocks par auteur'
    );
    await absorbCourseBlockSnapshot(ownCourseBlocks);
  }

  if (state.uid) {
    const ownSnap = await safeGetDocs(
      query(collection(db, 'courses'), where('auteurId', '==', state.uid)),
      'blocs par auteur'
    );
    await absorbCourseSnapshot(ownSnap);
  }

  for (const chunk of chunkArray(selectedIds)) {
    const byFormations = await safeGetDocs(
      query(collection(db, 'courses'), where('formations', 'array-contains-any', chunk)),
      'blocs par formations'
    );
    await absorbCourseSnapshot(byFormations);

    const byTarget = await safeGetDocs(
      query(collection(db, 'courses'), where('targetFormationIds', 'array-contains-any', chunk)),
      'blocs par targetFormationIds'
    );
    await absorbCourseSnapshot(byTarget);
  }

  if (state.course.bloc) blocks.add(state.course.bloc);
  state.blockOptions = Array.from(blocks).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

async function syncCourseBlockReferenceForCourse(courseId) {
  if (!courseId || !normalizeBlockTitle(state.course.bloc)) return null;

  try {
    const result = await syncCourseBlockReferenceCallable({ courseId });
    return result?.data || null;
  } catch (error) {
    console.warn('[SBI Course Editor V2] Référentiel courseBlocks non synchronisé :', error);
    return {
      success: false,
      warning: error.message || 'Référentiel courseBlocks non synchronisé.'
    };
  }
}

function createDefaultBlock(type = 'lesson') {
  const meta = BLOCK_TYPE_MAP.get(type) || BLOCK_TYPE_MAP.get('lesson');
  const count = state.course.learningBlocks.filter((block) => block.type === type).length + 1;

  if (type === 'fill_blank') {
    return {
      id: makeId('fib'),
      type,
      title: 'Texte à trous',
      instructions: 'Complétez le texte ci-dessous en choisissant les mots ou expressions appropriés.',
      prompt: 'L’animateur doit préparer [[l’activité]], encadrer [[les participants]] et garantir [[la sécurité]].',
      blanks: [
        { id: makeId('blank'), token: 'l’activité', answers: 'l’activité; l activite; l’animation', points: 1 },
        { id: makeId('blank'), token: 'les participants', answers: 'les participants; participants', points: 1 },
        { id: makeId('blank'), token: 'la sécurité', answers: 'la sécurité; sécurité; la sureté; la sûreté', points: 1 }
      ],
      scoringMode: 'per_blank',
      maxAttempts: 2,
      showAnswersAtEnd: true,
      feedbackCorrect: 'Bonne réponse ! Vous avez correctement complété l’idée.',
      feedbackIncorrect: 'Relisez la consigne et vérifiez chaque élément attendu.',
      durationMinutes: 8,
      visibleInProgram: true,
      qualiopiEvidence: '',
      competency: ''
    };
  }

  if (type === 'quiz') {
    return {
      id: makeId('quiz'),
      type,
      title: `QCM ${count}`,
      instructions: 'Sélectionnez la bonne réponse.',
      questions: [
        {
          id: makeId('question'),
          question: 'Quel est le rôle principal de l’animateur ?',
          options: ['Encadrer les participants', 'Ignorer le déroulé', 'Supprimer les règles'],
          correctIndices: [0],
          points: 1
        }
      ],
      durationMinutes: 5,
      visibleInProgram: true
    };
  }

  if (type === 'resource') {
    return {
      id: makeId('resource'),
      type,
      title: `Ressource ${count}`,
      instructions: 'Consultez cette ressource avant de passer à la suite.',
      resourceType: 'link',
      resourceUrl: '',
      resourceStoragePath: '',
      resourceFileName: '',
      resourceMimeType: '',
      resourceSize: 0,
      resourceOriginalSize: 0,
      resourceCompressed: false,
      resourceDescription: '',
      consultationInstruction: '',
      durationMinutes: 10,
      visibleInProgram: true,
      qualiopiEvidence: '2.2 Moyens pédagogiques',
      competency: ''
    };
  }

  if (type === 'assignment') {
    return {
      id: makeId('assignment'),
      type,
      title: `Devoir ${count}`,
      instructions: 'Réalisez le travail demandé puis conservez votre livrable.',
      assignmentPrompt: '',
      assignmentCorrection: '',
      deliverableType: 'text',
      duePolicy: 'promotion_date',
      evaluationCriteria: '',
      correctionMode: 'self',
      manualValidation: false,
      teacherSubmissionPlanned: true,
      durationMinutes: 30,
      visibleInProgram: true,
      qualiopiEvidence: '2.4 Modalités d’évaluation',
      competency: ''
    };
  }

  if (type === 'checkpoint') {
    return {
      id: makeId('checkpoint'),
      type,
      title: `Checkpoint ${count}`,
      instructions: 'Validez ce point de contrôle avant de poursuivre.',
      checkpointGoal: '',
      checkpointMode: 'acquis_checklist',
      expectedResult: '',
      checkpointItems: [],
      requiresAllChecked: true,
      isBlockingPrerequisite: true,
      checkpointScore: 10,
      xpReward: 10,
      durationMinutes: 5,
      visibleInProgram: true,
      qualiopiEvidence: '2.4 Modalités d’évaluation',
      competency: ''
    };
  }

  if (type === 'case_study') {
    return {
      id: makeId('case'),
      type,
      title: `Étude de cas ${count}`,
      instructions: 'Analysez la situation puis répondez aux questions guidées.',
      caseContext: '',
      scenario: '',
      analysisMaterials: '',
      guidedQuestions: '',
      expectedAnswer: '',
      correctionMode: 'self',
      teacherSubmissionPlanned: true,
      durationMinutes: 25,
      visibleInProgram: true,
      qualiopiEvidence: '3.1 Adaptation pédagogique',
      competency: ''
    };
  }

  return {
    id: makeId(type),
    type,
    title: type === 'lesson' ? `Leçon ${count}` : `${meta.label} ${count}`,
    content: '',
    instructions: '',
    mediaType: type === 'lesson' ? 'image' : '',
    mediaImage: '',
    mediaVideo: '',
    durationMinutes: type === 'lesson' ? 15 : 10,
    visibleInProgram: true,
    qualiopiEvidence: '',
    competency: ''
  };
}

function convertLegacyChaptersToBlocks(chapters = []) {
  if (!Array.isArray(chapters)) return [];
  return chapters.map((chapter, index) => {
    const legacyType = chapter?.activityType || chapter?.type || '';
    if (PEDAGOGIC_BLOCK_TYPES.has(legacyType)) {
      return normalizePedagogicBlockForSave({
        id: chapter.id || makeId(legacyType),
        type: legacyType,
        title: chapter.titre || getBlockMeta(legacyType).label,
        instructions: chapter.instructions || '',
        content: chapter.contenu || '',
        durationMinutes: Number(chapter.durationMinutes || 10),
        visibleInProgram: chapter.visibleInProgram !== false,
        resourceType: chapter.resourceType || '',
        resourceUrl: chapter.resourceUrl || '',
        resourceStoragePath: chapter.resourceStoragePath || '',
        resourceFileName: chapter.resourceFileName || '',
        resourceMimeType: chapter.resourceMimeType || '',
        resourceSize: Number(chapter.resourceSize || 0),
        resourceOriginalSize: Number(chapter.resourceOriginalSize || 0),
        resourceCompressed: chapter.resourceCompressed === true,
        resourceDescription: chapter.resourceDescription || chapter.contenu || '',
        consultationInstruction: chapter.consultationInstruction || '',
        assignmentPrompt: chapter.assignmentPrompt || chapter.contenu || '',
        assignmentCorrection: chapter.assignmentCorrection || '',
        deliverableType: chapter.deliverableType || '',
        duePolicy: chapter.duePolicy || '',
        evaluationCriteria: chapter.evaluationCriteria || '',
        correctionMode: chapter.correctionMode || 'self',
        manualValidation: chapter.manualValidation === true,
        teacherSubmissionPlanned: chapter.teacherSubmissionPlanned !== false,
        checkpointGoal: chapter.checkpointGoal || chapter.contenu || '',
        checkpointMode: chapter.checkpointMode || '',
        expectedResult: chapter.expectedResult || '',
        checkpointItems: Array.isArray(chapter.checkpointItems) ? chapter.checkpointItems : [],
        requiresAllChecked: chapter.requiresAllChecked !== false,
        isBlockingPrerequisite: chapter.isBlockingPrerequisite === true,
        checkpointScore: Number(chapter.checkpointScore || chapter.xpReward || chapter.maxScore || 0),
        xpReward: Number(chapter.xpReward || chapter.checkpointScore || chapter.maxScore || 0),
        caseContext: chapter.caseContext || '',
        scenario: chapter.scenario || chapter.contenu || '',
        analysisMaterials: chapter.analysisMaterials || '',
        guidedQuestions: chapter.guidedQuestions || '',
        expectedAnswer: chapter.expectedAnswer || ''
      });
    }

    const type = chapter?.type === 'quiz' || Array.isArray(chapter?.questions) ? 'quiz' : 'lesson';
    if (type === 'quiz') {
      return {
        id: chapter.id || makeId('quiz'),
        type: 'quiz',
        title: chapter.titre || `QCM ${index + 1}`,
        instructions: chapter.instructions || '',
        questions: Array.isArray(chapter.questions) ? chapter.questions.map((question) => ({
          id: question.id || makeId('question'),
          question: question.question || question.texte || '',
          options: Array.isArray(question.options) ? question.options : [],
          correctIndices: Array.isArray(question.correctIndices) ? question.correctIndices : [],
          points: Number(question.points || 1)
        })) : [],
        durationMinutes: Number(chapter.durationMinutes || 5),
        visibleInProgram: true
      };
    }

    return {
      id: chapter.id || makeId('lesson'),
      type: 'lesson',
      title: chapter.titre || `Leçon ${index + 1}`,
      content: chapter.contenu || '',
      mediaType: chapter.mediaType || 'image',
      mediaImage: chapter.mediaImage || chapter.imageUrl || '',
      mediaVideo: chapter.mediaVideo || chapter.videoUrl || '',
      durationMinutes: Number(chapter.durationMinutes || 15),
      visibleInProgram: true
    };
  });
}

function getBlockStepTitle(block, index = 0) {
  const meta = getBlockMeta(block?.type);
  return normalizeString(block?.title || block?.titre) || `${meta.label} ${index + 1}`;
}

function getCheckpointItemsForBlock(block, blocks = state.course.learningBlocks) {
  if (!block || !Array.isArray(blocks)) return [];
  const checkpointIndex = blocks.findIndex((item) => item.id === block.id);
  const sourceBlocks = checkpointIndex >= 0 ? blocks.slice(0, checkpointIndex) : blocks;

  return sourceBlocks
    .filter((item) => item && item.visibleInProgram !== false && item.type !== 'checkpoint')
    .map((item, index) => ({
      id: item.id || `step-${index}`,
      title: getBlockStepTitle(item, index),
      type: item.type || 'lesson',
      label: getBlockMeta(item.type).label
    }));
}

function hydrateCheckpointBlock(block, blocks = state.course.learningBlocks) {
  if (!block || block.type !== 'checkpoint') return block;
  const checkpointScore = getBlockScore(block);
  return {
    ...block,
    checkpointMode: 'acquis_checklist',
    checkpointItems: getCheckpointItemsForBlock(block, blocks),
    requiresAllChecked: true,
    isBlockingPrerequisite: true,
    checkpointScore,
    xpReward: checkpointScore
  };
}

function blockHasOwnField(block = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(block, key);
}

function getPedagogicFieldValue(block = {}, key = '') {
  if (!key) return '';
  if (blockHasOwnField(block, key)) return block[key] || '';
  return block.content || '';
}

function normalizePedagogicBlockForSave(block = {}) {
  if (!PEDAGOGIC_BLOCK_TYPES.has(block.type)) return block;

  const next = { ...block };
  const primaryKey = PEDAGOGIC_PRIMARY_FIELDS[next.type];
  if (primaryKey && !blockHasOwnField(next, primaryKey)) next[primaryKey] = next.content || '';

  if (next.type === 'resource') {
    next.resourceDescription = next.resourceDescription || '';
    next.consultationInstruction = next.consultationInstruction || '';
    next.resourceUrl = next.resourceUrl || '';
    next.resourceStoragePath = next.resourceStoragePath || '';
    next.resourceFileName = next.resourceFileName || '';
    next.resourceMimeType = next.resourceMimeType || '';
    next.resourceSize = Number(next.resourceSize || 0);
    next.resourceOriginalSize = Number(next.resourceOriginalSize || 0);
    next.resourceCompressed = next.resourceCompressed === true;
    next.content = next.resourceDescription || '';
  } else if (next.type === 'assignment') {
    next.assignmentPrompt = next.assignmentPrompt || '';
    next.assignmentCorrection = next.assignmentCorrection || '';
    next.evaluationCriteria = next.evaluationCriteria || '';
    next.content = next.assignmentPrompt || '';
  } else if (next.type === 'checkpoint') {
    next.checkpointGoal = next.checkpointGoal || '';
    next.expectedResult = next.expectedResult || '';
    next.content = next.checkpointGoal || '';
  } else if (next.type === 'case_study') {
    next.scenario = next.scenario || '';
    next.caseContext = next.caseContext || '';
    next.analysisMaterials = next.analysisMaterials || '';
    next.guidedQuestions = next.guidedQuestions || '';
    next.expectedAnswer = next.expectedAnswer || '';
    next.content = next.scenario || '';
  }

  return next;
}

function normalizeLearningBlockForSave(block = {}, index = 0, blocks = []) {
  const normalizedBlock = normalizePedagogicBlockForSave(forceAutonomousCorrectionBlock(block));
  const hydratedBlock = hydrateCheckpointBlock(normalizedBlock, blocks);
  const blockScore = getBlockScore(hydratedBlock);
  return {
    ...hydratedBlock,
    order: index,
    activityType: hydratedBlock.type,
    schemaVersion: 'learning-block-v1',
    maxScore: blockScore,
    score: blockScore
  };
}

function convertBlocksToLegacyChapters(blocks = []) {
  return blocks.map((block, index) => {
    block = hydrateCheckpointBlock(block, blocks);

    if (block.type === 'quiz') {
      return {
        id: block.id || makeId('chap'),
        type: 'quiz',
        titre: block.title || `QCM ${index + 1}`,
        durationMinutes: toPositiveMinutes(block.durationMinutes),
        maxScore: getBlockScore(block),
        score: getBlockScore(block),
        questions: Array.isArray(block.questions) ? block.questions.map((question) => ({
          ...question,
          options: Array.isArray(question.options) ? question.options : [],
          correctIndices: Array.isArray(question.correctIndices) ? question.correctIndices : []
        })) : []
      };
    }

    if (block.type === 'fill_blank') {
      const prompt = renderFillBlankStudentPromptHtml(block);
      const blanks = normalizeFillBlankRows(block).map((blank) => ({
        id: blank.id || makeId('blank'),
        token: blank.token || '',
        answers: blank.answers || blank.token || '',
        points: Number(blank.points || 1)
      }));
      return {
        id: block.id || makeId('chap'),
        type: 'text',
        activityType: 'fill_blank',
        titre: block.title || `Texte à trous ${index + 1}`,
        instructions: block.instructions || '',
        prompt: block.prompt || '',
        blanks,
        scoringMode: block.scoringMode || 'per_blank',
        maxAttempts: Number(block.maxAttempts || 2),
        showAnswersAtEnd: block.showAnswersAtEnd !== false,
        feedbackCorrect: block.feedbackCorrect || '',
        feedbackIncorrect: block.feedbackIncorrect || '',
        contenu: `<h3>${escapeHtml(block.title || 'Texte à trous')}</h3><p>${escapeHtml(block.instructions || '')}</p><div>${prompt}</div>`,
        mediaType: 'image',
        durationMinutes: toPositiveMinutes(block.durationMinutes),
        maxScore: getBlockScore(block),
        score: getBlockScore(block),
        questions: []
      };
    }

    if (PEDAGOGIC_BLOCK_TYPES.has(block.type)) {
      block = forceAutonomousCorrectionBlock(block);
      const blockScore = getBlockScore(block);
      return {
        id: block.id || makeId('chap'),
        type: block.type,
        activityType: block.type,
        titre: block.title || getBlockMeta(block.type).label,
        instructions: block.instructions || '',
        contenu: buildPedagogicBlockContent(block),
        mediaType: 'image',
        durationMinutes: toPositiveMinutes(block.durationMinutes),
        maxScore: blockScore,
        score: blockScore,
        questions: [],
        resourceType: block.resourceType || '',
        resourceUrl: block.resourceUrl || '',
        resourceStoragePath: block.resourceStoragePath || '',
        resourceFileName: block.resourceFileName || '',
        resourceMimeType: block.resourceMimeType || '',
        resourceSize: Number(block.resourceSize || 0),
        resourceOriginalSize: Number(block.resourceOriginalSize || 0),
        resourceCompressed: block.resourceCompressed === true,
        resourceDescription: block.resourceDescription || '',
        consultationInstruction: block.consultationInstruction || '',
        assignmentPrompt: block.assignmentPrompt || '',
        assignmentCorrection: block.assignmentCorrection || '',
        deliverableType: block.deliverableType || '',
        duePolicy: block.duePolicy || '',
        evaluationCriteria: block.evaluationCriteria || '',
        correctionMode: block.correctionMode || 'self',
        manualValidation: block.manualValidation === true,
        teacherSubmissionPlanned: block.teacherSubmissionPlanned !== false,
        checkpointGoal: block.checkpointGoal || '',
        checkpointMode: block.checkpointMode || '',
        expectedResult: block.expectedResult || '',
        checkpointItems: Array.isArray(block.checkpointItems) ? block.checkpointItems : [],
        requiresAllChecked: block.requiresAllChecked !== false,
        isBlockingPrerequisite: block.isBlockingPrerequisite === true,
        checkpointScore: Number(block.checkpointScore || blockScore || 0),
        xpReward: Number(block.xpReward || blockScore || 0),
        caseContext: block.caseContext || '',
        scenario: block.scenario || '',
        analysisMaterials: block.analysisMaterials || '',
        guidedQuestions: block.guidedQuestions || '',
        expectedAnswer: block.expectedAnswer || ''
      };
    }

    return {
      id: block.id || makeId('chap'),
      type: 'text',
      titre: block.title || `Leçon ${index + 1}`,
      contenu: block.content || block.instructions || '',
      mediaType: block.mediaType || 'image',
      mediaImage: block.mediaImage || '',
      mediaVideo: block.mediaVideo || '',
      durationMinutes: toPositiveMinutes(block.durationMinutes),
      questions: []
    };
  });
}

function getActiveBlock() {
  if (state.activeBlockId === 'course_info' || state.activeBlockId === 'objectives') return null;
  return state.course.learningBlocks.find((block) => block.id === state.activeBlockId) || null;
}

function getBlockMeta(type) {
  return BLOCK_TYPE_MAP.get(type) || { label: type || 'Bloc', subtitle: 'Activité', icon: '•' };
}

function mountShell() {
  const root = $('#sbi-course-editor-v2');
  if (!root) return;

  state.role = root.dataset.editorRole || document.body.dataset.editorRole || (location.pathname.includes('/admin/') ? 'admin' : 'teacher');

  cleanupEditorFloatingUi(root);

  root.innerHTML = `
    <div class="sbi-editor-shell">
      <section class="sbi-editor-page-head">
        <div class="sbi-editor-page-head__main">
          <a id="course-v2-back-library" class="sbi-editor-link-btn sbi-editor-btn--ghost" href="${getBackUrl()}" data-sbi-href="${getBackUrl()}">← Retour bibliothèque</a>
          <div class="sbi-editor-title-stack">
            <span class="sbi-role-pill">${state.role === 'admin' ? 'Admin · validation' : 'Professeur · production'}</span>
            <input id="course-v2-title" type="text" placeholder="Titre du cours" autocomplete="off">
          </div>
          <span id="course-v2-status" class="sbi-status-pill" data-tone="draft">Brouillon</span>
          <span class="sbi-mini-pill">V2 modulaire</span>
        </div>
        <div class="sbi-editor-actions">
          <span id="course-v2-save-state" class="sbi-status-line">Initialisation…</span>
          <button id="course-v2-preview" class="sbi-editor-btn" type="button">Prévisualiser</button>
          <button id="course-v2-save" class="sbi-editor-btn" type="button">Enregistrer</button>
          <button id="course-v2-reject" class="sbi-editor-btn sbi-editor-btn--danger" type="button" hidden>Refuser</button>
          <button id="course-v2-submit" class="sbi-editor-btn sbi-editor-btn--primary" type="button">${state.role === 'admin' ? 'Mettre en ligne' : 'Soumettre'}</button>
        </div>
      </section>

      <div id="course-v2-lock-banner" class="sbi-editor-lock-banner" hidden>
        Ce cours est soumis à validation. Il reste consultable, mais non modifiable tant que l’administration ne l’a pas validé ou refusé.
      </div>

      <div class="sbi-editor-grid">
        <aside class="sbi-editor-panel sbi-editor-left">
          <section class="sbi-editor-section">
            <div class="sbi-check-row" style="justify-content:space-between;">
              <div><h2 class="sbi-panel-title">Structure du cours</h2><p class="sbi-panel-subtitle">Clique pour éditer. L’ordre sera conservé.</p></div>
              <button id="course-v2-add-default" class="sbi-editor-btn sbi-editor-btn--tiny" type="button" title="Ajouter une leçon">+</button>
            </div>
            <ul id="course-v2-structure" class="sbi-course-structure"></ul>
          </section>
          <section class="sbi-editor-section sbi-left-preview-slot">
            <div id="course-v2-preview-card"></div>
          </section>
        </aside>

        <main class="sbi-editor-panel sbi-editor-main">
          <div id="course-v2-main"></div>
        </main>

        <aside class="sbi-editor-panel sbi-editor-right">
          <div id="course-v2-settings"></div>
        </aside>
      </div>

      <footer class="sbi-block-bank" data-editor-bank="fixed">
        <div><div class="sbi-block-bank-title">Banque de blocs</div><div class="sbi-block-bank-subtitle">Ajout rapide au cours, un bloc à la fois.</div></div>
        <div id="course-v2-bank" class="sbi-bank-chips"></div>
      </footer>
    </div>
  `;
  scheduleFixedBlockBankOffset();
}

function setStatus(message, tone = '') {
  const el = $('#course-v2-save-state');
  if (!el) return;
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function markDirty() {
  if (state.readOnly) return;
  state.dirty = true;
  setStatus('Modifications non enregistrées');
}

function normalizeBlockTitle(value = '') {
  return normalizeString(value).replace(/\s+/g, ' ');
}

function syncBlockTitleUi(value, sourceId = '') {
  const safeValue = normalizeBlockTitle(value);
  ['editor-course-bloc', 'settings-bloc', 'editor-course-bloc-select', 'settings-bloc-select'].forEach((id) => {
    if (id === sourceId) return;
    const field = document.getElementById(id);
    if (!field) return;
    if (field.tagName === 'SELECT') {
      const hasOption = Array.from(field.options || []).some((option) => option.value === safeValue);
      field.value = hasOption ? safeValue : '';
      return;
    }
    if (field.value !== safeValue) field.value = safeValue;
  });
}

function renderSharedBlockPicker(prefix, value = state.course.bloc, { allowCreate = true } = {}) {
  const safeValue = normalizeBlockTitle(value);
  const options = state.blockOptions.map((bloc) => {
    const selected = normalizeBlockTitle(bloc) === safeValue ? 'selected' : '';
    return `<option value="${escapeHtml(bloc)}" ${selected}>${escapeHtml(bloc)}</option>`;
  }).join('');

  const emptyText = state.blockOptions.length ? 'Choisir un bloc existant' : 'Aucun bloc enregistré pour cette sélection';

  if (!allowCreate) {
    return `
      <div class="sbi-shared-block-picker sbi-shared-block-picker--select-only">
        <select id="${prefix}-bloc-select" class="sbi-select" aria-label="Choisir un bloc partagé">
          <option value="">${escapeHtml(emptyText)}</option>
          ${options}
        </select>
      </div>
    `;
  }

  return `
    <div class="sbi-shared-block-picker">
      <input id="${prefix}-bloc" class="sbi-input" value="${escapeHtml(safeValue)}" placeholder="Ex : Module 3 · Animation">
      <select id="${prefix}-bloc-select" class="sbi-select" aria-label="Choisir un bloc partagé">
        <option value="">${escapeHtml(emptyText)}</option>
        ${options}
      </select>
      <button id="${prefix}-bloc-add" class="sbi-editor-btn sbi-editor-btn--tiny" type="button">+ Ajouter</button>
    </div>
  `;
}

function addLocalSharedBlockOption(rawValue = '') {
  const value = normalizeBlockTitle(rawValue || $('#editor-course-bloc')?.value || $('#settings-bloc')?.value);
  if (!value) {
    void openSbiAlert('Bloc partagé', 'Saisis d’abord un nom de bloc partagé.');
    return false;
  }

  const exists = state.blockOptions.some((option) => normalizeBlockTitle(option).toLowerCase() === value.toLowerCase());
  if (!exists) {
    state.blockOptions.push(value);
    state.blockOptions.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }

  state.course.bloc = value;
  syncBlockTitleUi(value);
  markDirty();
  setStatus('Bloc partagé ajouté au cours. Sauvegarde le cours pour le réutiliser dans cette formation.', 'success');
  renderMainEditor();
  renderSettings();
  bindSettingsInputs();
  return true;
}

async function navigateShellAware(href, { historyMode = 'push', source = 'course-editor-v2' } = {}) {
  const target = new URL(href, window.location.href);

  const isBackToLibrary = source.includes('back') && (
    target.pathname.endsWith('/teacher/mes-cours.html') ||
    target.pathname.endsWith('/admin/formations-cours.html')
  );

  if (isBackToLibrary) {
    try { activeAuthUnsubscribe?.(); } catch {}
    activeAuthUnsubscribe = null;
    try { unbindViewportBankResize(); } catch {}
    try { cleanupEditorFloatingUi(document.getElementById('sbi-course-editor-v2')); } catch {}
    if (activeBeforeUnloadHandler) {
      try { window.removeEventListener('beforeunload', activeBeforeUnloadHandler); } catch {}
      activeBeforeUnloadHandler = null;
    }
    state.dirty = false;
    target.searchParams.set('v', VERSION);
    window.location.assign(target.href);
    return true;
  }

  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(target.href, { historyMode, source });
      if (handled) return true;
    } catch (error) {
      console.warn('[SBI Course Editor V2] Navigation PJAX indisponible, fallback classique :', error);
    }
  }
  window.location.assign(target.href);
  return false;
}

function openSbiDialog({
  title = 'Confirmation',
  message = '',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  tone = 'default',
  showCancel = true
} = {}) {
  return new Promise((resolve) => {
    const previous = document.querySelector('.sbi-editor-dialog-backdrop');
    previous?.remove?.();

    const backdrop = document.createElement('div');
    backdrop.className = 'sbi-editor-dialog-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
      <div class="sbi-editor-dialog">
        <div class="sbi-editor-dialog__head">
          <h3 class="sbi-editor-dialog__title">${escapeHtml(title)}</h3>
        </div>
        <div class="sbi-editor-dialog__body">${escapeHtml(message)}</div>
        <div class="sbi-editor-dialog__actions">
          ${showCancel ? `<button class="sbi-editor-btn sbi-editor-dialog__cancel" type="button">${escapeHtml(cancelText)}</button>` : ''}
          <button class="sbi-editor-btn sbi-editor-btn--primary sbi-editor-dialog__confirm" data-tone="${escapeHtml(tone)}" type="button">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector('.sbi-editor-dialog__confirm')?.addEventListener('click', () => close(true));
    backdrop.querySelector('.sbi-editor-dialog__cancel')?.addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(false);
    });
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close(false);
    });

    document.body.appendChild(backdrop);
    backdrop.tabIndex = -1;
    backdrop.focus({ preventScroll: true });
  });
}

function openSbiAlert(title, message, { tone = 'default' } = {}) {
  return openSbiDialog({
    title,
    message,
    confirmText: 'OK',
    showCancel: false,
    tone
  });
}

function renderStructure() {
  const list = $('#course-v2-structure');
  if (!list) return;

  const staticItems = [
    { id: 'course_info', type: 'course_info', title: 'Course Info', static: true },
    { id: 'objectives', type: 'objectives', title: 'Objectifs', static: true }
  ];
  const items = [...staticItems, ...state.course.learningBlocks];

  list.innerHTML = items.map((item, index) => {
    const meta = getBlockMeta(item.type);
    const active = item.id === state.activeBlockId;
    const canDrag = !item.static && !state.readOnly;
    return `
      <li>
        <button class="sbi-structure-item" data-block-id="${escapeHtml(item.id)}" data-draggable-block-id="${canDrag ? escapeHtml(item.id) : ''}" data-active="${active ? 'true' : 'false'}" draggable="${canDrag ? 'true' : 'false'}" type="button">
          <span class="sbi-grip" title="${canDrag ? 'Glisser pour réordonner' : 'Élément fixe'}">⋮⋮</span>
          <span class="sbi-block-icon">${escapeHtml(meta.icon)}</span>
          <span><span class="sbi-block-name">${escapeHtml(item.title || meta.label)}</span><span class="sbi-block-type">${index + 1}. ${escapeHtml(meta.subtitle)}</span></span>
        </button>
      </li>`;
  }).join('');

  $all('[data-block-id]', list).forEach((button) => {
    button.addEventListener('click', () => {
      saveActiveEditorValues();
      state.activeBlockId = button.dataset.blockId;
      renderAll();
    });
  });

  bindStructureDragAndDrop(list);
}

function bindStructureDragAndDrop(list) {
  if (state.readOnly) return;
  const draggableItems = $all('[data-draggable-block-id]', list)
    .filter((button) => normalizeString(button.dataset.draggableBlockId));

  draggableItems.forEach((button) => {
    button.addEventListener('dragstart', (event) => {
      state.dragBlockId = button.dataset.draggableBlockId;
      button.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.dragBlockId);
    });

    button.addEventListener('dragend', () => {
      state.dragBlockId = '';
      $all('.sbi-structure-item.is-dragging, .sbi-structure-item.is-drag-over, .sbi-structure-item.is-drop-after', list)
        .forEach((item) => item.classList.remove('is-dragging', 'is-drag-over', 'is-drop-after'));
    });

    button.addEventListener('dragover', (event) => {
      const sourceId = state.dragBlockId;
      const targetId = button.dataset.draggableBlockId;
      if (!sourceId || sourceId === targetId) return;
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      button.classList.toggle('is-drop-after', insertAfter);
      button.classList.add('is-drag-over');
      event.dataTransfer.dropEffect = 'move';
    });

    button.addEventListener('dragleave', () => {
      button.classList.remove('is-drag-over', 'is-drop-after');
    });

    button.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain') || state.dragBlockId;
      const targetId = button.dataset.draggableBlockId;
      const rect = button.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      reorderLearningBlock(sourceId, targetId, { insertAfter });
    });
  });
}

function reorderLearningBlock(sourceId, targetId, { insertAfter = false } = {}) {
  if (state.readOnly) return;
  if (!sourceId || !targetId || sourceId === targetId) return;

  const blocks = state.course.learningBlocks;
  const fromIndex = blocks.findIndex((block) => block.id === sourceId);
  let toIndex = blocks.findIndex((block) => block.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = blocks.splice(fromIndex, 1);
  if (fromIndex < toIndex) toIndex -= 1;
  if (insertAfter) toIndex += 1;
  toIndex = Math.max(0, Math.min(blocks.length, toIndex));

  blocks.splice(toIndex, 0, moved);
  state.activeBlockId = sourceId;
  state.dragBlockId = '';
  markDirty();
  renderAll();
}

function renderAddControls() {
  const targets = [$('#course-v2-bank')].filter(Boolean);
  const addable = BLOCK_TYPES.filter((type) => !type.static);
  targets.forEach((target) => {
    target.innerHTML = addable.map((item) => `
      <button class="sbi-editor-btn" type="button" data-add-block-type="${escapeHtml(item.type)}">
        <span class="sbi-block-icon">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}
      </button>
    `).join('');
    $all('[data-add-block-type]', target).forEach((button) => {
      button.addEventListener('click', () => addBlock(button.dataset.addBlockType));
    });
  });

  scheduleFixedBlockBankOffset();

  const defaultButton = $('#course-v2-add-default');
  if (defaultButton && defaultButton.dataset.sbiAddBound !== 'true') {
    defaultButton.dataset.sbiAddBound = 'true';
    defaultButton.addEventListener('click', () => addBlock('lesson'));
  }
}

function addBlock(type) {
  if (state.readOnly) {
    void openSbiAlert('Cours verrouillé', 'Ce cours est soumis à validation et ne peut pas être modifié pour le moment.');
    return;
  }
  saveActiveEditorValues();
  const block = createDefaultBlock(type);
  state.course.learningBlocks.push(block);
  state.activeBlockId = block.id;
  markDirty();
  renderAll();
}

async function deleteActiveBlock() {
  if (state.readOnly) {
    await openSbiAlert('Cours verrouillé', 'Ce cours est soumis à validation et ne peut pas être modifié pour le moment.');
    return;
  }
  const active = getActiveBlock();
  if (!active) return;
  const confirmed = await openSbiDialog({
    title: 'Supprimer ce bloc ?',
    message: `Le bloc “${active.title || getBlockMeta(active.type).label}” sera retiré du cours. Cette action sera appliquée après sauvegarde.`,
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
    tone: 'danger'
  });
  if (!confirmed) return;
  clearPendingMediaForChapter(active.id);
  state.course.learningBlocks = state.course.learningBlocks.filter((block) => block.id !== active.id);
  state.activeBlockId = state.course.learningBlocks[0]?.id || 'course_info';
  markDirty();
  renderAll();
}

function duplicateActiveBlock() {
  if (state.readOnly) {
    void openSbiAlert('Cours verrouillé', 'Ce cours est soumis à validation et ne peut pas être modifié pour le moment.');
    return;
  }
  const active = getActiveBlock();
  if (!active) return;
  const clone = JSON.parse(JSON.stringify(active));
  clone.id = makeId(active.type);
  clone.title = `${active.title || getBlockMeta(active.type).label} (copie)`;
  state.course.learningBlocks.push(clone);
  state.activeBlockId = clone.id;
  markDirty();
  renderAll();
}


function syncQuillToActiveBlock() {
  if (!state.quill || !state.quillBlockId) return;
  const block = state.course.learningBlocks.find((item) => item.id === state.quillBlockId);
  if (!block) return;
  const html = state.quill.root?.innerHTML || '';
  block.content = html === '<p><br></p>' ? '' : html;
  const hidden = $('#block-content');
  if (hidden) hidden.value = block.content;
}

function resetQuillInstance() {
  syncQuillToActiveBlock();
  state.quill = null;
  state.quillBlockId = '';
  lastQuillSelection = null;
}

function isRichTextBlock(block = {}) {
  return block?.type === 'lesson';
}

function initLegacyQuillForActiveBlock(block) {
  const container = $('#block-content-quill');
  const hidden = $('#block-content');
  if (!container || !hidden || !isRichTextBlock(block)) return;

  if (!window.Quill) {
    container.innerHTML = '<div class="sbi-editor-v2-quill-missing">Éditeur riche indisponible. Le contenu reste sauvegardé en texte.</div>';
    return;
  }

  state.quill = new window.Quill(container, {
    theme: 'snow',
    modules: {
      toolbar: {
        container: QUILL_TOOLBAR_OPTIONS,
        handlers: {
          size(value) {
            const quill = this.quill;
            const currentRange = quill.getSelection();
            const range = currentRange && currentRange.length > 0 ? currentRange : lastQuillSelection;

            if (range && range.length > 0) {
              quill.focus();
              quill.setSelection(range.index, range.length, 'silent');
              quill.formatText(range.index, range.length, 'size', value || false, 'user');
              quill.setSelection(range.index, range.length, 'silent');
              rememberQuillSelection(range);
            }
          }
        }
      }
    }
  });

  state.quillBlockId = block.id;
  state.quill.root.innerHTML = block.content || '';
  hidden.value = block.content || '';

  state.quill.on('selection-change', (range) => rememberQuillSelection(range));
  state.quill.on('text-change', () => {
    syncQuillToActiveBlock();
    markDirty();
    renderPreview();
  });

  const toolbar = state.quill.getModule('toolbar')?.container;
  if (toolbar) {
    ['mousedown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      toolbar.addEventListener(eventName, () => {
        rememberQuillSelection(state.quill?.getSelection?.());
      }, true);
    });
    applyQuillTooltips(toolbar);
    installSbiPresetPicker(state.quill);
  }
}


function getActiveLessonBlock() {
  const block = getActiveBlock();
  return block && block.type === 'lesson' ? block : null;
}

function setMediaZonesVisibility(mediaType = 'image') {
  const safeType = mediaType === 'video' ? 'video' : 'image';
  const imageZone = $('#media-image-zone');
  const videoZone = $('#media-video-zone');
  if (imageZone) imageZone.style.display = safeType === 'image' ? 'grid' : 'none';
  if (videoZone) videoZone.style.display = safeType === 'video' ? 'grid' : 'none';
}

function setupLessonMediaControls(block) {
  if (!block || block.type !== 'lesson') return;
  block.mediaType = block.mediaType === 'video' ? 'video' : 'image';
  block.mediaImage = block.mediaImage || '';
  block.mediaVideo = block.mediaVideo || '';

  setMediaZonesVisibility(block.mediaType);
  restoreCurrentMediaPreview(block.id, block);

  $all('input[name="media_type"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      block.mediaType = input.value === 'video' ? 'video' : 'image';
      setMediaZonesVisibility(block.mediaType);
      restoreCurrentMediaPreview(block.id, block);
      markDirty();
      renderPreview();
    });
  });

  setupV2DropZone('drop-zone-image', 'chapter-image-upload', 'image', block);
  setupV2DropZone('drop-zone-video', 'chapter-video-upload', 'video', block);
}

function setupV2DropZone(dropZoneId, inputId, type, block) {
  const dropZone = document.getElementById(dropZoneId);
  const input = document.getElementById(inputId);
  if (!dropZone || !input || !block) return;
  if (state.readOnly) return;

  const openPicker = () => input.click();
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPicker();
  });

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });

  dropZone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
  });

  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleV2MediaFile(type, file, block, input);
  });

  input.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handleV2MediaFile(type, file, block, input);
  });
}

function handleV2MediaFile(type, file, block, input = null) {
  if (state.readOnly) return;
  if (!file || !block?.id) return;

  try {
    if (type === 'video') {
      setPendingVideoFile(block.id, file);
      block.mediaType = 'video';
    } else {
      setPendingImageFile(block.id, file);
      block.mediaType = 'image';
    }

    if (input) input.value = '';
    setMediaZonesVisibility(block.mediaType);
    restoreCurrentMediaPreview(block.id, block);
    markDirty();
    renderPreview();
  } catch (error) {
    if (input) input.value = '';
    void openSbiAlert('Média impossible à ajouter', error.message || 'Vérifie le format du fichier.', { tone: 'danger' });
  }
}

function inferResourceTypeFromFile(file) {
  const mime = file?.type || '';
  const name = String(file?.name || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'file';
}

function refreshResourceFileStatus(block) {
  const status = $('#resource-file-status');
  if (status && block) status.innerHTML = renderResourceFileStatus(block);
}

function handleResourceFile(file, block, input = null) {
  if (state.readOnly) return;
  if (!file || !block?.id) return;

  try {
    setPendingResourceFile(block.id, file);
    block.resourceUrl = '';
    block.resourceStoragePath = '';
    block.resourceFileName = file.name || '';
    block.resourceMimeType = file.type || 'application/octet-stream';
    block.resourceSize = file.size || 0;
    block.resourceOriginalSize = file.size || 0;
    block.resourceCompressed = file.type?.startsWith('image/') === true;
    block.resourceType = inferResourceTypeFromFile(file);

    if (input) input.value = '';
    const typeSelect = $('[data-block-field="resourceType"]');
    if (typeSelect) typeSelect.value = block.resourceType;
    refreshResourceFileStatus(block);
    markDirty();
    renderPreview();
  } catch (error) {
    if (input) input.value = '';
    void openSbiAlert('Fichier ressource impossible a ajouter', error.message || 'Verifie le format du fichier.', { tone: 'danger' });
  }
}

function clearResourceFile(block) {
  if (state.readOnly || !block?.id) return;
  clearPendingMediaForChapter(block.id);
  block.resourceUrl = '';
  block.resourceStoragePath = '';
  block.resourceFileName = '';
  block.resourceMimeType = '';
  block.resourceSize = 0;
  block.resourceOriginalSize = 0;
  block.resourceCompressed = false;
  block.resourceType = 'link';

  const typeSelect = $('[data-block-field="resourceType"]');
  if (typeSelect) typeSelect.value = 'link';
  const urlField = $('[data-block-field="resourceUrl"]');
  if (urlField) urlField.value = '';
  refreshResourceFileStatus(block);
  markDirty();
  renderPreview();
}

function setupResourceFileControls(block) {
  if (!block || block.type !== 'resource') return;
  const dropZone = $('#resource-file-dropzone');
  const input = $('#resource-file-upload');
  const clearButton = $('#resource-file-clear');
  if (clearButton && !state.readOnly) clearButton.addEventListener('click', () => clearResourceFile(block));
  if (!dropZone || !input || state.readOnly) return;

  const openPicker = () => input.click();
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPicker();
  });
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });
  dropZone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
  });
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleResourceFile(file, block, input);
  });
  input.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handleResourceFile(file, block, input);
  });
}

function syncActiveLessonMediaFromDom() {
  const block = getActiveLessonBlock();
  if (!block) return;
  const mediaChecked = document.querySelector('input[name="media_type"]:checked');
  if (mediaChecked) block.mediaType = mediaChecked.value === 'video' ? 'video' : 'image';
  syncChapterMediaFromDom(block);
}

function syncUploadedMediaBackToBlocks(chapitres = []) {
  chapitres.forEach((chapter) => {
    const block = state.course.learningBlocks.find((item) => item.id === chapter.id);
    if (!block) return;
    block.mediaType = blockHasOwnField(chapter, 'mediaType') ? (chapter.mediaType || 'image') : (block.mediaType || 'image');
    block.mediaImage = blockHasOwnField(chapter, 'mediaImage') ? (chapter.mediaImage || '') : (block.mediaImage || '');
    block.mediaVideo = blockHasOwnField(chapter, 'mediaVideo') ? (chapter.mediaVideo || '') : (block.mediaVideo || '');
    block.resourceUrl = blockHasOwnField(chapter, 'resourceUrl') ? (chapter.resourceUrl || '') : (block.resourceUrl || '');
    block.resourceStoragePath = blockHasOwnField(chapter, 'resourceStoragePath') ? (chapter.resourceStoragePath || '') : (block.resourceStoragePath || '');
    block.resourceType = blockHasOwnField(chapter, 'resourceType') ? (chapter.resourceType || '') : (block.resourceType || '');
    block.resourceFileName = blockHasOwnField(chapter, 'resourceFileName') ? (chapter.resourceFileName || '') : (block.resourceFileName || '');
    block.resourceMimeType = blockHasOwnField(chapter, 'resourceMimeType') ? (chapter.resourceMimeType || '') : (block.resourceMimeType || '');
    block.resourceSize = Number(blockHasOwnField(chapter, 'resourceSize') ? chapter.resourceSize || 0 : block.resourceSize || 0);
    block.resourceOriginalSize = Number(blockHasOwnField(chapter, 'resourceOriginalSize') ? chapter.resourceOriginalSize || 0 : block.resourceOriginalSize || 0);
    block.resourceCompressed = blockHasOwnField(chapter, 'resourceCompressed') ? chapter.resourceCompressed === true : block.resourceCompressed === true;
  });
}

function renderMainEditor() {
  const main = $('#course-v2-main');
  if (!main) return;

  resetQuillInstance();
  let activeBlockForQuill = null;

  if (state.activeBlockId === 'course_info') {
    main.innerHTML = renderCourseInfoEditor();
  } else if (state.activeBlockId === 'objectives') {
    main.innerHTML = renderObjectivesEditor();
  } else {
    const block = getActiveBlock();
    activeBlockForQuill = block;
    main.innerHTML = block ? renderBlockEditor(block) : `<div class="sbi-empty-state">Ajoute un bloc pour commencer le cours.</div>`;
  }

  bindEditorInputs();
  initLegacyQuillForActiveBlock(activeBlockForQuill);
}

function renderCourseInfoEditor() {
  const computedDuration = updateComputedCourseDuration();
  return `
    <div class="sbi-block-editor-header">
      <div><h2 class="sbi-panel-title">Informations du cours</h2><p class="sbi-panel-subtitle">Base commune admin/prof. Sauvegarde compatible ancien viewer.</p></div>
      <span class="sbi-mini-pill">${VERSION}</span>
    </div>
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre du cours</label><input id="editor-course-title" class="sbi-input" value="${escapeHtml(state.course.title)}" placeholder="Ex : Management des risques en animation"></div>
      <div class="sbi-field"><label>Formation(s)</label><div id="editor-formations" class="sbi-check-row">${renderFormationChecks()}</div><small>La formation définit la bibliothèque d’accès et le partage du cours. Elle ne remplace pas le Cursus ni la Promotion.</small></div>

      <section class="sbi-course-creation-guide" aria-label="Champs nécessaires à la création d’un cours">
        <div class="sbi-guide-head">
          <span class="sbi-guide-kicker">Création de cours</span>
          <h3>Champs à renseigner avant validation</h3>
          <p>Cette zone sert de pense-bête pour créer un cours exploitable dans une formation, puis réutilisable dans un cursus et une promotion.</p>
        </div>
        <div class="sbi-guide-grid">
          <article class="sbi-guide-card">
            <strong>1. Identification</strong>
            <ul>
              <li>Titre clair du cours</li>
              <li>Formation(s) concernée(s)</li>
              <li>Bloc partagé / module pédagogique</li>
              <li>Durée globale estimée calculée automatiquement</li>
            </ul>
          </article>
          <article class="sbi-guide-card">
            <strong>2. Cadrage pédagogique</strong>
            <ul>
              <li>Objectifs du cours</li>
              <li>Compétence principale</li>
              <li>Preuve Qualiopi si le contenu sert d’élément probant</li>
              <li>Règle de validation et seuil attendu</li>
            </ul>
          </article>
          <article class="sbi-guide-card">
            <strong>3. Structure du contenu</strong>
            <ul>
              <li>Leçons avec texte riche Quill</li>
              <li>Image ou vidéo par leçon si nécessaire</li>
              <li>QCM / texte à trous / ressource / devoir / checkpoint</li>
              <li>Ordre des blocs via drag & drop</li>
            </ul>
          </article>
        </div>
        <div class="sbi-guide-flow">
          <span>Formation = bibliothèque</span>
          <span>Cursus = ordre pédagogique</span>
          <span>Promotion = dates réelles</span>
          <span>Cours = contenu modulaire</span>
        </div>
      </section>

      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Bloc partagé</label>${renderSharedBlockPicker('editor-course', state.course.bloc)}<small>Sélectionne un bloc existant ou saisis un nouveau nom puis clique Ajouter. Après sauvegarde, il sera proposé pour les cours de la même formation.</small></div>
        <div class="sbi-field"><label>Durée estimée globale (min)</label><small>Calcul automatique : somme des timers minimum des blocs.</small><input id="editor-course-duration" class="sbi-input" type="number" min="0" step="1" value="${computedDuration}" readonly aria-readonly="true"></div>
      </div>
      <div class="sbi-empty-state">Cette page prépare le contenu du cours. Le rattachement au cursus, l’ordre du programme et les dates restent gérés dans Cursus / Promotions.</div>
    </div>
  `;
}

function renderFormationChecks() {
  if (!state.formations.length) return '<span class="sbi-panel-subtitle">Aucune formation accessible.</span>';
  return state.formations.map((formation) => {
    const checked = state.selectedFormationIds.includes(formation.id) ? 'checked' : '';
    return `<label><input type="checkbox" class="editor-formation-check" value="${escapeHtml(formation.id)}" ${checked}>${escapeHtml(formation.titre || formation.title || formation.id)}</label>`;
  }).join('');
}

function renderObjectivesEditor() {
  return `
    <div class="sbi-block-editor-header">
      <div><h2 class="sbi-panel-title">Objectifs pédagogiques</h2><p class="sbi-panel-subtitle">Prépare Qualiopi, compétences et progression.</p></div>
    </div>
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Objectifs du cours</label><textarea id="editor-course-objectives" class="sbi-textarea" placeholder="À la fin du cours, l’apprenant sera capable de…">${escapeHtml(state.course.objectives)}</textarea></div>
      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Compétence principale</label><input id="editor-course-competency" class="sbi-input" value="${escapeHtml(state.course.competency)}" placeholder="Ex : Encadrer un groupe"></div>
        <div class="sbi-field"><label>Preuve Qualiopi</label><select id="editor-course-qualiopi" class="sbi-select"><option value="">Non renseignée</option>${renderQualiopiEvidenceOptions(state.course.qualiopiEvidence)}</select>${renderQualiopiEvidenceLegend(state.course.qualiopiEvidence)}</div>
      </div>
    </div>
  `;
}

function renderSelectOption(value, selectedValue) {
  const selected = value === selectedValue ? 'selected' : '';
  return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(value)}</option>`;
}

function renderQualiopiEvidenceOptions(selectedValue) {
  return QUALIOPI_EVIDENCE_OPTIONS
    .map((option) => renderSelectOption(option.value, selectedValue))
    .join('');
}

function renderQualiopiEvidenceLegend(selectedValue = '') {
  return `
    <div class="sbi-qualiopi-legend">
      ${QUALIOPI_EVIDENCE_OPTIONS.map((option) => `
        <div class="sbi-qualiopi-legend__row ${option.value === selectedValue ? 'is-selected' : ''}" data-qualiopi-value="${escapeHtml(option.value)}">
          <strong>${escapeHtml(option.title)}</strong>
          <span>${escapeHtml(option.help)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function syncQualiopiLegendSelection(select) {
  const field = select?.closest?.('.sbi-field');
  if (!field) return;
  field.querySelectorAll('[data-qualiopi-value]').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.qualiopiValue === select.value);
  });
}

function renderBlockEditor(block) {
  const meta = getBlockMeta(block.type);
  return `
    <div class="sbi-block-editor-header">
      <div><h2 class="sbi-panel-title">${escapeHtml(meta.label)}</h2><p class="sbi-panel-subtitle">${escapeHtml(meta.subtitle)} · ID ${escapeHtml(block.id)}</p></div>
      <div class="sbi-check-row">
        <button id="editor-duplicate-block" class="sbi-editor-btn sbi-editor-btn--tiny" type="button">Dupliquer</button>
        <button id="editor-delete-block" class="sbi-editor-btn sbi-editor-btn--tiny sbi-editor-btn--danger" type="button">Supprimer</button>
      </div>
    </div>
    ${block.type === 'fill_blank' ? renderFillBlankEditor(block) : ''}
    ${block.type === 'quiz' ? renderQuizEditor(block) : ''}
    ${PEDAGOGIC_BLOCK_TYPES.has(block.type) ? renderPedagogicBlockEditor(block) : ''}
    ${!['fill_blank','quiz'].includes(block.type) && !PEDAGOGIC_BLOCK_TYPES.has(block.type) ? renderGenericBlockEditor(block) : ''}
  `;
}

function renderGenericBlockEditor(block) {
  const isLesson = block.type === 'lesson';
  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre du bloc</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title)}"></div>
      <div class="sbi-field"><label>Consignes</label><input id="block-instructions" class="sbi-input" value="${escapeHtml(block.instructions || '')}" placeholder="Instruction courte pour l’élève"></div>
      ${isLesson ? renderLessonMediaEditor(block) : ''}
      <div class="sbi-field sbi-field--quill"><label>Contenu</label><small>Éditeur identique au legacy : taille, gras, italique, couleurs, listes, alignement, liens, images et vidéos.</small><textarea id="block-content" class="sbi-quill-hidden" aria-hidden="true">${escapeHtml(block.content || '')}</textarea><div id="block-content-quill" class="sbi-quill-editor"></div></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Timer minimum (min)</label><small>Temps minimum avant validation de cette page côté élève.</small><input id="block-duration" class="sbi-input" type="number" min="0" step="1" value="${Number(block.durationMinutes || 0)}"></div><div class="sbi-field"><label>Inclure dans le cours</label><select id="block-visible" class="sbi-select"><option value="true" ${block.visibleInProgram !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.visibleInProgram === false ? 'selected' : ''}>Non</option></select></div></div>
    </div>
  `;
}

function renderPedagogicBlockEditor(block) {
  if (block.type === 'resource') return renderResourceBlockEditor(block);
  if (block.type === 'assignment') return renderAssignmentBlockEditor(block);
  if (block.type === 'checkpoint') return renderCheckpointBlockEditor(block);
  if (block.type === 'case_study') return renderCaseStudyBlockEditor(block);
  return renderGenericBlockEditor(block);
}

function renderPedagogicFooter(block) {
  return `
    <div class="sbi-two-cols">
      <div class="sbi-field"><label>Timer minimum (min)</label><small>Temps minimum avant validation de cette page côté élève.</small><input id="block-duration" class="sbi-input" type="number" min="0" step="1" value="${Number(block.durationMinutes || 0)}"></div>
      <div class="sbi-field"><label>Inclure dans le cours</label><select id="block-visible" class="sbi-select"><option value="true" ${block.visibleInProgram !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.visibleInProgram === false ? 'selected' : ''}>Non</option></select></div>
    </div>
  `;
}

function renderResourceFileStatus(block) {
  const pending = getPendingResourceFileMeta(block.id);
  const name = pending?.name || block.resourceFileName || '';
  const type = pending?.type || block.resourceMimeType || '';
  const size = Number(pending?.size || block.resourceSize || 0);
  const compressed = pending ? pending.compressed : block.resourceCompressed === true;
  const url = pending?.previewUrl || block.resourceUrl || '';

  if (!name && !url) {
    return '<div class="sbi-resource-file-status sbi-resource-file-status--empty">Aucun fichier selectionne.</div>';
  }

  const link = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>`
    : '';

  return `
    <div class="sbi-resource-file-status">
      <strong>${escapeHtml(name || 'Fichier ressource')}</strong>
      <span>${escapeHtml(type || 'type inconnu')}${size ? ` - ${formatBytes(size)}` : ''}${compressed ? ' - image compressee WebP' : ''}</span>
      <div class="sbi-resource-file-actions">
        ${link}
        <button id="resource-file-clear" type="button" class="sbi-editor-btn sbi-editor-btn--ghost">Supprimer le fichier</button>
      </div>
    </div>
  `;
}

function renderResourceUploadEditor(block) {
  return `
    <div class="sbi-field sbi-field--media">
      <label>Fichier ressource</label>
      <div id="resource-file-dropzone" class="sbi-media-dropzone sbi-resource-dropzone" role="button" tabindex="0">
        <strong>Ajouter un fichier</strong>
        <span>Glisse un fichier ici ou clique pour parcourir</span>
        <small>Images compressees en WebP a la sauvegarde. PDF, documents et autres fichiers sont envoyes dans Storage.</small>
        <input type="file" id="resource-file-upload" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,video/*,audio/*" hidden>
      </div>
      <div id="resource-file-status">${renderResourceFileStatus(block)}</div>
    </div>
  `;
}

function renderResourceBlockEditor(block) {
  return `
    <div class="sbi-editor-form sbi-editor-form--pedagogic">
      <div class="sbi-field"><label>Titre de la ressource</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Consigne de consultation</label><textarea id="block-instructions" class="sbi-textarea" data-block-field="instructions">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Type de ressource</label><select class="sbi-select" data-block-field="resourceType">${renderSelectOption('link', block.resourceType || 'link')} ${renderSelectOption('pdf', block.resourceType)} ${renderSelectOption('video', block.resourceType)} ${renderSelectOption('image', block.resourceType)} ${renderSelectOption('file', block.resourceType)}</select></div>
        <div class="sbi-field"><label>Lien ou URL du support</label><input class="sbi-input" data-block-field="resourceUrl" value="${escapeHtml(block.resourceUrl || '')}" placeholder="https://... ou URL Storage apres upload"></div>
      </div>
      ${renderResourceUploadEditor(block)}
      <div class="sbi-field"><label>Description courte</label><textarea class="sbi-textarea" data-block-field="resourceDescription">${escapeHtml(getPedagogicFieldValue(block, 'resourceDescription'))}</textarea></div>
      <div class="sbi-field"><label>A observer / retenir</label><textarea class="sbi-textarea" data-block-field="consultationInstruction">${escapeHtml(block.consultationInstruction || '')}</textarea></div>
      ${renderPedagogicFooter(block)}
    </div>
  `;
}

function renderAssignmentBlockEditor(block) {
  return `
    <div class="sbi-editor-form sbi-editor-form--pedagogic">
      <div class="sbi-field"><label>Titre du devoir</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Consigne de travail</label><textarea id="block-instructions" class="sbi-textarea" data-block-field="instructions">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-field"><label>Travail demandé</label><textarea class="sbi-textarea sbi-textarea--large" data-block-field="assignmentPrompt">${escapeHtml(getPedagogicFieldValue(block, 'assignmentPrompt'))}</textarea></div>
      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Livrable attendu</label><select class="sbi-select" data-block-field="deliverableType">${renderSelectOption('text', block.deliverableType || 'text')} ${renderSelectOption('file', block.deliverableType)} ${renderSelectOption('link', block.deliverableType)} ${renderSelectOption('mixed', block.deliverableType)}</select></div>
        <div class="sbi-field"><label>Délai</label><select class="sbi-select" data-block-field="duePolicy">${renderSelectOption('promotion_date', block.duePolicy || 'promotion_date')} ${renderSelectOption('free', block.duePolicy)} ${renderSelectOption('manual_deadline', block.duePolicy)}</select></div>
      </div>
      <div class="sbi-field"><label>Critères d’évaluation</label><textarea class="sbi-textarea" data-block-field="evaluationCriteria">${escapeHtml(block.evaluationCriteria || '')}</textarea></div>
      <div class="sbi-field"><label>Correction autonome affichée</label><textarea class="sbi-textarea" data-block-field="assignmentCorrection" placeholder="Correction, exemple de réponse ou grille d'auto-correction">${escapeHtml(block.assignmentCorrection || '')}</textarea></div>
      <div class="sbi-autonomous-correction-note">
        <strong>Correction autonome active</strong>
        <span>L'élève travaille sur son support puis consulte la correction dans le viewer avec le bouton d'auto-évaluation.</span>
      </div>
      ${renderPedagogicFooter(block)}
    </div>
  `;
}

function renderCheckpointItemsPreview(block) {
  const items = getCheckpointItemsForBlock(block);
  if (!items.length) {
    return '<div class="sbi-checkpoint-items-empty">Ajoute des blocs avant ce checkpoint pour generer le checkup final.</div>';
  }

  return `
    <div class="sbi-checkpoint-items-preview">
      ${items.map((item, index) => `
        <label>
          <input type="checkbox" disabled>
          <span>${index + 1}. ${escapeHtml(item.title)}</span>
          <small>${escapeHtml(item.label || getBlockMeta(item.type).label)}</small>
        </label>
      `).join('')}
    </div>
  `;
}

function renderCheckpointBlockEditor(block) {
  return `
    <div class="sbi-editor-form sbi-editor-form--pedagogic">
      <div class="sbi-field"><label>Titre du checkpoint</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Consigne courte</label><textarea id="block-instructions" class="sbi-textarea" data-block-field="instructions">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-field"><label>Objectif du checkup final</label><textarea class="sbi-textarea" data-block-field="checkpointGoal">${escapeHtml(getPedagogicFieldValue(block, 'checkpointGoal'))}</textarea></div>
      <div class="sbi-field">
        <label>Etapes precedentes a cocher</label>
        <small>Cette liste est calculee automatiquement avec tous les blocs visibles places avant ce checkpoint.</small>
        ${renderCheckpointItemsPreview(block)}
      </div>
      <div class="sbi-autonomous-correction-note sbi-autonomous-correction-note--xp">
        <strong>Validation checkpoint : +${getBlockScore(block)} XP</strong>
        <span>Ce bonus est ajoute au score total du cours et a l'XP eleve lors de la validation du checkpoint.</span>
      </div>
      <label class="sbi-check-row sbi-check-row--box"><input type="checkbox" data-block-field="requiresAllChecked" data-block-boolean="true" checked disabled> Toutes les cases doivent etre cochees pour valider les acquis</label>
      <div class="sbi-field"><label>Resultat attendu</label><textarea class="sbi-textarea" data-block-field="expectedResult">${escapeHtml(block.expectedResult || '')}</textarea></div>
      ${renderPedagogicFooter(block)}
    </div>
  `;
}

function renderCaseStudyBlockEditor(block) {
  return `
    <div class="sbi-editor-form sbi-editor-form--pedagogic">
      <div class="sbi-field"><label>Titre de l’étude de cas</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Consigne</label><textarea id="block-instructions" class="sbi-textarea" data-block-field="instructions">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-field"><label>Contexte / situation initiale</label><textarea class="sbi-textarea" data-block-field="caseContext">${escapeHtml(block.caseContext || '')}</textarea></div>
      <div class="sbi-field"><label>Scénario</label><textarea class="sbi-textarea sbi-textarea--large" data-block-field="scenario">${escapeHtml(getPedagogicFieldValue(block, 'scenario'))}</textarea></div>
      <div class="sbi-field"><label>Documents ou éléments à analyser</label><textarea class="sbi-textarea" data-block-field="analysisMaterials">${escapeHtml(block.analysisMaterials || '')}</textarea></div>
      <div class="sbi-field"><label>Questions guidées</label><textarea class="sbi-textarea" data-block-field="guidedQuestions" placeholder="Une question par ligne">${escapeHtml(block.guidedQuestions || '')}</textarea></div>
      <div class="sbi-field"><label>Réponse attendue / grille de correction</label><textarea class="sbi-textarea" data-block-field="expectedAnswer">${escapeHtml(block.expectedAnswer || '')}</textarea></div>
      <div class="sbi-autonomous-correction-note">
        <strong>Correction autonome active</strong>
        <span>L'élève travaille sur son support puis consulte la correction dans le viewer avec le bouton d'auto-évaluation.</span>
      </div>
      ${renderPedagogicFooter(block)}
    </div>
  `;
}

function renderLessonMediaEditor(block) {
  const mediaType = block.mediaType === 'video' ? 'video' : 'image';
  return `
    <div class="sbi-field sbi-field--media">
      <label>Média de la leçon</label>
      <div class="sbi-media-type-row" role="radiogroup" aria-label="Type de média">
        <label><input type="radio" name="media_type" value="image" ${mediaType === 'image' ? 'checked' : ''}> Image</label>
        <label><input type="radio" name="media_type" value="video" ${mediaType === 'video' ? 'checked' : ''}> Vidéo</label>
      </div>
      <div id="media-image-zone" class="sbi-media-zone" data-media-zone="image" style="display:${mediaType === 'image' ? 'grid' : 'none'};">
        <div class="sbi-media-dropzone" id="drop-zone-image" role="button" tabindex="0">
          <strong>Image de leçon</strong>
          <span>Glisse une image ici ou clique pour parcourir</span>
          <small>Comme legacy : l’image sera compressée et envoyée dans Storage à la sauvegarde.</small>
          <input type="file" id="chapter-image-upload" accept="image/*" hidden>
        </div>
        <input type="hidden" id="chapter-image-base64" value="${escapeHtml(block.mediaImage || '')}">
        <img id="chapter-image-preview" class="sbi-media-preview sbi-media-preview--image" alt="Aperçu image" style="display:none;">
      </div>
      <div id="media-video-zone" class="sbi-media-zone" data-media-zone="video" style="display:${mediaType === 'video' ? 'grid' : 'none'};">
        <div class="sbi-media-dropzone" id="drop-zone-video" role="button" tabindex="0">
          <strong>Vidéo de leçon</strong>
          <span>Glisse une vidéo ici ou clique pour parcourir</span>
          <small>MP4/WebM recommandé. Le fichier sera envoyé dans Storage à la sauvegarde.</small>
          <input type="file" id="chapter-video-upload" accept="video/mp4,video/webm,video/*" hidden>
        </div>
        <input type="hidden" id="chapter-video-base64" value="${escapeHtml(block.mediaVideo || '')}">
        <video id="chapter-video-preview" class="sbi-media-preview sbi-media-preview--video" controls style="display:none;"></video>
      </div>
    </div>
  `;
}

function renderFillBlankRowsHtml(block) {
  return normalizeFillBlankRows(block).map((blank, index) => `
    <tr data-blank-row="${escapeHtml(blank.id)}">
      <td>${index + 1}</td>
      <td><input class="sbi-input fib-token" value="${escapeHtml(blank.token)}"></td>
      <td><input class="sbi-input fib-answers" value="${escapeHtml(blank.answers)}" placeholder="Réponses séparées par ;"></td>
      <td><input class="sbi-input fib-points" type="number" min="0" step="1" value="${Number(blank.points || 1)}"></td>
      <td><button class="sbi-editor-btn sbi-editor-btn--tiny sbi-editor-btn--danger" type="button" data-delete-blank="${escapeHtml(blank.id)}">×</button></td>
    </tr>
  `).join('');
}

function renderFillBlankEditor(block) {
  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Instructions</label><div class="sbi-rich-toolbar"><span>Paragraphe</span><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">B</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">I</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">Liste</button></div><textarea id="block-instructions" class="sbi-textarea">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-field"><label>Texte à compléter</label><small>Utilise [[mot attendu]] pour créer un trou.</small><div class="sbi-resize-field"><textarea id="fib-prompt" class="sbi-textarea sbi-textarea--fillblank">${escapeHtml(block.prompt || '')}</textarea></div><div id="fib-rendered-preview" class="sbi-token-box">${renderFillBlankPreviewText(block)}</div></div>
      <div class="sbi-field"><label>Réponses et paramètres des blancs</label><table class="sbi-table"><thead><tr><th>#</th><th>Texte / élément</th><th>Réponses acceptées</th><th>Points</th><th></th></tr></thead><tbody id="fib-blank-rows">${renderFillBlankRowsHtml(block)}</tbody></table><div><button id="fib-add-blank" class="sbi-editor-btn sbi-editor-btn--tiny" type="button">+ Ajouter un blanc</button></div></div>
      <div class="sbi-three-cols"><div class="sbi-field"><label>Score</label><select id="fib-scoring-mode" class="sbi-select"><option value="per_blank" ${block.scoringMode !== 'global' ? 'selected' : ''}>Par blanc</option><option value="global" ${block.scoringMode === 'global' ? 'selected' : ''}>Global</option></select></div><div class="sbi-field"><label>Tentatives</label><input id="fib-max-attempts" class="sbi-input" type="number" min="1" value="${Number(block.maxAttempts || 2)}"></div><div class="sbi-field"><label>Afficher réponses</label><select id="fib-show-answers" class="sbi-select"><option value="true" ${block.showAnswersAtEnd !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.showAnswersAtEnd === false ? 'selected' : ''}>Non</option></select></div></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Feedback bonne réponse</label><textarea id="fib-feedback-correct" class="sbi-textarea">${escapeHtml(block.feedbackCorrect || '')}</textarea></div><div class="sbi-field"><label>Feedback incorrect</label><textarea id="fib-feedback-incorrect" class="sbi-textarea">${escapeHtml(block.feedbackIncorrect || '')}</textarea></div></div>
    </div>
  `;
}

function createDefaultQuizQuestion() {
  return {
    id: makeId('question'),
    question: '',
    options: ['', ''],
    correctIndices: [0],
    points: 1
  };
}

function normalizeQuizQuestions(block) {
  if (!block) return [];
  if (!Array.isArray(block.questions) || !block.questions.length) {
    block.questions = [createDefaultQuizQuestion()];
  }

  block.questions = block.questions.map((question) => {
    const options = Array.isArray(question.options) && question.options.length
      ? question.options
      : ['', ''];
    while (options.length < 2) options.push('');

    const correctIndices = Array.isArray(question.correctIndices)
      ? question.correctIndices.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0 && index < options.length)
      : [];

    return {
      id: question.id || makeId('question'),
      question: question.question || question.texte || '',
      options,
      correctIndices: correctIndices.length ? correctIndices : [0],
      points: Number(question.points || 1)
    };
  });

  return block.questions;
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) return;
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
}

function updateCorrectIndicesAfterOptionDelete(question, deletedIndex) {
  question.correctIndices = (question.correctIndices || [])
    .filter((index) => index !== deletedIndex)
    .map((index) => index > deletedIndex ? index - 1 : index);
  if (!question.correctIndices.length) question.correctIndices = [0];
}

function updateCorrectIndicesAfterOptionMove(question, fromIndex, toIndex) {
  question.correctIndices = (question.correctIndices || []).map((index) => {
    if (index === fromIndex) return toIndex;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
    if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
    return index;
  });
}

function renderQuizQuestionCard(question, qIndex, questionsCount) {
  const options = Array.isArray(question.options) ? question.options : [];
  return `
    <section class="sbi-quiz-question-card" data-quiz-question="${escapeHtml(question.id)}">
      <div class="sbi-quiz-question-head">
        <strong>Question ${qIndex + 1}</strong>
        <div class="sbi-check-row">
          <button class="sbi-editor-btn sbi-editor-btn--tiny" type="button" data-move-quiz-question="${escapeHtml(question.id)}" data-direction="-1" ${qIndex === 0 ? 'disabled' : ''}>Monter</button>
          <button class="sbi-editor-btn sbi-editor-btn--tiny" type="button" data-move-quiz-question="${escapeHtml(question.id)}" data-direction="1" ${qIndex === questionsCount - 1 ? 'disabled' : ''}>Descendre</button>
          <button class="sbi-editor-btn sbi-editor-btn--tiny sbi-editor-btn--danger" type="button" data-delete-quiz-question="${escapeHtml(question.id)}" ${questionsCount <= 1 ? 'disabled' : ''}>Supprimer</button>
        </div>
      </div>
      <div class="sbi-field">
        <label>Enonce</label>
        <textarea class="sbi-textarea quiz-question-input" data-question-id="${escapeHtml(question.id)}" placeholder="Question a poser">${escapeHtml(question.question || '')}</textarea>
      </div>
      <div class="sbi-field">
        <label>Reponses possibles</label>
        <div class="sbi-quiz-option-list">
          ${options.map((option, index) => `
            <div class="sbi-quiz-option-row" data-question-id="${escapeHtml(question.id)}" data-option-index="${index}">
              <input type="checkbox" class="quiz-correct" value="${index}" ${question.correctIndices?.includes(index) ? 'checked' : ''} aria-label="Bonne reponse">
              <input class="sbi-input quiz-option" value="${escapeHtml(option)}" placeholder="Reponse ${index + 1}">
              <button class="sbi-editor-btn sbi-editor-btn--tiny" type="button" data-move-quiz-option="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Monter</button>
              <button class="sbi-editor-btn sbi-editor-btn--tiny" type="button" data-move-quiz-option="${index}" data-direction="1" ${index === options.length - 1 ? 'disabled' : ''}>Descendre</button>
              <button class="sbi-editor-btn sbi-editor-btn--tiny sbi-editor-btn--danger" type="button" data-delete-quiz-option="${index}" ${options.length <= 2 ? 'disabled' : ''}>Supprimer</button>
            </div>
          `).join('')}
        </div>
        <button class="sbi-editor-btn sbi-editor-btn--tiny" type="button" data-add-quiz-option="${escapeHtml(question.id)}">+ Ajouter une reponse</button>
      </div>
      <div class="sbi-field sbi-field--compact">
        <label>Points</label>
        <input class="sbi-input quiz-points" data-question-id="${escapeHtml(question.id)}" type="number" min="0" step="1" value="${Number(question.points || 1)}">
      </div>
    </section>
  `;
}

function renderQuizEditor(block) {
  const questions = normalizeQuizQuestions(block);
  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Instructions</label><textarea id="block-instructions" class="sbi-textarea">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-quiz-builder">
        ${questions.map((question, index) => renderQuizQuestionCard(question, index, questions.length)).join('')}
      </div>
      <div class="sbi-check-row">
        <button id="quiz-add-question" class="sbi-editor-btn sbi-editor-btn--tiny" type="button">+ Ajouter une question</button>
      </div>
      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Score max</label><input class="sbi-input" type="number" min="0" value="${getActiveScore(block)}" readonly aria-readonly="true"></div>
        <div class="sbi-field"><label>Timer minimum (min)</label><small>Temps minimum avant validation de cette page cote eleve.</small><input id="block-duration" class="sbi-input" type="number" min="0" value="${Number(block.durationMinutes || 5)}"></div>
      </div>
    </div>
  `;
}

function normalizeFillBlankRows(block) {
  if (Array.isArray(block.blanks) && block.blanks.length) return block.blanks;
  const tokens = extractTokens(block.prompt || '');
  block.blanks = tokens.map((token) => ({ id: makeId('blank'), token, answers: token, points: 1 }));
  return block.blanks;
}

function extractTokens(text = '') {
  const matches = [...String(text).matchAll(/\[\[([^\]]+)\]\]/g)];
  return matches.map((match) => normalizeString(match[1])).filter(Boolean);
}

function renderFillBlankPreviewText(block, { asHtml = false } = {}) {
  const prompt = escapeHtml(block.prompt || '');
  const html = prompt.replace(/\[\[([^\]]+)\]\]/g, (_, token) => {
    const safeToken = escapeHtml(token);
    return asHtml ? `<mark>${safeToken}</mark>` : `<mark>[[${safeToken}]]</mark>`;
  });
  return html || '<span style="color:var(--editor-muted);">Aucun texte à compléter.</span>';
}

function renderFillBlankStudentPromptHtml(block) {
  const prompt = escapeHtml(block.prompt || '');
  const html = prompt.replace(/\[\[([^\]]+)\]\]/g, '<span class="sbi-fib-blank-static" aria-hidden="true"></span>');
  return html || '<span style="color:var(--editor-muted);">Aucun texte a completer.</span>';
}

function renderSettings() {
  const settings = $('#course-v2-settings');
  if (!settings) return;
  const active = getActiveBlock();
  const selectedFormationLabel = state.selectedFormationIds.length
    ? state.selectedFormationIds.map(getFormationTitle).join(', ')
    : 'Aucune formation sélectionnée';
  const settingsDuration = active ? toPositiveMinutes(active.durationMinutes) : updateComputedCourseDuration();
  const settingsDurationLabel = active ? 'Timer minimum (min)' : 'Durée globale (min)';
  const settingsDurationHelp = active
    ? '<small>Durée minimale avant validation de la page côté élève.</small>'
    : '<small>Calcul automatique : somme des timers minimum des blocs du cours.</small>';
  const settingsDurationReadonly = active ? '' : 'readonly aria-readonly="true"';

  settings.innerHTML = `
    <div class="sbi-right-card">
      <h2 class="sbi-panel-title">Paramètres pédagogiques</h2>
      <p class="sbi-panel-subtitle">Appliqués au cours ou au bloc actif.</p><div class="sbi-logic-note">Le programme reste piloté par Cursus / Promotions. Ici on compose seulement le contenu pédagogique.</div>
    </div>
    <div class="sbi-right-card sbi-editor-form" style="padding:1rem;">
      <div class="sbi-field"><label>Formation</label><div class="sbi-input" style="height:auto;">${escapeHtml(selectedFormationLabel)}</div></div>
      <div class="sbi-field"><label>Bloc partagé</label>${renderSharedBlockPicker('settings', state.course.bloc, { allowCreate: false })}<small>Sélection rapide d’un bloc existant. Pour créer un nouveau bloc, passe par Course Info.</small></div>
      <div class="sbi-field"><label>Compétence ciblée</label><input id="settings-competency" class="sbi-input" value="${escapeHtml(active?.competency || state.course.competency || '')}" placeholder="Ex : C2. Assurer la sécurité"></div>
      <div class="sbi-field"><label>Preuve Qualiopi</label><select id="settings-qualiopi" class="sbi-select"><option value="">Non renseignée</option>${renderQualiopiEvidenceOptions(active?.qualiopiEvidence || state.course.qualiopiEvidence)}</select>${renderQualiopiEvidenceLegend(active?.qualiopiEvidence || state.course.qualiopiEvidence)}</div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>${settingsDurationLabel}</label>${settingsDurationHelp}<input id="settings-duration" class="sbi-input" type="number" min="0" step="1" value="${settingsDuration}" ${settingsDurationReadonly}></div><div class="sbi-field"><label>Score total cours</label><small>Calcul automatique : QCM, textes a trous et checkpoints inclus.</small><input id="settings-score" class="sbi-input" type="number" min="0" value="${calculateCourseMaxScore()}" readonly aria-readonly="true"></div></div>
      <div class="sbi-field"><label>Inclure dans le cours</label><select id="settings-visible" class="sbi-select"><option value="true" ${(active?.visibleInProgram ?? state.course.visibleInProgram) !== false ? 'selected' : ''}>Oui</option><option value="false" ${(active?.visibleInProgram ?? state.course.visibleInProgram) === false ? 'selected' : ''}>Non</option></select></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Règle</label><select id="settings-rule" class="sbi-select"><option value="score_minimum">Score minimum</option><option value="viewed">Consulté</option></select></div><div class="sbi-field"><label>Seuil %</label><input id="settings-validation-score" class="sbi-input" type="number" min="0" max="100" value="${Number(state.course.validationScore || 70)}"></div></div>
    </div>
  `;
}

function getActiveScore(active) {
  return getBlockScore(active);
}

function renderPreview() {
  const root = $('#course-v2-preview-card');
  if (!root) return;
  const active = getActiveBlock();
  const preview = active ? renderBlockPreview(active) : renderCoursePreview();
  root.innerHTML = `
    <div class="sbi-right-card">
      <h2 class="sbi-panel-title">Aperçu élève</h2>
      <p class="sbi-panel-subtitle">Simulation rapide du rendu.</p>
    </div>
    <div class="sbi-right-card"><div class="sbi-preview-card"><div class="sbi-student-mini-page">${preview}</div></div></div>
  `;
}

function renderCoursePreview() {
  return `<h4>${escapeHtml(state.course.title || 'Cours sans titre')}</h4><div class="sbi-preview-rich"><p>${escapeHtml(state.course.objectives || 'Les objectifs pédagogiques apparaîtront ici.')}</p><p>${state.course.learningBlocks.length} bloc(s) pédagogique(s).</p></div>`;
}

function renderBlockPreview(block) {
  if (block.type === 'fill_blank') {
    const html = escapeHtml(block.prompt || '').replace(/\[\[([^\]]+)\]\]/g, (_, token) => `<span class="sbi-preview-token">${escapeHtml(token)}</span>`);
    return `<h4>${escapeHtml(block.title || 'Texte a trous')}</h4><div class="sbi-preview-rich"><p>${escapeHtml(block.instructions || '')}</p><p>${html}</p><small>${normalizeFillBlankRows(block).length} blancs - ${getActiveScore(block)} points</small></div>`;
  }
  if (block.type === 'quiz') {
    const questions = normalizeQuizQuestions(block);
    return `<h4>${escapeHtml(block.title || 'QCM')}</h4><div class="sbi-preview-rich">${questions.map((question, index) => `<section class="sbi-preview-question"><p><strong>${index + 1}.</strong> ${escapeHtml(question?.question || 'Question a completer.')}</p>${(question?.options || []).map((option) => `<div class="sbi-preview-answer">${escapeHtml(option || 'Reponse a completer')}</div>`).join('')}</section>`).join('')}<small>${questions.length} question(s) - ${getActiveScore(block)} points</small></div>`;
  }
  if (PEDAGOGIC_BLOCK_TYPES.has(block.type)) {
    return `<h4>${escapeHtml(block.title || getBlockMeta(block.type).label)}</h4>${buildPedagogicBlockContent(block, { preview: true })}`;
  }
  const mediaPreview = block.type === 'lesson' ? renderLessonMediaPreview(block) : '';
  const content = block.content || '<p>Contenu a completer.</p>';
  return `<h4>${escapeHtml(block.title || getBlockMeta(block.type).label)}</h4>${mediaPreview}<div class="sbi-preview-rich"><p class="sbi-preview-instructions">${escapeHtml(block.instructions || '')}</p>${content}</div>`;
}

function renderPedagogicLine(label, value) {
  const cleanValue = normalizeString(value);
  if (!cleanValue) return '';
  return `<div class="sbi-pedagogic-line"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(cleanValue)}</span></div>`;
}

function renderPedagogicText(label, value) {
  const cleanValue = normalizeString(value);
  if (!cleanValue) return '';
  return `<section class="sbi-pedagogic-section"><h5>${escapeHtml(label)}</h5><p>${escapeHtml(cleanValue).replace(/\n/g, '<br>')}</p></section>`;
}

function buildPedagogicBlockContent(block = {}, { preview = false } = {}) {
  const typeLabel = getBlockMeta(block.type).label;
  const instructions = block.instructions
    ? `<p class="sbi-preview-instructions">${escapeHtml(block.instructions)}</p>`
    : '';
  let body = '';

  if (block.type === 'resource') {
    const resourceLink = block.resourceUrl
      ? `<a class="sbi-pedagogic-link" href="${escapeHtml(block.resourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.resourceUrl)}</a>`
      : '';
    const resourceFile = block.resourceFileName
      ? renderPedagogicLine('Fichier', `${block.resourceFileName}${block.resourceSize ? ` - ${formatBytes(Number(block.resourceSize || 0))}` : ''}${block.resourceCompressed ? ' - image compressee' : ''}`)
      : '';
    body = `
      ${renderPedagogicLine('Type', block.resourceType || 'link')}
      ${resourceFile}
      ${resourceLink}
      ${renderPedagogicText('Description', getPedagogicFieldValue(block, 'resourceDescription'))}
      ${renderPedagogicText('À observer / retenir', block.consultationInstruction)}
    `;
  } else if (block.type === 'assignment') {
    body = `
      ${renderPedagogicText('Travail demandé', getPedagogicFieldValue(block, 'assignmentPrompt'))}
      ${renderPedagogicLine('Livrable attendu', block.deliverableType || 'text')}
      ${renderPedagogicLine('Délai', block.duePolicy || 'promotion_date')}
      ${renderPedagogicLine('Correction', 'autonome')}
      ${renderPedagogicText('Critères d’évaluation', block.evaluationCriteria)}
      ${renderPedagogicText('Correction affichée', block.assignmentCorrection)}
    `;
  } else if (block.type === 'checkpoint') {
    const checkpointItems = getCheckpointItemsForBlock(block)
      .map((item, index) => `<label class="sbi-pedagogic-check"><input type="checkbox" disabled><span>${index + 1}. ${escapeHtml(item.title)}</span></label>`)
      .join('');
    body = `
      ${renderPedagogicLine('XP de validation', `+${getBlockScore(block)} XP`)}
      ${renderPedagogicText('Objectif', getPedagogicFieldValue(block, 'checkpointGoal'))}
      <div class="sbi-pedagogic-checklist">${checkpointItems || '<p>Aucune etape precedente.</p>'}</div>
      ${renderPedagogicText('Résultat attendu', block.expectedResult)}
    `;
  } else if (block.type === 'case_study') {
    body = `
      ${renderPedagogicText('Contexte', block.caseContext)}
      ${renderPedagogicText('Scénario', getPedagogicFieldValue(block, 'scenario'))}
      ${renderPedagogicText('Éléments à analyser', block.analysisMaterials)}
      ${renderPedagogicText('Questions guidées', block.guidedQuestions)}
      ${renderPedagogicText('Réponse attendue / grille', block.expectedAnswer)}
      ${renderPedagogicLine('Correction', 'autonome')}
    `;
  }

  const meta = preview
    ? `<small>${escapeHtml(typeLabel)} · ${toPositiveMinutes(block.durationMinutes)} min</small>`
    : '';

  return `<div class="sbi-preview-rich sbi-pedagogic-preview">${instructions}${body || '<p>Bloc à compléter.</p>'}${meta}</div>`;
}

function renderLessonMediaPreview(block) {
  if (block.mediaType === 'video' && block.mediaVideo) {
    return `<video class="sbi-preview-media" src="${escapeHtml(block.mediaVideo)}" controls></video>`;
  }
  if ((block.mediaType || 'image') === 'image' && block.mediaImage) {
    return `<img class="sbi-preview-media" src="${escapeHtml(block.mediaImage)}" alt="Média de leçon">`;
  }
  return '<div class="sbi-preview-media-empty">Aucun média associé.</div>';
}


function syncDurationUi(sourceId = '') {
  const active = getActiveBlock();
  const activeDuration = active ? toPositiveMinutes(active.durationMinutes) : 0;
  const courseDuration = updateComputedCourseDuration();

  const setFieldValue = (id, value) => {
    if (id === sourceId) return;
    const field = document.getElementById(id);
    if (!field) return;
    const nextValue = String(toPositiveMinutes(value));
    if (String(field.value) !== nextValue) field.value = nextValue;
  };

  setFieldValue('editor-course-duration', courseDuration);
  setFieldValue('block-duration', activeDuration);
  setFieldValue('settings-duration', active ? activeDuration : courseDuration);
}

function syncScoreUi() {
  const score = calculateCourseMaxScore();
  const field = document.getElementById('settings-score');
  if (field && String(field.value) !== String(score)) field.value = String(score);
}

function rerenderSettingsPanel() {
  renderSettings();
  bindSettingsInputs();
}

function bindEditorInputs() {
  $('#course-v2-title')?.addEventListener('input', (event) => {
    state.course.title = event.target.value;
    const mirror = $('#editor-course-title');
    if (mirror && mirror.value !== event.target.value) mirror.value = event.target.value;
    markDirty();
  });

  $('#editor-course-title')?.addEventListener('input', (event) => {
    state.course.title = event.target.value;
    const top = $('#course-v2-title');
    if (top && top.value !== event.target.value) top.value = event.target.value;
    markDirty();
  });

  $all('.editor-formation-check').forEach((input) => input.addEventListener('change', async () => {
    state.selectedFormationIds = $all('.editor-formation-check').filter((item) => item.checked).map((item) => item.value);
    await loadBlockOptionsFromCourses();
    markDirty();
    renderAll();
  }));

  $('#editor-course-bloc')?.addEventListener('input', (event) => {
    state.course.bloc = event.target.value;
    syncBlockTitleUi(event.target.value, 'editor-course-bloc');
    markDirty();
    renderSettings();
    bindSettingsInputs();
  });
  $('#editor-course-bloc-select')?.addEventListener('change', (event) => {
    if (!event.target.value) return;
    state.course.bloc = event.target.value;
    syncBlockTitleUi(event.target.value, 'editor-course-bloc-select');
    markDirty();
    renderSettings();
    bindSettingsInputs();
  });
  $('#editor-course-bloc-add')?.addEventListener('click', () => addLocalSharedBlockOption($('#editor-course-bloc')?.value));
  $('#editor-course-objectives')?.addEventListener('input', (event) => { state.course.objectives = event.target.value; markDirty(); renderPreview(); });
  $('#editor-course-competency')?.addEventListener('input', (event) => { state.course.competency = event.target.value; markDirty(); });
  $('#editor-course-qualiopi')?.addEventListener('change', (event) => {
    state.course.qualiopiEvidence = event.target.value;
    syncQualiopiLegendSelection(event.target);
    markDirty();
  });

  $('#editor-delete-block')?.addEventListener('click', () => { void deleteActiveBlock(); });
  $('#editor-duplicate-block')?.addEventListener('click', duplicateActiveBlock);

  const active = getActiveBlock();
  if (!active) return;

  $('#block-title')?.addEventListener('input', (event) => { active.title = event.target.value; markDirty(); renderStructure(); renderPreview(); });
  $('#block-instructions')?.addEventListener('input', (event) => { active.instructions = event.target.value; markDirty(); renderPreview(); });
  $('#block-content')?.addEventListener('input', (event) => { active.content = event.target.value; markDirty(); renderPreview(); });
  $('#block-duration')?.addEventListener('input', (event) => {
    active.durationMinutes = toPositiveMinutes(event.target.value);
    syncDurationUi('block-duration');
    markDirty();
  });
  $('#block-visible')?.addEventListener('change', (event) => {
    active.visibleInProgram = event.target.value === 'true';
    markDirty();
    syncScoreUi();
  });
  setupLessonMediaControls(active);

  bindFillBlankInputs(active);
  bindQuizInputs(active);
  bindPedagogicBlockInputs(active);
}

function bindFillBlankInputs(active) {
  if (!active || active.type !== 'fill_blank') return;
  $('#fib-prompt')?.addEventListener('input', (event) => {
    const beforeTokens = normalizeFillBlankRows(active).map((blank) => blank.token).join('\u001f');
    active.prompt = event.target.value;
    const tokens = extractTokens(active.prompt);
    const existing = new Map(normalizeFillBlankRows(active).map((blank) => [blank.token, blank]));
    active.blanks = tokens.map((token) => existing.get(token) || { id: makeId('blank'), token, answers: token, points: 1 });
    const afterTokens = active.blanks.map((blank) => blank.token).join('\u001f');
    markDirty();
    refreshFillBlankPreview(active);
    if (beforeTokens !== afterTokens) {
      refreshFillBlankRows(active);
      syncScoreUi();
    }
    renderPreview();
  });
  $('#fib-prompt')?.addEventListener('blur', () => {
    refreshFillBlankRows(active);
    rerenderSettingsPanel();
    renderPreview();
  });

  $('#fib-scoring-mode')?.addEventListener('change', (event) => { active.scoringMode = event.target.value; markDirty(); });
  $('#fib-max-attempts')?.addEventListener('input', (event) => { active.maxAttempts = Number(event.target.value || 1); markDirty(); });
  $('#fib-show-answers')?.addEventListener('change', (event) => { active.showAnswersAtEnd = event.target.value === 'true'; markDirty(); });
  $('#fib-feedback-correct')?.addEventListener('input', (event) => { active.feedbackCorrect = event.target.value; markDirty(); });
  $('#fib-feedback-incorrect')?.addEventListener('input', (event) => { active.feedbackIncorrect = event.target.value; markDirty(); });
  $('#fib-add-blank')?.addEventListener('click', () => {
    active.blanks = normalizeFillBlankRows(active);
    active.blanks.push({ id: makeId('blank'), token: 'nouveau blanc', answers: 'nouveau blanc', points: 1 });
    active.prompt = `${active.prompt || ''} [[nouveau blanc]]`.trim();
    markDirty();
    renderMainEditor();
    rerenderSettingsPanel();
    renderPreview();
  });

  bindFillBlankRowInputs(active);
}

function refreshFillBlankPreview(active) {
  const preview = $('#fib-rendered-preview');
  if (preview) preview.innerHTML = renderFillBlankPreviewText(active);
}

function refreshFillBlankRows(active) {
  const body = $('#fib-blank-rows');
  if (!body) return;
  body.innerHTML = renderFillBlankRowsHtml(active);
  bindFillBlankRowInputs(active);
}

function bindFillBlankRowInputs(active) {
  $all('[data-delete-blank]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.deleteBlank;
    active.blanks = normalizeFillBlankRows(active).filter((blank) => blank.id !== id);
    markDirty();
    refreshFillBlankRows(active);
    refreshFillBlankPreview(active);
    syncScoreUi();
    renderPreview();
  }));

  $all('[data-blank-row]').forEach((row) => {
    const blank = normalizeFillBlankRows(active).find((item) => item.id === row.dataset.blankRow);
    if (!blank) return;
    $('.fib-token', row)?.addEventListener('input', (event) => { blank.token = event.target.value; markDirty(); renderPreview(); });
    $('.fib-answers', row)?.addEventListener('input', (event) => { blank.answers = event.target.value; markDirty(); });
    $('.fib-points', row)?.addEventListener('input', (event) => {
      blank.points = Number(event.target.value || 0);
      markDirty();
      syncScoreUi();
      renderPreview();
    });
  });
}

function findQuizQuestionById(active, questionId) {
  return normalizeQuizQuestions(active).find((question) => question.id === questionId) || null;
}

function rerenderQuizEditor(active) {
  markDirty();
  renderMainEditor();
  rerenderSettingsPanel();
  renderPreview();
}

function bindQuizInputs(active) {
  if (!active || active.type !== 'quiz') return;
  normalizeQuizQuestions(active);

  $('#quiz-add-question')?.addEventListener('click', () => {
    active.questions.push(createDefaultQuizQuestion());
    rerenderQuizEditor(active);
  });

  $all('[data-delete-quiz-question]').forEach((button) => {
    button.addEventListener('click', () => {
      if (active.questions.length <= 1) return;
      active.questions = active.questions.filter((question) => question.id !== button.dataset.deleteQuizQuestion);
      rerenderQuizEditor(active);
    });
  });

  $all('[data-move-quiz-question]').forEach((button) => {
    button.addEventListener('click', () => {
      const fromIndex = active.questions.findIndex((question) => question.id === button.dataset.moveQuizQuestion);
      const toIndex = fromIndex + Number(button.dataset.direction || 0);
      moveArrayItem(active.questions, fromIndex, toIndex);
      rerenderQuizEditor(active);
    });
  });

  $all('.quiz-question-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const question = findQuizQuestionById(active, input.dataset.questionId);
      if (!question) return;
      question.question = event.target.value;
      markDirty();
      renderPreview();
    });
  });

  $all('.quiz-points').forEach((input) => {
    input.addEventListener('input', (event) => {
      const question = findQuizQuestionById(active, input.dataset.questionId);
      if (!question) return;
      question.points = Number(event.target.value || 0);
      markDirty();
      syncScoreUi();
      renderPreview();
    });
  });

  $all('.quiz-option').forEach((input) => {
    input.addEventListener('input', (event) => {
      const row = input.closest('[data-question-id][data-option-index]');
      const question = findQuizQuestionById(active, row?.dataset.questionId);
      const optionIndex = Number(row?.dataset.optionIndex);
      if (!question || !Number.isInteger(optionIndex)) return;
      question.options[optionIndex] = event.target.value;
      markDirty();
      renderPreview();
    });
  });

  $all('.quiz-correct').forEach((input) => {
    input.addEventListener('change', () => {
      const card = input.closest('[data-quiz-question]');
      const question = findQuizQuestionById(active, card?.dataset.quizQuestion);
      if (!question) return;
      question.correctIndices = $all('.quiz-correct', card)
        .filter((item) => item.checked)
        .map((item) => Number(item.value));
      if (!question.correctIndices.length) question.correctIndices = [0];
      markDirty();
      renderPreview();
    });
  });

  $all('[data-add-quiz-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const question = findQuizQuestionById(active, button.dataset.addQuizOption);
      if (!question) return;
      question.options.push('');
      rerenderQuizEditor(active);
    });
  });

  $all('[data-delete-quiz-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('[data-question-id][data-option-index]');
      const question = findQuizQuestionById(active, row?.dataset.questionId);
      const optionIndex = Number(row?.dataset.optionIndex);
      if (!question || question.options.length <= 2 || !Number.isInteger(optionIndex)) return;
      question.options.splice(optionIndex, 1);
      updateCorrectIndicesAfterOptionDelete(question, optionIndex);
      rerenderQuizEditor(active);
    });
  });

  $all('[data-move-quiz-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('[data-question-id][data-option-index]');
      const question = findQuizQuestionById(active, row?.dataset.questionId);
      const fromIndex = Number(row?.dataset.optionIndex);
      const toIndex = fromIndex + Number(button.dataset.direction || 0);
      if (!question || !Number.isInteger(fromIndex)) return;
      if (toIndex < 0 || toIndex >= question.options.length) return;
      updateCorrectIndicesAfterOptionMove(question, fromIndex, toIndex);
      moveArrayItem(question.options, fromIndex, toIndex);
      rerenderQuizEditor(active);
    });
  });
}

function bindPedagogicBlockInputs(active) {
  if (!active || !PEDAGOGIC_BLOCK_TYPES.has(active.type)) return;

  $all('[data-block-field]').forEach((field) => {
    const key = field.dataset.blockField;
    if (!key) return;
    const eventName = field.tagName === 'SELECT' || field.type === 'checkbox' ? 'change' : 'input';
    field.addEventListener(eventName, (event) => {
      if (field.dataset.blockBoolean === 'true') {
        active[key] = Boolean(event.target.checked);
      } else {
        active[key] = event.target.value;
      }
      markDirty();
      renderPreview();
    });
  });

  setupResourceFileControls(active);
}

function bindSettingsInputs() {
  $('#settings-bloc')?.addEventListener('input', (event) => {
    state.course.bloc = event.target.value;
    syncBlockTitleUi(event.target.value, 'settings-bloc');
    markDirty();
  });
  $('#settings-bloc-select')?.addEventListener('change', (event) => {
    if (!event.target.value) return;
    state.course.bloc = event.target.value;
    syncBlockTitleUi(event.target.value, 'settings-bloc-select');
    markDirty();
    renderMainEditor();
    renderSettings();
    bindSettingsInputs();
  });
  $('#settings-bloc-add')?.addEventListener('click', () => addLocalSharedBlockOption($('#settings-bloc')?.value));

  const active = getActiveBlock();
  $('#settings-competency')?.addEventListener('input', (event) => {
    if (active) active.competency = event.target.value;
    else state.course.competency = event.target.value;
    markDirty();
  });
  $('#settings-qualiopi')?.addEventListener('change', (event) => {
    if (active) active.qualiopiEvidence = event.target.value;
    else state.course.qualiopiEvidence = event.target.value;
    syncQualiopiLegendSelection(event.target);
    markDirty();
  });
  $('#settings-duration')?.addEventListener('input', (event) => {
    if (!active) {
      syncDurationUi('settings-duration');
      return;
    }
    const value = toPositiveMinutes(event.target.value);
    active.durationMinutes = value;
    syncDurationUi('settings-duration');
    markDirty();
  });
  $('#settings-visible')?.addEventListener('change', (event) => {
    if (active) active.visibleInProgram = event.target.value === 'true';
    else state.course.visibleInProgram = event.target.value === 'true';
    markDirty();
    syncScoreUi();
  });
  $('#settings-validation-score')?.addEventListener('input', (event) => { state.course.validationScore = Number(event.target.value || 70); markDirty(); });
}

function saveActiveEditorValues() {
  syncQuillToActiveBlock();
  syncActiveLessonMediaFromDom();

  const topTitle = $('#course-v2-title');
  if (topTitle) state.course.title = topTitle.value;

  const editorTitle = $('#editor-course-title');
  if (editorTitle) state.course.title = editorTitle.value;

  const checks = $all('.editor-formation-check');
  if (checks.length) state.selectedFormationIds = checks.filter((item) => item.checked).map((item) => item.value);

  const blocField = $('#editor-course-bloc') || $('#settings-bloc');
  if (blocField) state.course.bloc = blocField.value;
  updateComputedCourseDuration();

  const active = getActiveBlock();
  if (!active) return;
  const title = $('#block-title');
  if (title) active.title = title.value;
  const instructions = $('#block-instructions');
  if (instructions) active.instructions = instructions.value;
  const content = $('#block-content');
  if (content) active.content = content.value;

  $all('[data-block-field]').forEach((field) => {
    const key = field.dataset.blockField;
    if (!key) return;
    active[key] = field.dataset.blockBoolean === 'true'
      ? Boolean(field.checked)
      : field.value;
  });

  Object.assign(active, normalizePedagogicBlockForSave(forceAutonomousCorrectionBlock(active)));
}

function bindGlobalActions() {
  $('#course-v2-back-library')?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (state.dirty) {
      const confirmed = await openSbiDialog({
        title: 'Quitter sans enregistrer ?',
        message: 'Des modifications ne sont pas enregistrées. Tu peux revenir à la bibliothèque, mais les changements non sauvegardés seront perdus.',
        confirmText: 'Retour bibliothèque',
        cancelText: 'Rester ici',
        tone: 'danger'
      });
      if (!confirmed) return;
    }
    state.dirty = false;
    await navigateShellAware(getBackUrl(), { source: 'course-editor-v2-back' });
  });

  $('#course-v2-save')?.addEventListener('click', () => saveCourse('draft'));
  $('#course-v2-submit')?.addEventListener('click', () => saveCourse(state.role === 'admin' ? 'publish' : 'submit'));
  $('#course-v2-reject')?.addEventListener('click', () => rejectCourseFromValidation());
  $('#course-v2-preview')?.addEventListener('click', async () => {
    if (!state.courseId) await saveCourse('draft', { silent: true });
    if (state.courseId) window.open(`${getViewerUrl()}?id=${encodeURIComponent(state.courseId)}&preview=true&returnTo=${encodeURIComponent(location.pathname + location.search)}`, '_blank');
  });

  if (activeBeforeUnloadHandler) window.removeEventListener('beforeunload', activeBeforeUnloadHandler);
  activeBeforeUnloadHandler = (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', activeBeforeUnloadHandler);
}

function buildCoursePayload(action = 'draft') {
  updateComputedCourseDuration();
  const selectedFormations = getSelectedFormations();
  const targetFormationIds = normalizeList(state.selectedFormationIds);
  const targetFormationTitles = normalizeList(selectedFormations.map((formation) => formation.titre || formation.title));
  const targetTeacherIds = collectTeacherTargets(selectedFormations);
  const targetStudents = action === 'publish' ? collectStudentTargets(selectedFormations) : [];

  let statutValidation = state.status || 'draft';
  let actif = false;

  if (action === 'submit') {
    statutValidation = 'pending';
    actif = false;
  } else if (action === 'publish') {
    statutValidation = 'approved';
    actif = true;
  } else {
    if (state.role === 'admin' && state.status === 'pending') {
      statutValidation = 'pending';
    } else {
      statutValidation = state.status === 'approved' && state.role === 'admin' ? 'approved' : 'draft';
    }
    actif = statutValidation === 'approved';
  }

  const normalizedSourceBlocks = state.course.learningBlocks.map((block) => normalizePedagogicBlockForSave(block));
  const learningBlocks = normalizedSourceBlocks.map((block, index, blocks) => normalizeLearningBlockForSave(block, index, blocks));
  state.course.learningBlocks = learningBlocks.map((block) => ({ ...block }));
  const totalCourseScore = calculateCourseMaxScore(learningBlocks);

  const chapitres = convertBlocksToLegacyChapters(learningBlocks);
  const quizCount = learningBlocks.filter((block) => block.type === 'quiz').length;
  const fillBlankCount = learningBlocks.filter((block) => block.type === 'fill_blank').length;
  const lessonCount = learningBlocks.filter((block) => block.type === 'lesson').length;

  return {
    titre: state.course.title || 'Cours sans titre',
    title: state.course.title || 'Cours sans titre',
    bloc: state.course.bloc || '',
    blockTitle: state.course.bloc || '',
    actif,
    statutValidation,
    formations: targetFormationIds,
    formationIds: targetFormationIds,
    targetFormationIds,
    targetFormationTitles,
    targetTeacherIds,
    targetStudents,
    auteurId: state.course.auteurId || state.uid,
    authorName: state.profile ? `${state.profile.prenom || ''} ${state.profile.nom || ''}`.trim() || state.profile.email || '' : '',
    objectives: state.course.objectives || '',
    competency: state.course.competency || '',
    qualiopiEvidence: state.course.qualiopiEvidence || '',
    visibleInProgram: state.course.visibleInProgram !== false,
    validationRule: state.course.validationRule || 'score_minimum',
    validationScore: Number(state.course.validationScore || 70),
    estimatedDurationMinutes: updateComputedCourseDuration(),
    maxScore: totalCourseScore,
    totalScore: totalCourseScore,
    totalXp: totalCourseScore,
    schemaVersion: 'lms-course-v2',
    editorVersion: VERSION,
    learningBlocks,
    chapitres,
    lessonCount,
    quizCount,
    fillBlankCount,
    resourceCount: learningBlocks.filter((block) => ['resource', 'assignment', 'checkpoint', 'case_study'].includes(block.type)).length,
    lessonType: fillBlankCount || quizCount ? 'mixed' : 'text',
    lmsStatus: statutValidation === 'approved' ? 'published' : (statutValidation === 'pending' ? 'pending_review' : 'draft'),
    updatedAt: serverTimestamp()
  };
}

async function saveCourse(action = 'draft', { silent = false } = {}) {
  if (state.readOnly || isTeacherPendingLocked()) {
    state.readOnly = true;
    applyEditorLockState();
    await openSbiAlert('Cours verrouillé', 'Ce cours est soumis à validation. Il redeviendra modifiable uniquement après validation ou refus.');
    return;
  }

  saveActiveEditorValues();
  if (!state.course.title.trim()) {
    await openSbiAlert('Titre manquant', 'Ajoute un titre de cours avant de sauvegarder.');
    return;
  }
  if (!state.course.learningBlocks.length) {
    state.course.learningBlocks.push(createDefaultBlock('lesson'));
  }

  if (action === 'submit') {
    const confirmed = await openSbiDialog({
      title: 'Soumettre ce cours ?',
      message: 'Une fois soumis, le cours ne sera plus modifiable tant que l’administration ne l’aura pas validé ou refusé.',
      confirmText: 'Soumettre',
      cancelText: 'Continuer à modifier',
      tone: 'default'
    });
    if (!confirmed) return;
  }

  if (action === 'publish') {
    const confirmed = await openSbiDialog({
      title: 'Mettre ce cours en ligne ?',
      message: 'Le cours sera validé, publié, journalisé et les notifications prévues seront envoyées.',
      confirmText: 'Mettre en ligne',
      cancelText: 'Annuler',
      tone: 'default'
    });
    if (!confirmed) return;
  }

  setStatus('Sauvegarde…');

  try {
    let targetRef = null;
    let targetCourseId = state.courseId;
    const persistenceAction = ['submit', 'publish'].includes(action) ? 'draft' : action;
    let workflowResult = null;

    if (!targetCourseId) {
      targetRef = doc(collection(db, 'courses'));
      targetCourseId = targetRef.id;
    }

    let payload = buildCoursePayload(persistenceAction);
    validateCourseDocumentSize(payload);

    const isNewCourse = !state.courseId;
    if (isNewCourse) {
      await setDoc(targetRef, {
        ...payload,
        dateCreation: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      state.courseId = targetCourseId;
      history.replaceState({}, '', `${location.pathname}?id=${encodeURIComponent(state.courseId)}`);
    }

    if (hasPendingMedia()) {
      setStatus('Upload des médias…');
      const mediaChapitres = convertBlocksToLegacyChapters(state.course.learningBlocks);
      await uploadPendingMediaForChapters(targetCourseId, mediaChapitres, { uploadedBy: state.uid });
      syncUploadedMediaBackToBlocks(mediaChapitres);
      payload = buildCoursePayload(persistenceAction);
      validateCourseDocumentSize(payload);
    }

    if (state.courseId) {
      await updateDoc(doc(db, 'courses', state.courseId), payload);
    }

    const blockReferenceReport = await syncCourseBlockReferenceForCourse(targetCourseId);

    if (action === 'submit') {
      setStatus('Soumission à validation…');
      const result = await submitCourseForValidationCallable({ courseId: targetCourseId });
      workflowResult = result?.data || null;
      payload = {
        ...payload,
        statutValidation: 'pending',
        actif: false,
        lmsStatus: 'pending_review'
      };
    }

    if (action === 'publish') {
      setStatus('Mise en ligne…');
      const result = await reviewCourseValidationCallable({ courseId: targetCourseId, decision: 'publish' });
      workflowResult = result?.data || null;
      payload = {
        ...payload,
        statutValidation: 'approved',
        actif: true,
        lmsStatus: 'published'
      };
    }

    state.status = payload.statutValidation;
    state.course.actif = payload.actif;
    state.course.lmsStatus = payload.lmsStatus;
    state.dirty = false;
    updateHeaderFields();
    applyEditorLockState();
    const baseMessage = workflowResult?.message || (action === 'submit' ? 'Cours soumis à validation.' : (action === 'publish' ? 'Cours mis en ligne.' : 'Brouillon enregistré.'));
    const blockWarning = blockReferenceReport?.warning ? ' Référentiel blocs non synchronisé.' : '';
    setStatus(`${baseMessage}${blockWarning}`, 'success');
    if (!silent) await loadBlockOptionsFromCourses();
  } catch (error) {
    console.error('[SBI Course Editor V2] Sauvegarde impossible :', error);
    setStatus('Erreur de sauvegarde', 'error');
    await openSbiAlert('Sauvegarde impossible', error.message || 'Erreur inconnue', { tone: 'danger' });
  }
}

async function rejectCourseFromValidation() {
  if (state.role !== 'admin') {
    syncWorkflowControls();
    await openSbiAlert('Action réservée', 'Seule l’administration peut refuser un cours soumis à validation.');
    return;
  }

  if (!isAdminPendingReview()) {
    await openSbiAlert('Refus indisponible', 'Seul un cours en attente de validation peut être refusé.');
    return;
  }

  const confirmed = await openSbiDialog({
    title: 'Refuser ce cours ?',
    message: 'Le cours redeviendra modifiable par le professeur. Une notification et un email transactionnel lui seront envoyés.',
    confirmText: 'Refuser le cours',
    cancelText: 'Annuler',
    tone: 'danger'
  });
  if (!confirmed) return;

  setStatus('Refus du cours…');

  try {
    const result = await reviewCourseValidationCallable({ courseId: state.courseId, decision: 'reject' });
    state.status = 'rejected';
    state.course.actif = false;
    state.course.lmsStatus = 'draft';
    state.dirty = false;
    renderAll();
    setStatus(result?.data?.message || 'Cours refusé. Le professeur peut le corriger.', 'success');
  } catch (error) {
    console.error('[SBI Course Editor V2] Refus impossible :', error);
    setStatus('Erreur de refus', 'error');
    await openSbiAlert('Refus impossible', error.message || 'Erreur inconnue', { tone: 'danger' });
  }
}

function updateHeaderFields() {
  const title = $('#course-v2-title');
  if (title && title.value !== state.course.title) title.value = state.course.title || '';
  const status = $('#course-v2-status');
  if (status) {
    status.textContent = getStatusLabel();
    status.dataset.tone = getStatusTone();
  }
}

async function loadCourseFromUrl() {
  const url = new URL(window.location.href);
  const courseId = normalizeString(url.searchParams.get('id') || url.searchParams.get('edit'));
  if (!courseId) return;

  setStatus('Chargement du cours…');
  const snap = await getDoc(doc(db, 'courses', courseId));
  if (!snap.exists()) {
    setStatus('Cours introuvable', 'error');
    return;
  }

  const data = snap.data();
  state.courseId = snap.id;
  state.status = data.statutValidation || (data.actif ? 'approved' : 'draft');
  state.selectedFormationIds = normalizeList(data.formationIds || data.formations || data.targetFormationIds);
  state.course = {
    ...state.course,
    ...data,
    title: data.titre || data.title || '',
    bloc: data.bloc || data.blockTitle || '',
    objectives: data.objectives || '',
    estimatedDurationMinutes: Number(data.estimatedDurationMinutes || 0),
    competency: data.competency || '',
    qualiopiEvidence: data.qualiopiEvidence || '',
    visibleInProgram: data.visibleInProgram !== false,
    validationRule: data.validationRule || 'score_minimum',
    validationScore: Number(data.validationScore || 70),
    auteurId: data.auteurId || state.uid,
    learningBlocks: Array.isArray(data.learningBlocks) && data.learningBlocks.length
      ? data.learningBlocks
      : convertLegacyChaptersToBlocks(data.chapitres || [])
  };

  if (!state.course.learningBlocks.length) state.course.learningBlocks = [createDefaultBlock('lesson')];
  state.course.learningBlocks = state.course.learningBlocks.map((block) => normalizePedagogicBlockForSave(forceAutonomousCorrectionBlock(block)));
  updateComputedCourseDuration();
  state.activeBlockId = state.course.learningBlocks[0]?.id || 'course_info';
  state.readOnly = isTeacherPendingLocked();
}

async function initForUser(user) {
  state.uid = user.uid;
  state.profile = await loadProfile(user.uid);

  if (!state.profile) {
    setStatus('Profil utilisateur introuvable', 'error');
    return;
  }

  if (state.role === 'admin' && !isAdminLike()) {
    window.location.replace('/login.html');
    return;
  }

  if (state.role === 'teacher' && !isTeacherLike() && !isAdminLike()) {
    window.location.replace('/login.html');
    return;
  }

  state.formations = await loadAccessibleFormations(user.uid, state.profile);
  await loadCourseFromUrl();
  await loadBlockOptionsFromCourses();

  if (!state.course.title) state.course.title = '';
  if (!state.course.learningBlocks.length) {
    state.course.learningBlocks = [createDefaultBlock('lesson')];
    state.activeBlockId = state.course.learningBlocks[0].id;
  }
  updateComputedCourseDuration();

  updateHeaderFields();
  renderAll();
  setStatus(state.readOnly ? 'Cours en attente de validation. Modification verrouillée.' : 'Prêt', state.readOnly ? 'pending' : '');
}

function renderAll() {
  updateHeaderFields();
  renderStructure();
  renderAddControls();
  renderMainEditor();
  renderSettings();
  renderPreview();
  bindSettingsInputs();
  scheduleFixedBlockBankOffset();
  applyEditorLockState();
}

let booted = false;
let activeRoot = null;
let activeAuthUnsubscribe = null;
let activeBeforeUnloadHandler = null;
let activeResizeBound = false;
let activeRouteCleanupBound = false;

function resetEditorRuntimeState() {
  state.uid = '';
  state.profile = null;
  state.courseId = '';
  state.status = 'draft';
  state.activeBlockId = 'course_info';
  state.formations = [];
  state.selectedFormationIds = [];
  state.blockOptions = [];
  state.dirty = false;
  state.readOnly = false;
  state.dragBlockId = '';
  resetQuillInstance();
  state.course = {
    title: '',
    bloc: '',
    objectives: '',
    estimatedDurationMinutes: 0,
    competency: '',
    qualiopiEvidence: '',
    visibleInProgram: true,
    validationRule: 'score_minimum',
    validationScore: 70,
    learningBlocks: []
  };
}

export function mountCourseEditorV2({ force = false } = {}) {
  const root = document.getElementById('sbi-course-editor-v2');
  if (!root) return null;
  if (booted && activeRoot === root && !force) return null;

  cleanupEditorFloatingUi(root);

  activeAuthUnsubscribe?.();
  activeAuthUnsubscribe = null;
  if (activeBeforeUnloadHandler) {
    window.removeEventListener('beforeunload', activeBeforeUnloadHandler);
    activeBeforeUnloadHandler = null;
  }
  unbindViewportBankResize();

  resetEditorRuntimeState();
  booted = true;
  activeRoot = root;
  bindEditorRouteCleanupGuards();
  boot();

  return () => {
    activeAuthUnsubscribe?.();
    activeAuthUnsubscribe = null;
    if (activeBeforeUnloadHandler) {
      window.removeEventListener('beforeunload', activeBeforeUnloadHandler);
      activeBeforeUnloadHandler = null;
    }
    unbindViewportBankResize();
    unbindEditorRouteCleanupGuards();
    cleanupEditorFloatingUi(root);
    if (activeRoot === root) {
      booted = false;
      activeRoot = null;
    }
  };
}

function boot() {
  releasePreloadSafety();
  bindViewportBankResize();
  try {
    mountShell();
    bindGlobalActions();
    scheduleFixedBlockBankOffset();

    activeAuthUnsubscribe = onAuthStateChanged(auth, async (user) => {
      releasePreloadSafety();
      if (!user) {
        window.location.replace('/login.html');
        return;
      }

      try {
        await initForUser(user);
      } catch (error) {
        console.error('[SBI Course Editor V2] Initialisation impossible :', error);
        releasePreloadSafety();
        setStatus('Erreur d’initialisation', 'error');
        renderFatalEditorError(error);
      }
    });
  } catch (error) {
    console.error('[SBI Course Editor V2] Boot impossible :', error);
    releasePreloadSafety();
    renderFatalEditorError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountCourseEditorV2(), { once: true });
} else {
  mountCourseEditorV2();
}
