/*
 * SBI 8.0P.149 - Admin bridge blocs conformité / Qualiopi / RNCP
 *
 * Hotfix P2G.3 :
 * - ne recharge plus Firebase pendant la saisie ;
 * - ne réécrit plus les champs déjà modifiés ;
 * - sauvegarde les blocs conformité au submit de la fiche ;
 * - compatible avec le formulaire legacy existant.
 */

const SBI_PUBLIC_FORMATION_COMPLIANCE_VERSION = '8.0P.149';
const PUBLIC_FORMATIONS_COLLECTION = 'publicFormations';

const COMPLIANCE_FIELDS = [
  ['evaluation', 'Évaluation', 'Modalités d’évaluation, quiz, devoirs, mises en situation, soutenance...'],
  ['certification', 'Certification / RNCP', 'Certification visée, niveau, blocs de compétences, passerelles RNCP...'],
  ['accessibility', 'Accessibilité / handicap', 'Accueil des publics en situation de handicap, adaptations possibles, contact référent...'],
  ['teachingMethods', 'Méthodes pédagogiques', 'E-learning, tutorat, études de cas, mises en pratique, accompagnement...'],
  ['admission', 'Modalités d’admission', 'Conditions d’entrée, entretien, dossier, délai d’accès, positionnement...'],
  ['technicalMeans', 'Moyens techniques', 'Plateforme, ressources numériques, visioconférence, outils, support...'],
  ['complaints', 'Procédure réclamation', 'Canal de réclamation, traitement, délais indicatifs, contact administratif...']
];

