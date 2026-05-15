/*
 * SBI 8.0P.147 - Rendu public blocs conformité / Qualiopi / RNCP
 *
 * Lit publicFormations.complianceSections et injecte une section dédiée
 * dans la fiche formation ouverte. Compatible avec le rendu existant.
 */

const SBI_FORMATION_COMPLIANCE_VERSION = '8.0P.147';
const PUBLIC_FORMATIONS_COLLECTION = 'publicFormations';
const FORMATION_QUERY_KEY = 'formation';

const COMPLIANCE_LABELS = [
  ['evaluation', 'Évaluation'],
  ['certification', 'Certification / RNCP'],
  ['accessibility', 'Accessibilité / handicap'],
  ['teachingMethods', 'Méthodes pédagogiques'],
  ['admission', 'Modalités d’admission'],
  ['technicalMeans', 'Moyens techniques'],
  ['complaints', 'Procédure réclamation']
];

let firestoreToolsPromise = null;
let cachedFormationsPromise = null;
let lastRenderedKey = '';

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
      collection: firestoreModule.collection,
      getDocs: firestoreModule.getDocs
    }));
  }

  return firestoreToolsPromise;
}

async function loadPublicFormations() {
  if (!cachedFormationsPromise) {
    cachedFormationsPromise = getFirestoreTools().then(async ({ db, collection, getDocs }) => {
      const snapshot = await getDocs(collection(db, PUBLIC_FORMATIONS_COLLECTION));
      const items = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const title = text(data.title || data.titre || data.name, 'Formation SBI');
        items.push({
          id: docSnap.id,
          title,
          slug: normalizeSlug(data.slug, normalizeSlug(title, docSnap.id)),
          complianceSections: data.complianceSections || {}
        });
      });
      return items;
    });
  }

  return cachedFormationsPromise;
}

function getCurrentSlug() {
  const params = new URLSearchParams(window.location.search);
  return normalizeSlug(params.get(FORMATION_QUERY_KEY) || window.location.hash.replace('#', ''));
}

function getSheetTitle() {
  return text(document.querySelector('[data-sbi-formation-sheet] .public-formation-sheet-hero-copy h2')?.textContent);
}

function getVisibleComplianceEntries(compliance = {}) {
  return COMPLIANCE_LABELS
    .map(([key, label]) => [key, label, text(compliance?.[key])])
    .filter(([, , value]) => Boolean(value));
}

function ensureStyle() {
  if (document.getElementById('sbi-formation-compliance-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-formation-compliance-style';
  style.textContent = `
    .public-formation-compliance-block {
      margin-top: 1.25rem;
      padding: clamp(1rem, 2vw, 1.35rem);
      border: 1px solid rgba(87, 130, 255, 0.22);
      border-radius: 14px;
      background: linear-gradient(145deg, rgba(87, 130, 255, 0.08), rgba(255, 255, 255, 0.025));
    }

    .public-formation-compliance-block h4 {
      margin: 0 0 0.9rem;
      color: #fff;
    }

    .public-formation-compliance-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.8rem;
    }

    .public-formation-compliance-card {
      padding: 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 11px;
      background: rgba(3, 7, 14, 0.45);
    }

    .public-formation-compliance-card strong {
      display: block;
      margin-bottom: 0.4rem;
      color: #cfe0ff;
      font-size: 0.86rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .public-formation-compliance-card p {
      margin: 0;
      color: var(--text-muted, #9ba7bd);
      line-height: 1.55;
    }

    @media (max-width: 720px) {
      .public-formation-compliance-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}

function renderComplianceBlock(sheet, formation) {
  if (!sheet || !formation) return;

  const entries = getVisibleComplianceEntries(formation.complianceSections);
  sheet.querySelector('[data-sbi-formation-compliance]')?.remove();
  if (!entries.length) return;

  ensureStyle();

  const details = sheet.querySelector('.public-formation-details');
  if (!details) return;

  const block = document.createElement('div');
  block.className = 'public-formation-compliance-block';
  block.dataset.sbiFormationCompliance = SBI_FORMATION_COMPLIANCE_VERSION;

  const title = document.createElement('h4');
  title.className = 'text-italic';
  title.textContent = 'Informations pédagogiques et qualité';
  block.append(title);

  const grid = document.createElement('div');
  grid.className = 'public-formation-compliance-grid';

  entries.forEach(([, label, value]) => {
    const card = document.createElement('article');
    card.className = 'public-formation-compliance-card';

    const heading = document.createElement('strong');
    heading.className = 'text-italic';
    heading.textContent = label;

    const paragraph = document.createElement('p');
    paragraph.className = 'text-italic';
    paragraph.textContent = value;

    card.append(heading, paragraph);
    grid.append(card);
  });

  block.append(grid);

  const programBlock = Array.from(details.querySelectorAll('.public-formation-detail-block h4'))
    .find((heading) => heading.textContent.trim().toLowerCase() === 'programme')
    ?.closest('.public-formation-detail-block');

  if (programBlock?.parentNode) {
    programBlock.parentNode.insertBefore(block, programBlock);
  } else {
    const cta = details.querySelector('.public-formation-cta');
    if (cta?.parentNode) cta.parentNode.insertBefore(block, cta);
    else details.append(block);
  }
}

async function tryRenderCurrentSheet({ force = false } = {}) {
  const sheet = document.querySelector('[data-sbi-formation-sheet]');
  if (!sheet) {
    lastRenderedKey = '';
    return;
  }

  const slug = getCurrentSlug();
  const title = getSheetTitle();
  const renderKey = slug || title;

  if (!force && renderKey && renderKey === lastRenderedKey && sheet.querySelector('[data-sbi-formation-compliance]')) return;
  lastRenderedKey = renderKey;

  try {
    const formations = await loadPublicFormations();
    const formation = formations.find((item) => slug && item.slug === slug)
      || formations.find((item) => title && item.title === title);

    renderComplianceBlock(sheet, formation);
  } catch (error) {
    console.warn('[SBI Formation Compliance] Rendu impossible :', error);
  }
}

function init() {
  if ((document.body?.dataset?.sbiPublicPage || '') !== 'formations') return;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => tryRenderCurrentSheet());
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => tryRenderCurrentSheet({ force: true }));
  window.addEventListener('sbi:public-shell:page-ready', () => tryRenderCurrentSheet({ force: true }));

  [250, 800, 1600].forEach((delay) => {
    window.setTimeout(() => tryRenderCurrentSheet({ force: true }), delay);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
