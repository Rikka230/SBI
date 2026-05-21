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
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const MAX_QUERY_VALUES = 10;
const VERSION = '8.0P.167.160';

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
      mediaType: 'image',
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
          <a class="sbi-editor-link-btn sbi-editor-btn--ghost" href="${getBackUrl()}">← Retour bibliothèque</a>
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
          <section class="sbi-editor-section">
            <h2 class="sbi-panel-title">Ajouter un bloc</h2>
            <p class="sbi-panel-subtitle">Chaque clic ajoute un seul bloc au cours.</p>
            <div id="course-v2-add-grid" class="sbi-add-grid"></div>
          </section>
        </aside>

        <main class="sbi-editor-panel sbi-editor-main">
          <div id="course-v2-main"></div>
        </main>

        <aside class="sbi-editor-panel sbi-editor-right">
          <div id="course-v2-settings"></div>
          <div id="course-v2-preview-card"></div>
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

function renderStructure() {
  const list = $('#course-v2-structure');
  if (!list) return;

  const staticItems = [
    { id: 'course_info', type: 'course_info', title: 'Course Info' },
    { id: 'objectives', type: 'objectives', title: 'Objectifs' }
  ];
  const items = [...staticItems, ...state.course.learningBlocks];

  list.innerHTML = items.map((item, index) => {
    const meta = getBlockMeta(item.type);
    const active = item.id === state.activeBlockId;
    return `
      <li>
        <button class="sbi-structure-item" data-block-id="${escapeHtml(item.id)}" data-active="${active ? 'true' : 'false'}" type="button">
          <span class="sbi-grip">⋮⋮</span>
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
}

function renderAddControls() {
  const targets = [$('#course-v2-add-grid'), $('#course-v2-bank')].filter(Boolean);
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

  $('#course-v2-add-default')?.addEventListener('click', () => addBlock('lesson'));
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

function renderMainEditor() {
  const main = $('#course-v2-main');
  if (!main) return;

  if (state.activeBlockId === 'course_info') {
    main.innerHTML = renderCourseInfoEditor();
  } else if (state.activeBlockId === 'objectives') {
    main.innerHTML = renderObjectivesEditor();
  } else {
    const block = getActiveBlock();
    main.innerHTML = block ? renderBlockEditor(block) : `<div class="sbi-empty-state">Ajoute un bloc pour commencer le cours.</div>`;
  }

  bindEditorInputs();
}

function renderCourseInfoEditor() {
  return `
    <div class="sbi-block-editor-header">
      <div><h2 class="sbi-panel-title">Informations du cours</h2><p class="sbi-panel-subtitle">Base commune admin/prof. Sauvegarde compatible ancien viewer.</p></div>
      <span class="sbi-mini-pill">${VERSION}</span>
    </div>
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre du cours</label><input id="editor-course-title" class="sbi-input" value="${escapeHtml(state.course.title)}" placeholder="Ex : Management des risques en animation"></div>
      <div class="sbi-field"><label>Formation(s)</label><div id="editor-formations" class="sbi-check-row">${renderFormationChecks()}</div><small>Les blocs et futurs référentiels se filtreront sur ces formations.</small></div>
      <div class="sbi-two-cols">
        <div class="sbi-field"><label>Bloc partagé</label><input id="editor-course-bloc" class="sbi-input" list="editor-block-options" value="${escapeHtml(state.course.bloc)}" placeholder="Ex : Module 3 · Animation"><datalist id="editor-block-options">${state.blockOptions.map((bloc) => `<option value="${escapeHtml(bloc)}"></option>`).join('')}</datalist></div>
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
  return `
    <div class="sbi-editor-form">
      <div class="sbi-field"><label>Titre du bloc</label><input id="block-title" class="sbi-input" value="${escapeHtml(block.title)}"></div>
      <div class="sbi-field"><label>Consignes</label><input id="block-instructions" class="sbi-input" value="${escapeHtml(block.instructions || '')}" placeholder="Instruction courte pour l’élève"></div>
      <div class="sbi-field"><label>Contenu</label><div class="sbi-rich-toolbar"><span>Paragraphe</span><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">B</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">I</button><button class="sbi-editor-btn sbi-editor-btn--tiny" type="button">Lien</button></div><textarea id="block-content" class="sbi-textarea" placeholder="Contenu pédagogique…">${escapeHtml(block.content || '')}</textarea></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Durée estimée (min)</label><input id="block-duration" class="sbi-input" type="number" min="0" step="1" value="${Number(block.durationMinutes || 0)}"></div><div class="sbi-field"><label>Inclure dans le cours</label><select id="block-visible" class="sbi-select"><option value="true" ${block.visibleInProgram !== false ? 'selected' : ''}>Oui</option><option value="false" ${block.visibleInProgram === false ? 'selected' : ''}>Non</option></select></div></div>
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
      <div class="sbi-field"><label>Bloc partagé</label><input id="settings-bloc" class="sbi-input" list="settings-block-options" value="${escapeHtml(state.course.bloc)}"><datalist id="settings-block-options">${state.blockOptions.map((bloc) => `<option value="${escapeHtml(bloc)}"></option>`).join('')}</datalist></div>
      <div class="sbi-field"><label>Compétence ciblée</label><input id="settings-competency" class="sbi-input" value="${escapeHtml(active?.competency || state.course.competency || '')}" placeholder="Ex : C2. Assurer la sécurité"></div>
      <div class="sbi-field"><label>Preuve Qualiopi</label><select id="settings-qualiopi" class="sbi-select"><option value="">Non renseignée</option>${renderSelectOption('2.2 Moyens pédagogiques', active?.qualiopiEvidence || state.course.qualiopiEvidence)}${renderSelectOption('2.4 Modalités d’évaluation', active?.qualiopiEvidence || state.course.qualiopiEvidence)}${renderSelectOption('3.1 Adaptation pédagogique', active?.qualiopiEvidence || state.course.qualiopiEvidence)}</select></div>
      <div class="sbi-two-cols"><div class="sbi-field"><label>Durée estimée (min)</label><input id="settings-duration" class="sbi-input" type="number" min="0" value="${Number(active?.durationMinutes || state.course.estimatedDurationMinutes || 0)}"></div><div class="sbi-field"><label>Score max</label><input id="settings-score" class="sbi-input" type="number" min="0" value="${getActiveScore(active)}"></div></div>
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
  return `<h4>${escapeHtml(block.title || getBlockMeta(block.type).label)}</h4><p>${escapeHtml(block.instructions || '')}</p><p>${escapeHtml(block.content || 'Contenu à compléter.')}</p>`;
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

  $('#editor-course-bloc')?.addEventListener('input', (event) => { state.course.bloc = event.target.value; markDirty(); renderSettings(); });
  $('#editor-course-duration')?.addEventListener('input', (event) => { state.course.estimatedDurationMinutes = Number(event.target.value || 0); markDirty(); });
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
  $('#block-duration')?.addEventListener('input', (event) => { active.durationMinutes = Number(event.target.value || 0); markDirty(); });
  $('#block-visible')?.addEventListener('change', (event) => { active.visibleInProgram = event.target.value === 'true'; markDirty(); });

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
    renderPreview();
  });

  $all('[data-delete-blank]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.deleteBlank;
    active.blanks = normalizeFillBlankRows(active).filter((blank) => blank.id !== id);
    markDirty();
    renderMainEditor();
    renderPreview();
  }));

  $all('[data-blank-row]').forEach((row) => {
    const blank = normalizeFillBlankRows(active).find((item) => item.id === row.dataset.blankRow);
    if (!blank) return;
    $('.fib-token', row)?.addEventListener('input', (event) => { blank.token = event.target.value; markDirty(); renderPreview(); });
    $('.fib-answers', row)?.addEventListener('input', (event) => { blank.answers = event.target.value; markDirty(); });
    $('.fib-points', row)?.addEventListener('input', (event) => { blank.points = Number(event.target.value || 0); markDirty(); renderSettings(); renderPreview(); });
  });
}

function bindQuizInputs(active) {
  if (!active || active.type !== 'quiz') return;
  if (!Array.isArray(active.questions) || !active.questions.length) active.questions = createDefaultBlock('quiz').questions;
  const question = active.questions[0];
  $('#quiz-question')?.addEventListener('input', (event) => { question.question = event.target.value; markDirty(); renderPreview(); });
  $('#quiz-points')?.addEventListener('input', (event) => { question.points = Number(event.target.value || 0); markDirty(); renderSettings(); });
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
    const field = $('#editor-course-bloc');
    if (field && field.value !== event.target.value) field.value = event.target.value;
    markDirty();
  });

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
    if (active) active.durationMinutes = Number(event.target.value || 0);
    else state.course.estimatedDurationMinutes = Number(event.target.value || 0);
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
  $('#course-v2-save')?.addEventListener('click', () => saveCourse('draft'));
  $('#course-v2-submit')?.addEventListener('click', () => saveCourse(state.role === 'admin' ? 'publish' : 'submit'));
  $('#course-v2-preview')?.addEventListener('click', async () => {
    if (!state.courseId) await saveCourse('draft', { silent: true });
    if (state.courseId) window.open(`${getViewerUrl()}?id=${encodeURIComponent(state.courseId)}&preview=true&returnTo=${encodeURIComponent(location.pathname + location.search)}`, '_blank');
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
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
    const payload = buildCoursePayload(action);
    if (state.courseId) {
      await updateDoc(doc(db, 'courses', state.courseId), payload);
    } else {
      const ref = await addDoc(collection(db, 'courses'), {
        ...payload,
        dateCreation: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      state.courseId = ref.id;
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

function boot() {
  mountShell();
  bindGlobalActions();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    try {
      await initForUser(user);
    } catch (error) {
      console.error('[SBI Course Editor V2] Initialisation impossible :', error);
      setStatus('Erreur d’initialisation', 'error');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
