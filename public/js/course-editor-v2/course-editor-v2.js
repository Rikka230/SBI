import { db, auth } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
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
  hasPendingMedia,
  restoreCurrentMediaPreview,
  setPendingImageFile,
  setPendingVideoFile,
  syncChapterMediaFromDom,
  uploadPendingMediaForChapters,
  validateCourseDocumentSize
} from '/admin/js/course-media-storage.js';

const MAX_QUERY_VALUES = 10;
const VERSION = '8.0P.167.172';

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
    quill.formatText(range.index, range.length || 0, { bold: true, color: '#ff7a1a' }, 'user');
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

  async function absorbCourseSnapshot(snapshot) {
    snapToArray(snapshot).forEach((course) => {
      const bloc = normalizeString(course.bloc || course.blockTitle || course.blockName);
      if (bloc) blocks.add(bloc);
    });
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

function convertBlocksToLegacyChapters(blocks = []) {
  return blocks.map((block, index) => {
    if (block.type === 'quiz') {
      return {
        id: block.id || makeId('chap'),
        type: 'quiz',
        titre: block.title || `QCM ${index + 1}`,
        questions: Array.isArray(block.questions) ? block.questions.map((question) => ({
          ...question,
          options: Array.isArray(question.options) ? question.options : [],
          correctIndices: Array.isArray(question.correctIndices) ? question.correctIndices : []
        })) : []
      };
    }

    if (block.type === 'fill_blank') {
      const prompt = renderFillBlankPreviewText(block, { asHtml: true });
      return {
        id: block.id || makeId('chap'),
        type: 'text',
        titre: block.title || `Texte à trous ${index + 1}`,
        contenu: `<h3>${escapeHtml(block.title || 'Texte à trous')}</h3><p>${escapeHtml(block.instructions || '')}</p><div>${prompt}</div>`,
        mediaType: 'image',
        questions: []
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
          <button id="course-v2-submit" class="sbi-editor-btn sbi-editor-btn--primary" type="button">${state.role === 'admin' ? 'Valider' : 'Soumettre'}</button>
        </div>
      </section>

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

      <footer class="sbi-block-bank">
        <div><div class="sbi-block-bank-title">Banque de blocs</div><div class="sbi-block-bank-subtitle">Ajout rapide au cours, un bloc à la fois.</div></div>
        <div id="course-v2-bank" class="sbi-bank-chips"></div>
      </footer>
    </div>
  `;
}

function setStatus(message, tone = '') {
  const el = $('#course-v2-save-state');
  if (!el) return;
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function markDirty() {
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

function renderSharedBlockPicker(prefix, value = state.course.bloc) {
  const safeValue = normalizeBlockTitle(value);
  const options = state.blockOptions.map((bloc) => {
    const selected = normalizeBlockTitle(bloc) === safeValue ? 'selected' : '';
    return `<option value="${escapeHtml(bloc)}" ${selected}>${escapeHtml(bloc)}</option>`;
  }).join('');

  const emptyText = state.blockOptions.length ? 'Choisir un bloc existant' : 'Aucun bloc enregistré pour cette sélection';

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
    alert('Saisis d’abord un nom de bloc partagé.');
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
    const canDrag = !item.static;
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

  const defaultButton = $('#course-v2-add-default');
  if (defaultButton && defaultButton.dataset.sbiAddBound !== 'true') {
    defaultButton.dataset.sbiAddBound = 'true';
    defaultButton.addEventListener('click', () => addBlock('lesson'));
  }
}

function addBlock(type) {
  saveActiveEditorValues();
  const block = createDefaultBlock(type);
  state.course.learningBlocks.push(block);
  state.activeBlockId = block.id;
  markDirty();
  renderAll();
}

function deleteActiveBlock() {
  const active = getActiveBlock();
  if (!active) return;
  if (!confirm('Supprimer ce bloc du cours ?')) return;
  clearPendingMediaForChapter(active.id);
  state.course.learningBlocks = state.course.learningBlocks.filter((block) => block.id !== active.id);
  state.activeBlockId = state.course.learningBlocks[0]?.id || 'course_info';
  markDirty();
  renderAll();
}

function duplicateActiveBlock() {
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

function initLegacyQuillForActiveBlock(block) {
  const container = $('#block-content-quill');
  const hidden = $('#block-content');
  if (!container || !hidden || !block || block.type !== 'lesson') return;

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
    alert(error.message || 'Média impossible à ajouter.');
  }
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
    block.mediaType = chapter.mediaType || block.mediaType || 'image';
    block.mediaImage = chapter.mediaImage || block.mediaImage || '';
    block.mediaVideo = chapter.mediaVideo || block.mediaVideo || '';
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
              <li>Durée globale estimée en minutes</li>
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
        <div class="sbi-field"><label>Durée estimée globale (min)</label><small>Indicatif pédagogique, ce n’est pas un timer automatique.</small><input id="editor-course-duration" class="sbi-input" type="number" min="0" step="5" value="${Number(state.course.estimatedDurationMinutes || 0)}"></div>
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
        <div class="sbi-field"><label>Preuve Qualiopi</label><select id="editor-course-qualiopi" class="sbi-select"><option value="">Non renseignée</option>${renderSelectOption('2.2 Moyens pédagogiques', state.course.qualiopiEvidence)}${renderSelectOption('2.4 Modalités d’évaluation', state.course.qualiopiEvidence)}${renderSelectOption('3.1 Adaptation pédagogique', state.course.qualiopiEvidence)}</select></div>
      </div>
    </div>
  `;
}

function renderSelectOption(value, selectedValue) {
  const selected = value === selectedValue ? 'selected' : '';
  return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(value)}</option>`;
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
    ${!['fill_blank','quiz'].includes(block.type) ? renderGenericBlockEditor(block) : ''}
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
      <div class="sbi-two-cols"><div class="sbi-field"><label>Durée estimée (min)</label><input id="block-duration" class="sbi-input" type="number" min="0" step="1" value="${Number(block.durationMinutes || 0)}"></div><div class="sbi-field"><label>Inclure dans le cours</label><select id="block-visible" class="sbi-select"><option value="true" ${block.visibleInProgram !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.visibleInProgram === false ? 'selected' : ''}>Non</option></select></div></div>
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

function renderFillBlankEditor(block) {
  const blankRows = normalizeFillBlankRows(block).map((blank, index) => `
    <tr data-blank-row="${escapeHtml(blank.id)}">
      <td>${index + 1}</td>
      <td><input class="sbi-input fib-token" value="${escapeHtml(blank.token)}"></td>
      <td><input class="sbi-input fib-answers" value="${escapeHtml(blank.answers)}" placeholder="Réponses séparées par ;"></td>
      <td><input class="sbi-input fib-points" type="number" min="0" step="1" value="${Number(blank.points || 1)}"></td>
      <td><button class="sbi-editor-btn sbi-editor-btn--tiny sbi-editor-btn--danger" type="button" data-delete-blank="${escapeHtml(blank.id)}">×</button></td>
    </tr>
  `).join('');

  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Instructions</label><div class="sbi-rich-toolbar"><span>Paragraphe</span><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">B</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">I</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">Liste</button></div><textarea id="block-instructions" class="sbi-textarea">${escapeHtml(block.instructions || '')}</textarea></div>
      <div class="sbi-field"><label>Texte à compléter</label><small>Utilise [[mot attendu]] pour créer un trou.</small><textarea id="fib-prompt" class="sbi-textarea">${escapeHtml(block.prompt || '')}</textarea><div id="fib-rendered-preview" class="sbi-token-box">${renderFillBlankPreviewText(block)}</div></div>
      <div class="sbi-field"><label>Réponses et paramètres des blancs</label><table class="sbi-table"><thead><tr><th>#</th><th>Texte / élément</th><th>Réponses acceptées</th><th>Points</th><th></th></tr></thead><tbody id="fib-blank-rows">${blankRows}</tbody></table><div><button id="fib-add-blank" class="sbi-editor-btn sbi-editor-btn--tiny" type="button">+ Ajouter un blanc</button></div></div>
      <div class="sbi-three-cols"><div class="sbi-field"><label>Score</label><select id="fib-scoring-mode" class="sbi-select"><option value="per_blank" ${block.scoringMode !== 'global' ? 'selected' : ''}>Par blanc</option><option value="global" ${block.scoringMode === 'global' ? 'selected' : ''}>Global</option></select></div><div class="sbi-field"><label>Tentatives</label><input id="fib-max-attempts" class="sbi-input" type="number" min="1" value="${Number(block.maxAttempts || 2)}"></div><div class="sbi-field"><label>Afficher réponses</label><select id="fib-show-answers" class="sbi-select"><option value="true" ${block.showAnswersAtEnd !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.showAnswersAtEnd === false ? 'selected' : ''}>Non</option></select></div></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Feedback bonne réponse</label><textarea id="fib-feedback-correct" class="sbi-textarea">${escapeHtml(block.feedbackCorrect || '')}</textarea></div><div class="sbi-field"><label>Feedback incorrect</label><textarea id="fib-feedback-incorrect" class="sbi-textarea">${escapeHtml(block.feedbackIncorrect || '')}</textarea></div></div>
    </div>
  `;
}

function renderQuizEditor(block) {
  const question = (Array.isArray(block.questions) && block.questions[0]) || createDefaultBlock('quiz').questions[0];
  const options = Array.isArray(question.options) && question.options.length ? question.options : ['', '', ''];
  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title || '')}"></div>
      <div class="sbi-field"><label>Question principale</label><input id="quiz-question" class="sbi-input" value="${escapeHtml(question.question || '')}"></div>
      <div class="sbi-field"><label>Réponses</label>${options.map((option, index) => `<label class="sbi-check-row"><input type="checkbox" class="quiz-correct" value="${index}" ${question.correctIndices?.includes(index) ? 'checked' : ''}><input class="sbi-input quiz-option" value="${escapeHtml(option)}" placeholder="Réponse ${index + 1}"></label>`).join('')}</div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Points</label><input id="quiz-points" class="sbi-input" type="number" min="0" value="${Number(question.points || 1)}"></div><div class="sbi-field"><label>Durée estimée (min)</label><input id="block-duration" class="sbi-input" type="number" min="0" value="${Number(block.durationMinutes || 5)}"></div></div>
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

function renderSettings() {
  const settings = $('#course-v2-settings');
  if (!settings) return;
  const active = getActiveBlock();
  const selectedFormationLabel = state.selectedFormationIds.length
    ? state.selectedFormationIds.map(getFormationTitle).join(', ')
    : 'Aucune formation sélectionnée';

  settings.innerHTML = `
    <div class="sbi-right-card">
      <h2 class="sbi-panel-title">Paramètres pédagogiques</h2>
      <p class="sbi-panel-subtitle">Appliqués au cours ou au bloc actif.</p><div class="sbi-logic-note">Le programme reste piloté par Cursus / Promotions. Ici on compose seulement le contenu pédagogique.</div>
    </div>
    <div class="sbi-right-card sbi-editor-form" style="padding:1rem;">
      <div class="sbi-field"><label>Formation</label><div class="sbi-input" style="height:auto;">${escapeHtml(selectedFormationLabel)}</div></div>
      <div class="sbi-field"><label>Bloc partagé</label>${renderSharedBlockPicker('settings', state.course.bloc)}<small>Ajout local au cours. La sauvegarde le rend récupérable par formation.</small></div>
      <div class="sbi-field"><label>Compétence ciblée</label><input id="settings-competency" class="sbi-input" value="${escapeHtml(active?.competency || state.course.competency || '')}" placeholder="Ex : C2. Assurer la sécurité"></div>
      <div class="sbi-field"><label>Preuve Qualiopi</label><select id="settings-qualiopi" class="sbi-select"><option value="">Non renseignée</option>${renderSelectOption('2.2 Moyens pédagogiques', active?.qualiopiEvidence || state.course.qualiopiEvidence)}${renderSelectOption('2.4 Modalités d’évaluation', active?.qualiopiEvidence || state.course.qualiopiEvidence)}${renderSelectOption('3.1 Adaptation pédagogique', active?.qualiopiEvidence || state.course.qualiopiEvidence)}</select></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Durée estimée (min)</label><input id="settings-duration" class="sbi-input" type="number" min="0" value="${Number(active?.durationMinutes || state.course.estimatedDurationMinutes || 0)}"></div><div class="sbi-field"><label>Score max calculé</label><input id="settings-score" class="sbi-input" type="number" min="0" value="${getActiveScore(active)}" readonly aria-readonly="true"></div></div>
      <div class="sbi-field"><label>Inclure dans le cours</label><select id="settings-visible" class="sbi-select"><option value="true" ${(active?.visibleInProgram ?? state.course.visibleInProgram) !== false ? 'selected' : ''}>Oui</option><option value="false" ${(active?.visibleInProgram ?? state.course.visibleInProgram) === false ? 'selected' : ''}>Non</option></select></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Règle</label><select id="settings-rule" class="sbi-select"><option value="score_minimum">Score minimum</option><option value="viewed">Consulté</option></select></div><div class="sbi-field"><label>Seuil %</label><input id="settings-validation-score" class="sbi-input" type="number" min="0" max="100" value="${Number(state.course.validationScore || 70)}"></div></div>
    </div>
  `;
}

function getActiveScore(active) {
  if (!active) return 0;
  if (active.type === 'fill_blank') return normalizeFillBlankRows(active).reduce((total, blank) => total + Number(blank.points || 0), 0);
  if (active.type === 'quiz') return (active.questions || []).reduce((total, question) => total + Number(question.points || 0), 0);
  return Number(active.score || 0);
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
    <div class="sbi-right-card"><div class="sbi-preview-card">${preview}</div></div>
  `;
}

function renderCoursePreview() {
  return `<h4>${escapeHtml(state.course.title || 'Cours sans titre')}</h4><p>${escapeHtml(state.course.objectives || 'Les objectifs pédagogiques apparaîtront ici.')}</p><p>${state.course.learningBlocks.length} bloc(s) pédagogique(s).</p>`;
}

function renderBlockPreview(block) {
  if (block.type === 'fill_blank') {
    const html = escapeHtml(block.prompt || '').replace(/\[\[([^\]]+)\]\]/g, (_, token) => `<span class="sbi-preview-token">${escapeHtml(token)}</span>`);
    return `<h4>${escapeHtml(block.title || 'Texte à trous')}</h4><p>${escapeHtml(block.instructions || '')}</p><p>${html}</p><small>${normalizeFillBlankRows(block).length} blancs · ${getActiveScore(block)} points</small>`;
  }
  if (block.type === 'quiz') {
    const question = block.questions?.[0];
    return `<h4>${escapeHtml(block.title || 'QCM')}</h4><p>${escapeHtml(question?.question || 'Question à compléter.')}</p>${(question?.options || []).map((option) => `<div class="sbi-input" style="margin:.4rem 0;height:auto;">${escapeHtml(option)}</div>`).join('')}`;
  }
  const mediaPreview = block.type === 'lesson' ? renderLessonMediaPreview(block) : '';
  return `<h4>${escapeHtml(block.title || getBlockMeta(block.type).label)}</h4>${mediaPreview}<p>${escapeHtml(block.instructions || '')}</p><p>${block.content || 'Contenu à compléter.'}</p>`;
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


function syncDurationUi(value, sourceId = '') {
  const safeValue = Number(value || 0);
  ['editor-course-duration', 'block-duration', 'settings-duration'].forEach((id) => {
    if (id === sourceId) return;
    const field = document.getElementById(id);
    if (!field) return;
    const nextValue = String(Number.isFinite(safeValue) ? safeValue : 0);
    if (String(field.value) !== nextValue) field.value = nextValue;
  });
}

function syncScoreUi() {
  const score = getActiveScore(getActiveBlock());
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
  $('#editor-course-duration')?.addEventListener('input', (event) => {
    state.course.estimatedDurationMinutes = Number(event.target.value || 0);
    syncDurationUi(state.course.estimatedDurationMinutes, 'editor-course-duration');
    markDirty();
  });
  $('#editor-course-objectives')?.addEventListener('input', (event) => { state.course.objectives = event.target.value; markDirty(); renderPreview(); });
  $('#editor-course-competency')?.addEventListener('input', (event) => { state.course.competency = event.target.value; markDirty(); });
  $('#editor-course-qualiopi')?.addEventListener('change', (event) => { state.course.qualiopiEvidence = event.target.value; markDirty(); });

  $('#editor-delete-block')?.addEventListener('click', deleteActiveBlock);
  $('#editor-duplicate-block')?.addEventListener('click', duplicateActiveBlock);

  const active = getActiveBlock();
  if (!active) return;

  $('#block-title')?.addEventListener('input', (event) => { active.title = event.target.value; markDirty(); renderStructure(); renderPreview(); });
  $('#block-instructions')?.addEventListener('input', (event) => { active.instructions = event.target.value; markDirty(); renderPreview(); });
  $('#block-content')?.addEventListener('input', (event) => { active.content = event.target.value; markDirty(); renderPreview(); });
  $('#block-duration')?.addEventListener('input', (event) => {
    active.durationMinutes = Number(event.target.value || 0);
    syncDurationUi(active.durationMinutes, 'block-duration');
    markDirty();
  });
  $('#block-visible')?.addEventListener('change', (event) => { active.visibleInProgram = event.target.value === 'true'; markDirty(); });
  setupLessonMediaControls(active);

  bindFillBlankInputs(active);
  bindQuizInputs(active);
}

function bindFillBlankInputs(active) {
  if (!active || active.type !== 'fill_blank') return;
  $('#fib-prompt')?.addEventListener('input', (event) => {
    active.prompt = event.target.value;
    const tokens = extractTokens(active.prompt);
    const existing = new Map(normalizeFillBlankRows(active).map((blank) => [blank.token, blank]));
    active.blanks = tokens.map((token) => existing.get(token) || { id: makeId('blank'), token, answers: token, points: 1 });
    markDirty();
    renderMainEditor();
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

  $all('[data-delete-blank]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.deleteBlank;
    active.blanks = normalizeFillBlankRows(active).filter((blank) => blank.id !== id);
    markDirty();
    renderMainEditor();
    rerenderSettingsPanel();
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

function bindQuizInputs(active) {
  if (!active || active.type !== 'quiz') return;
  if (!Array.isArray(active.questions) || !active.questions.length) active.questions = createDefaultBlock('quiz').questions;
  const question = active.questions[0];
  $('#quiz-question')?.addEventListener('input', (event) => { question.question = event.target.value; markDirty(); renderPreview(); });
  $('#quiz-points')?.addEventListener('input', (event) => {
    question.points = Number(event.target.value || 0);
    markDirty();
    syncScoreUi();
  });
  $all('.quiz-option').forEach((input, index) => input.addEventListener('input', (event) => {
    question.options[index] = event.target.value;
    markDirty();
    renderPreview();
  }));
  $all('.quiz-correct').forEach((input) => input.addEventListener('change', () => {
    question.correctIndices = $all('.quiz-correct').filter((item) => item.checked).map((item) => Number(item.value));
    markDirty();
  }));
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
    markDirty();
  });
  $('#settings-duration')?.addEventListener('input', (event) => {
    const value = Number(event.target.value || 0);
    if (active) active.durationMinutes = value;
    else state.course.estimatedDurationMinutes = value;
    syncDurationUi(value, 'settings-duration');
    markDirty();
  });
  $('#settings-visible')?.addEventListener('change', (event) => {
    if (active) active.visibleInProgram = event.target.value === 'true';
    else state.course.visibleInProgram = event.target.value === 'true';
    markDirty();
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

  const active = getActiveBlock();
  if (!active) return;
  const title = $('#block-title');
  if (title) active.title = title.value;
  const instructions = $('#block-instructions');
  if (instructions) active.instructions = instructions.value;
  const content = $('#block-content');
  if (content) active.content = content.value;
}

function bindGlobalActions() {
  $('#course-v2-back-library')?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (state.dirty && !confirm('Des modifications ne sont pas enregistrées. Retourner à la bibliothèque ?')) return;
    state.dirty = false;
    await navigateShellAware(getBackUrl(), { source: 'course-editor-v2-back' });
  });

  $('#course-v2-save')?.addEventListener('click', () => saveCourse('draft'));
  $('#course-v2-submit')?.addEventListener('click', () => saveCourse(state.role === 'admin' ? 'publish' : 'submit'));
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
    statutValidation = state.status === 'approved' && state.role === 'admin' ? 'approved' : 'draft';
    actif = statutValidation === 'approved';
  }

  const learningBlocks = state.course.learningBlocks.map((block, index) => ({
    ...block,
    order: index,
    activityType: block.type,
    schemaVersion: 'learning-block-v1'
  }));

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
    estimatedDurationMinutes: Number(state.course.estimatedDurationMinutes || 0),
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
  saveActiveEditorValues();
  if (!state.course.title.trim()) {
    alert('Ajoute un titre de cours avant de sauvegarder.');
    return;
  }
  if (!state.course.learningBlocks.length) {
    state.course.learningBlocks.push(createDefaultBlock('lesson'));
  }

  setStatus('Sauvegarde…');

  try {
    let targetRef = null;
    let targetCourseId = state.courseId;

    if (!targetCourseId) {
      targetRef = doc(collection(db, 'courses'));
      targetCourseId = targetRef.id;
    }

    if (hasPendingMedia()) {
      setStatus('Upload des médias…');
      const mediaChapitres = convertBlocksToLegacyChapters(state.course.learningBlocks);
      await uploadPendingMediaForChapters(targetCourseId, mediaChapitres);
      syncUploadedMediaBackToBlocks(mediaChapitres);
    }

    const payload = buildCoursePayload(action);
    validateCourseDocumentSize(payload);

    if (state.courseId) {
      await updateDoc(doc(db, 'courses', state.courseId), payload);
    } else {
      await setDoc(targetRef, {
        ...payload,
        dateCreation: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      state.courseId = targetCourseId;
      history.replaceState({}, '', `${location.pathname}?id=${encodeURIComponent(state.courseId)}`);
    }

    state.status = payload.statutValidation;
    state.dirty = false;
    updateHeaderFields();
    setStatus(action === 'submit' ? 'Cours soumis à validation.' : (action === 'publish' ? 'Cours validé.' : 'Brouillon enregistré.'), 'success');
    if (!silent) await loadBlockOptionsFromCourses();
  } catch (error) {
    console.error('[SBI Course Editor V2] Sauvegarde impossible :', error);
    setStatus('Erreur de sauvegarde', 'error');
    alert(`Sauvegarde impossible : ${error.message || 'erreur inconnue'}`);
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
  state.activeBlockId = state.course.learningBlocks[0]?.id || 'course_info';
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

  updateHeaderFields();
  renderAll();
  setStatus('Prêt');
}

function renderAll() {
  updateHeaderFields();
  renderStructure();
  renderAddControls();
  renderMainEditor();
  renderSettings();
  renderPreview();
  bindSettingsInputs();
}

let booted = false;
let activeRoot = null;
let activeAuthUnsubscribe = null;
let activeBeforeUnloadHandler = null;

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

  activeAuthUnsubscribe?.();
  activeAuthUnsubscribe = null;
  if (activeBeforeUnloadHandler) {
    window.removeEventListener('beforeunload', activeBeforeUnloadHandler);
    activeBeforeUnloadHandler = null;
  }

  resetEditorRuntimeState();
  booted = true;
  activeRoot = root;
  boot();

  return () => {
    activeAuthUnsubscribe?.();
    activeAuthUnsubscribe = null;
    if (activeBeforeUnloadHandler) {
      window.removeEventListener('beforeunload', activeBeforeUnloadHandler);
      activeBeforeUnloadHandler = null;
    }
    if (activeRoot === root) {
      booted = false;
      activeRoot = null;
    }
  };
}

function boot() {
  releasePreloadSafety();
  try {
    mountShell();
    bindGlobalActions();

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