let firestoreToolsPromise = null;
let observerStarted = false;
let lastLoadedDocId = '';
let currentDraftKey = '';
let fieldsDirty = false;
let loadInProgress = false;
let saveInProgress = false;
let deferredSaveTimer = null;

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeSlug(value, fallback = '') {
  const base = text(value, fallback);
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

async function getFirestoreTools() {
  if (!firestoreToolsPromise) {
    firestoreToolsPromise = Promise.all([
      import('/js/firebase-init.js?v=8.0P.99'),
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js')
    ]).then(([firebaseModule, firestoreModule]) => ({
      db: firebaseModule.db,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      collection: firestoreModule.collection,
      getDocs: firestoreModule.getDocs,
      query: firestoreModule.query,
      where: firestoreModule.where,
      serverTimestamp: firestoreModule.serverTimestamp
    }));
  }

  return firestoreToolsPromise;
}

function getFieldId(key) {
  return `public-formation-compliance-${key}`;
}

function ensureStyle() {
  if (document.getElementById('sbi-public-formation-compliance-admin-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-public-formation-compliance-admin-style';
  style.textContent = `
    .public-admin-compliance-panel {
      border: 1px solid rgba(87, 130, 255, 0.2);
      border-radius: 12px;
      background: linear-gradient(145deg, rgba(87, 130, 255, 0.055), rgba(255, 255, 255, 0.025));
      padding: 0.9rem 1rem 1rem;
    }

    .public-admin-compliance-panel summary {
      cursor: pointer;
      color: #eaf1ff;
      font-weight: 900;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .public-admin-compliance-panel[open] summary {
      margin-bottom: 0.9rem;
    }

    .public-admin-compliance-panel .public-admin-form-grid {
      margin-top: 0.9rem;
    }

    .public-admin-compliance-panel textarea {
      min-height: 118px;
    }

    .public-admin-compliance-status {
      min-height: 1.2rem;
      margin: 0.65rem 0 0;
      color: var(--text-muted, #9ba7bd);
      font-size: 0.8rem;
      font-weight: 700;
    }

    .public-admin-compliance-status.is-dirty {
      color: #ffd36e;
    }

    .public-admin-compliance-status.is-saved {
      color: #78ffb5;
    }

    .public-admin-compliance-status.is-error {
      color: #ff7b7b;
    }
  `;
  document.head.append(style);
}

function createField(key, label, placeholder) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;

  const textarea = document.createElement('textarea');
  textarea.id = getFieldId(key);
  textarea.rows = 4;
  textarea.placeholder = placeholder;
  textarea.dataset.sbiComplianceKey = key;
  textarea.autocomplete = 'off';

  wrapper.append(textarea);
  return wrapper;
}

function ensureCompliancePanel() {
  const form = document.getElementById('public-formation-form');
  if (!form) return false;

  if (document.getElementById('public-formation-compliance-panel')) return true;

  ensureStyle();

  const panel = document.createElement('details');
  panel.id = 'public-formation-compliance-panel';
  panel.className = 'public-admin-compliance-panel';
  panel.open = true;

  const summary = document.createElement('summary');
  summary.textContent = 'Blocs conformité / Qualiopi / RNCP';
  panel.append(summary);

  const help = document.createElement('p');
  help.className = 'public-admin-help';
  help.innerHTML = 'Ces champs sont stockés dans <code>complianceSections</code> et s’affichent dans une section publique dédiée. Ils ne remplacent pas les sections libres existantes.';
  panel.append(help);

  const grid = document.createElement('div');
  grid.className = 'public-admin-form-grid two';

  COMPLIANCE_FIELDS.forEach(([key, label, placeholder]) => {
    grid.append(createField(key, label, placeholder));
  });

  panel.append(grid);

  const status = document.createElement('p');
  status.id = 'public-formation-compliance-status';
  status.className = 'public-admin-compliance-status';
  status.textContent = `Module conformité chargé (${SBI_PUBLIC_FORMATION_COMPLIANCE_VERSION}).`;
  panel.append(status);

  const programField = document.getElementById('public-formation-program')?.closest('label');
  const sectionsField = document.getElementById('public-formation-sections')?.closest('label');

  if (programField?.parentNode) {
    programField.parentNode.insertBefore(panel, programField);
  } else if (sectionsField?.parentNode) {
    sectionsField.insertAdjacentElement('afterend', panel);
  } else {
    form.append(panel);
  }

  return true;
}

function getComplianceFromForm() {
  return COMPLIANCE_FIELDS.reduce((payload, [key]) => {
    payload[key] = text(document.getElementById(getFieldId(key))?.value);
    return payload;
  }, {});
}

function setComplianceFields(compliance = {}, { preserveDirty = true } = {}) {
  if (preserveDirty && fieldsDirty) return;

  COMPLIANCE_FIELDS.forEach(([key]) => {
    const field = document.getElementById(getFieldId(key));
    if (!field) return;

    const nextValue = text(compliance?.[key]);
    field.value = nextValue;
    field.defaultValue = nextValue;
  });

  fieldsDirty = false;
}

function clearComplianceFields() {
  if (fieldsDirty) return;
  setComplianceFields({}, { preserveDirty: false });
}

function setStatus(message, state = '') {
  const status = document.getElementById('public-formation-compliance-status');
  if (!status) return;

  status.textContent = message;
  status.classList.remove('is-dirty', 'is-saved', 'is-error');

  if (state) {
    status.classList.add(`is-${state}`);
  }
}

function getCurrentFormationDraftKey() {
  const id = text(document.getElementById('public-formation-id')?.value);
  const slug = normalizeSlug(document.getElementById('public-formation-slug')?.value);
  const title = text(document.getElementById('public-formation-title')?.value);
  return id || slug || title;
}

async function findFormationDocId() {
  const id = text(document.getElementById('public-formation-id')?.value);
  if (id) return id;

  const slug = normalizeSlug(document.getElementById('public-formation-slug')?.value);
  const title = text(document.getElementById('public-formation-title')?.value);
  if (!slug && !title) return '';

  const { db, collection, getDocs, query, where } = await getFirestoreTools();
  const ref = collection(db, PUBLIC_FORMATIONS_COLLECTION);

  if (slug) {
    const slugSnap = await getDocs(query(ref, where('slug', '==', slug)));
    if (!slugSnap.empty) return slugSnap.docs[0].id;
  }

  if (title) {
    const titleSnap = await getDocs(query(ref, where('title', '==', title)));
    if (!titleSnap.empty) return titleSnap.docs[0].id;
  }

  return '';
}

function resetLoadStateIfFormationChanged() {
  const nextKey = getCurrentFormationDraftKey();
  if (nextKey !== currentDraftKey) {
    currentDraftKey = nextKey;
    lastLoadedDocId = '';
    fieldsDirty = false;
    window.clearTimeout(deferredSaveTimer);
  }
}

async function loadComplianceForCurrentFormation({ force = false } = {}) {
  if (!ensureCompliancePanel() || loadInProgress) return;

  const modal = document.getElementById('public-formation-modal');
  if (!modal || modal.hidden) return;

  resetLoadStateIfFormationChanged();

  if (fieldsDirty) return;

  const draftKey = getCurrentFormationDraftKey();

  if (!draftKey) {
    lastLoadedDocId = '';
    clearComplianceFields();
    setStatus(`Nouvelle fiche : blocs conformité prêts (${SBI_PUBLIC_FORMATION_COMPLIANCE_VERSION}).`);
    return;
  }

  try {
    loadInProgress = true;

    const docId = await findFormationDocId();

    if (!docId) {
      setStatus('Blocs conformité prêts. Ils seront liés à la fiche après sauvegarde.');
      return;
    }

    if (!force && lastLoadedDocId === docId) return;

    const { db, doc, getDoc } = await getFirestoreTools();
    const snap = await getDoc(doc(db, PUBLIC_FORMATIONS_COLLECTION, docId));
    const data = snap.exists() ? snap.data() : {};

    if (!fieldsDirty) {
      setComplianceFields(data?.complianceSections || {}, { preserveDirty: true });
      lastLoadedDocId = docId;
      setStatus('Blocs conformité récupérés depuis Firebase.');
    }
  } catch (error) {
    console.warn('[SBI Compliance Admin] Lecture impossible :', error);
    setStatus('Impossible de récupérer les blocs conformité pour le moment.', 'error');
  } finally {
    loadInProgress = false;
  }
}

async function saveComplianceForCurrentFormation({ silent = false } = {}) {
  if (!ensureCompliancePanel() || saveInProgress) return false;

  const complianceSections = getComplianceFromForm();

  try {
    saveInProgress = true;

    const docId = await findFormationDocId();

    if (!docId) {
      if (!silent) setStatus('Sauvegarde conformité en attente : fiche non retrouvée. Réouvre la fiche si besoin.', 'error');
      return false;
    }

    const { db, doc, setDoc, serverTimestamp } = await getFirestoreTools();

    await setDoc(doc(db, PUBLIC_FORMATIONS_COLLECTION, docId), {
      complianceSections,
      complianceUpdatedAt: serverTimestamp()
    }, { merge: true });

    fieldsDirty = false;
    lastLoadedDocId = docId;

    COMPLIANCE_FIELDS.forEach(([key]) => {
      const field = document.getElementById(getFieldId(key));
      if (field) field.defaultValue = field.value;
    });

    setStatus('Blocs conformité sauvegardés.', 'saved');
    return true;
  } catch (error) {
    console.error('[SBI Compliance Admin] Sauvegarde impossible :', error);
    if (!silent) setStatus('Erreur pendant la sauvegarde des blocs conformité.', 'error');
    return false;
  } finally {
    saveInProgress = false;
  }
}

function scheduleDeferredSave() {
  window.clearTimeout(deferredSaveTimer);

  deferredSaveTimer = window.setTimeout(() => {
    saveComplianceForCurrentFormation({ silent: true });
  }, 1800);
}

function bindForm() {
  const form = document.getElementById('public-formation-form');
  if (!form || form.dataset.sbiComplianceBound === 'true') return;

  form.dataset.sbiComplianceBound = 'true';

  form.addEventListener('submit', () => {
    window.clearTimeout(deferredSaveTimer);
    saveComplianceForCurrentFormation({ silent: false });
  }, true);

  form.addEventListener('input', (event) => {
    if (!event.target?.dataset?.sbiComplianceKey) return;

    fieldsDirty = true;
    setStatus('Modifications conformité non sauvegardées.', 'dirty');
    scheduleDeferredSave();
  }, true);

  form.addEventListener('change', (event) => {
    if (!event.target?.dataset?.sbiComplianceKey) return;

    fieldsDirty = true;
    setStatus('Modifications conformité non sauvegardées.', 'dirty');
    scheduleDeferredSave();
  }, true);
}

function watchModal() {
  if (observerStarted) return;
  observerStarted = true;

  const tick = () => {
    ensureCompliancePanel();
    bindForm();
    loadComplianceForCurrentFormation();
  };

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(tick);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden']
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;

    if (target.closest?.('#btn-create-public-formation, #public-formations-list, .public-admin-card')) {
      window.setTimeout(() => {
        currentDraftKey = '';
        lastLoadedDocId = '';
        fieldsDirty = false;
        tick();
        window.setTimeout(tick, 450);
      }, 60);
    }
  }, true);

  tick();
}

function init() {
  const path = window.location.pathname.toLowerCase();
  if (!path.endsWith('/admin/formations-cours.html') && !path.endsWith('/admin/formations-cours')) return;

  ensureCompliancePanel();
  bindForm();
  watchModal();

  window.SBI_SAVE_FORMATION_COMPLIANCE = saveComplianceForCurrentFormation;
  window.SBI_LOAD_FORMATION_COMPLIANCE = loadComplianceForCurrentFormation;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
