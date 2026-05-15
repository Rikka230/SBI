/*
 * SBI 8.0P.150 - Rendu public blocs conformité / Qualiopi / RNCP
 *
 * Hotfix P2G.4 :
 * - charge les formations avec la même requête publique que sbi-public-pages.js
 *   (status in published / coming_soon) pour respecter les rules Firestore ;
 * - injecte les blocs dans la fiche publique dès qu'elle s'ouvre ;
 * - fonctionne en accès direct et après ouverture dynamique de fiche.
 */

const SBI_FORMATION_COMPLIANCE_VERSION = '8.0P.150';
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
let lastRenderSignature = '';

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
      getDocs: firestoreModule.getDocs,
      query: firestoreModule.query,
      where: firestoreModule.where
    }));
  }

  return firestoreToolsPromise;
}

function normalizeCompliance(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return COMPLIANCE_LABELS.reduce((payload, [key]) => {
    payload[key] = text(source[key]);
    return payload;
  }, {});
}

async function loadPublicFormations({ force = false } = {}) {
  if (force) cachedFormationsPromise = null;

  if (!cachedFormationsPromise) {
    cachedFormationsPromise = getFirestoreTools().then(async ({ db, collection, getDocs, query, where }) => {
      const ref = collection(db, PUBLIC_FORMATIONS_COLLECTION);

      const snapshot = await getDocs(
        query(ref, where('status', 'in', ['published', 'coming_soon']))
      );

      const items = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const title = text(data.title || data.titre || data.name, 'Formation SBI');
        const slug = normalizeSlug(data.slug, normalizeSlug(title, docSnap.id));

        items.push({
          id: docSnap.id,
          title,
          slug,
          status: text(data.status || data.publicStatus, 'published'),
          complianceSections: normalizeCompliance(data.complianceSections)
        });
      });

      return items;
    });
  }

  return cachedFormationsPromise;
}

function getCurrentSlug() {
  const params = new URLSearchParams(window.location.search);
  return normalizeSlug(params.get(FORMATION_QUERY_KEY) || params.get('slug') || window.location.hash.replace('#', ''));
}

function getOpenSheet() {
  return document.querySelector('[data-sbi-formation-sheet], .public-formation-sheet');
}

function getSheetTitle(sheet = getOpenSheet()) {
  return text(
    sheet?.querySelector('.public-formation-sheet-hero-copy h2')?.textContent
    || sheet?.querySelector('h2')?.textContent
  );
}

function getSheetSlugCandidate(sheet = getOpenSheet()) {
  const title = getSheetTitle(sheet);
  return normalizeSlug(title);
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
      white-space: pre-line;
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
  if (!sheet || !formation) return false;

  const details = sheet.querySelector('.public-formation-details');
  if (!details) return false;

  const entries = getVisibleComplianceEntries(formation.complianceSections);
  details.querySelector('[data-sbi-formation-compliance]')?.remove();

  if (!entries.length) return false;

  ensureStyle();

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

  const infoBlock = Array.from(details.querySelectorAll('.public-formation-detail-block h4'))
    .find((heading) => heading.textContent.trim().toLowerCase() === 'informations')
    ?.closest('.public-formation-detail-block');

  const cta = details.querySelector('.public-formation-cta');

  if (programBlock?.parentNode) {
    programBlock.parentNode.insertBefore(block, programBlock);
  } else if (infoBlock?.parentNode) {
    infoBlock.parentNode.insertBefore(block, infoBlock);
  } else if (cta?.parentNode) {
    cta.parentNode.insertBefore(block, cta);
  } else {
    details.append(block);
  }

  return true;
}

async function renderCurrentFormationCompliance({ force = false } = {}) {
  const sheet = getOpenSheet();
  if (!sheet) {
    lastRenderSignature = '';
    return false;
  }

  const currentSlug = getCurrentSlug();
  const sheetTitle = getSheetTitle(sheet);
  const sheetSlug = getSheetSlugCandidate(sheet);
  const signature = `${currentSlug}|${sheetSlug}|${sheetTitle}|${force ? Date.now() : ''}`;

  if (!force && lastRenderSignature === signature && sheet.querySelector('[data-sbi-formation-compliance]')) {
    return true;
  }

  try {
    const formations = await loadPublicFormations({ force });
    const formation = formations.find((item) => currentSlug && item.slug === currentSlug)
      || formations.find((item) => sheetSlug && item.slug === sheetSlug)
      || formations.find((item) => sheetTitle && item.title.trim().toLowerCase() === sheetTitle.trim().toLowerCase());

    const rendered = renderComplianceBlock(sheet, formation);
    lastRenderSignature = signature;

    window.SBI_LAST_FORMATION_COMPLIANCE_STATUS = {
      version: SBI_FORMATION_COMPLIANCE_VERSION,
      rendered,
      currentSlug,
      sheetSlug,
      sheetTitle,
      matched: formation?.slug || '',
      hasEntries: Boolean(formation && getVisibleComplianceEntries(formation.complianceSections).length)
    };

    return rendered;
  } catch (error) {
    console.warn('[SBI Formation Compliance] Rendu impossible :', error);
    window.SBI_LAST_FORMATION_COMPLIANCE_STATUS = {
      version: SBI_FORMATION_COMPLIANCE_VERSION,
      rendered: false,
      error: String(error?.message || error)
    };
    return false;
  }
}

function scheduleRender({ force = false, delay = 80 } = {}) {
  window.setTimeout(() => {
    renderCurrentFormationCompliance({ force });
  }, delay);

  window.setTimeout(() => {
    renderCurrentFormationCompliance({ force });
  }, delay + 420);
}

function init() {
  if ((document.body?.dataset?.sbiPublicPage || '') !== 'formations') return;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => scheduleRender());
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'data-sbi-formation-sheet']
  });

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-formation-slug], .sbi-home-formation-card, .parcours-card')) {
      scheduleRender({ force: true, delay: 120 });
    }
  }, true);

  window.addEventListener('popstate', () => scheduleRender({ force: true }));
  window.addEventListener('pageshow', () => scheduleRender({ force: true }));
  window.addEventListener('sbi:public-shell:navigated', () => scheduleRender({ force: true }));

  window.SBI_RENDER_FORMATION_COMPLIANCE = (options = {}) => renderCurrentFormationCompliance({ force: options.force !== false });
  window.SBI_REFRESH_FORMATION_COMPLIANCE_CACHE = () => {
    cachedFormationsPromise = null;
    return renderCurrentFormationCompliance({ force: true });
  };

  [120, 650, 1400].forEach((delay) => scheduleRender({ force: true, delay }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
