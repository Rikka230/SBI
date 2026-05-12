let firestoreToolsPromise = null;

async function getFirestoreTools() {
  if (!firestoreToolsPromise) {
    firestoreToolsPromise = Promise.all([
      import('/js/firebase-init.js?v=8.0P.93'),
      import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js")
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

const PUBLIC_FORMATIONS_COLLECTION = 'publicFormations';
const PUBLIC_RESOURCES_COLLECTION = 'publicResources';
const PUBLIC_CONTENT_VERSION = '8.0P.93';

const DEFAULT_COVER_LABEL = 'SBI';
const COMING_SOON_COVER_URL = 'assets/coming.png';

const FORMATION_FALLBACKS = [
  {
    id: 'fallback-marketing-communication',
    title: 'Marketing & Communication',
    subtitle: 'Construire une marque sportive forte',
    category: 'Catalogue SBI',
    level: 'Fondamentaux',
    duration: '12 modules',
    modality: 'E-learning',
    shortSummary: 'Construire une marque sportive, piloter une campagne et valoriser une communauté.',
    longDescription: 'Un parcours pensé pour apprendre à positionner une offre sportive, structurer une communication claire et transformer l’attention en engagement durable.',
    objectives: ['Comprendre les fondamentaux du marketing sportif', 'Structurer une campagne de communication', 'Valoriser une communauté autour d’un projet'],
    highlights: ['Approche métier', 'Cas appliqués sport business', 'Méthode progressive'],
    status: 'published',
    featuredOnHome: true,
    displayOrder: 10,
    homeOrder: 10,
    slug: 'marketing-communication'
  },
  {
    id: 'fallback-management-leadership',
    title: 'Management & Leadership',
    subtitle: 'Piloter une équipe et cadrer un projet',
    category: 'Catalogue SBI',
    level: 'Intermédiaire',
    duration: '9 modules',
    modality: 'E-learning',
    shortSummary: 'Manager une équipe, cadrer un projet et prendre les bonnes décisions sous pression.',
    longDescription: 'Une formation pour développer une posture professionnelle, clarifier les responsabilités et accompagner la progression d’une équipe.',
    objectives: ['Organiser une équipe', 'Suivre un projet', 'Développer une posture de leader'],
    highlights: ['Outils concrets', 'Vision terrain', 'Progression structurée'],
    status: 'published',
    featuredOnHome: true,
    displayOrder: 20,
    homeOrder: 20,
    slug: 'management-leadership'
  },
  {
    id: 'fallback-evenementiel-sportif',
    title: 'Événementiel sportif',
    subtitle: 'Concevoir une expérience sportive',
    category: 'Catalogue SBI',
    level: 'Fondamentaux',
    duration: '8 modules',
    modality: 'E-learning',
    shortSummary: 'Concevoir, produire et sécuriser une expérience sportive de bout en bout.',
    longDescription: 'Un parcours dédié aux coulisses de l’événementiel sportif : préparation, coordination, exploitation et expérience participant.',
    objectives: ['Préparer un événement', 'Coordonner les parties prenantes', 'Analyser les risques opérationnels'],
    highlights: ['Méthode événementielle', 'Vision production', 'Culture terrain'],
    status: 'published',
    featuredOnHome: true,
    displayOrder: 30,
    homeOrder: 30,
    slug: 'evenementiel-sportif'
  },
  {
    id: 'fallback-digital-innovation',
    title: 'Digital & Innovation',
    subtitle: 'Comprendre les nouveaux formats',
    category: 'Catalogue SBI',
    level: 'Prochainement',
    duration: 'À compléter',
    modality: 'E-learning',
    shortSummary: 'Utiliser les outils numériques, la data et les nouveaux formats pour accélérer.',
    longDescription: '',
    objectives: [],
    highlights: [],
    status: 'coming_soon',
    featuredOnHome: true,
    displayOrder: 40,
    homeOrder: 40,
    slug: 'digital-innovation'
  }
];

const BROCHURE_FALLBACKS = [
  {
    id: 'fallback-brochure-formations',
    title: 'Brochure formations SBI',
    type: 'brochure',
    category: 'Catalogue',
    description: 'Une vue claire des formations, des parcours et de l\'accompagnement SBI.',
    status: 'published',
    globalVisible: true,
    displayOrder: 10
  },
  {
    id: 'fallback-guide-alternance',
    title: 'Guide alternance & aide',
    type: 'document',
    category: 'Entreprise',
    description: 'Les repères essentiels pour préparer un recrutement en alternance.',
    status: 'published',
    globalVisible: true,
    displayOrder: 20
  },
  {
    id: 'fallback-programme-rncp',
    title: 'Programme Bac / RNCP Niveau 4',
    type: 'brochure',
    category: 'Formation',
    description: 'Le cadre de formation SBI centré sur le Bac / RNCP Niveau 4.',
    status: 'published',
    globalVisible: true,
    displayOrder: 30
  },
  {
    id: 'fallback-fiche-accompagnement',
    title: 'Fiche accompagnement',
    type: 'document',
    category: 'Conseil',
    description: 'Comment SBI accompagne candidats et entreprises avant, pendant et après.',
    status: 'published',
    globalVisible: true,
    displayOrder: 40
  }
];

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean);
  }

  return text(value)
    .split(/\r?\n|;/)
    .map((item) => text(item))
    .filter(Boolean);
}

function normalizeSections(value) {
  if (Array.isArray(value)) {
    return value
      .map((section, index) => ({
        title: text(section?.title || section?.titre || section?.heading, `Section ${index + 1}`),
        content: text(section?.content || section?.texte || section?.description),
        order: toNumber(section?.order, index * 10)
      }))
      .filter((section) => section.title || section.content)
      .sort((a, b) => a.order - b.order);
  }

  return [];
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

function getStatus(raw = {}) {
  const status = text(raw.status || raw.publicStatus || raw.etat || (raw.isComingSoon ? 'coming_soon' : 'published')).toLowerCase();

  if (['coming_soon', 'prochainement', 'soon', 'a-venir', 'a_venir'].includes(status)) return 'coming_soon';
  if (['draft', 'brouillon', 'hidden', 'masque'].includes(status)) return 'draft';
  return 'published';
}

function isPublicVisible(item) {
  return item.status === 'published' || item.status === 'coming_soon';
}

function isComingSoon(item) {
  return item.status === 'coming_soon';
}

function normalizeFormation(raw = {}, id = '') {
  const title = text(raw.title || raw.titre || raw.name, 'Formation SBI');
  const slug = normalizeSlug(raw.slug, normalizeSlug(title, id || 'formation-sbi'));
  const cover = raw.cover && typeof raw.cover === 'object' ? raw.cover : {};

  return {
    id: text(id || raw.id || slug),
    title,
    subtitle: text(raw.subtitle || raw.sousTitre || raw.baseline),
    shortSummary: text(raw.shortSummary || raw.resumeCourt || raw.resume || raw.description, 'Contenu SBI en cours de publication.'),
    longDescription: text(raw.longDescription || raw.descriptionLongue || raw.longText || raw.description),
    category: text(raw.category || raw.categorie, 'Formation SBI'),
    level: text(raw.level || raw.niveau),
    duration: text(raw.duration || raw.duree),
    modality: text(raw.modality || raw.modalite),
    targetAudience: text(raw.targetAudience || raw.publicCible || raw.public),
    objectives: normalizeList(raw.objectives || raw.objectifs),
    prerequisites: normalizeList(raw.prerequisites || raw.prerequis),
    program: normalizeSections(raw.program || raw.programme),
    outcomes: normalizeList(raw.outcomes || raw.debouches),
    highlights: normalizeList(raw.highlights || raw.pointsForts),
    infoSections: normalizeSections(raw.infoSections || raw.sections || raw.blocsInformation),
    cta: raw.cta && typeof raw.cta === 'object' ? raw.cta : {},
    brochureIds: normalizeList(raw.brochureIds || raw.brochures),
    status: getStatus(raw),
    featuredOnHome: raw.featuredOnHome === true || raw.miseEnAvantIndex === true,
    displayOrder: toNumber(raw.displayOrder ?? raw.ordreAffichage, 999),
    homeOrder: toNumber(raw.homeOrder ?? raw.ordreIndex ?? raw.displayOrder, 999),
    slug,
    cover: {
      url: text(cover.url || raw.coverUrl || raw.imageUrl),
      storagePath: text(cover.storagePath || raw.coverStoragePath),
      objectPositionX: Math.min(100, Math.max(0, toNumber(cover.objectPositionX ?? raw.coverPositionX, 50))),
      objectPositionY: Math.min(100, Math.max(0, toNumber(cover.objectPositionY ?? raw.coverPositionY, 50))),
      alt: text(cover.alt || raw.coverAlt, `${title} - Sport Business Institute`)
    }
  };
}

function normalizeResource(raw = {}, id = '') {
  const title = text(raw.title || raw.titre || raw.name, 'Ressource SBI');
  const file = raw.file && typeof raw.file === 'object' ? raw.file : {};
  const thumbnail = raw.thumbnail && typeof raw.thumbnail === 'object' ? raw.thumbnail : {};

  return {
    id: text(id || raw.id || normalizeSlug(title, 'ressource-sbi')),
    title,
    description: text(raw.description || raw.resume, 'Ressource SBI en cours de publication.'),
    type: text(raw.type, 'document'),
    category: text(raw.category || raw.categorie, 'Ressource'),
    status: getStatus(raw),
    globalVisible: raw.globalVisible !== false,
    displayOrder: toNumber(raw.displayOrder ?? raw.ordreAffichage, 999),
    assignedFormationIds: normalizeList(raw.assignedFormationIds || raw.formationIds),
    file: {
      url: text(file.url || raw.fileUrl || raw.pdfUrl),
      storagePath: text(file.storagePath || raw.fileStoragePath),
      mimeType: text(file.mimeType || raw.mimeType),
      size: toNumber(file.size || raw.fileSize, 0)
    },
    externalUrl: text(raw.externalUrl || raw.url),
    thumbnail: {
      url: text(thumbnail.url || raw.thumbnailUrl || raw.imageUrl),
      objectPositionX: Math.min(100, Math.max(0, toNumber(thumbnail.objectPositionX, 50))),
      objectPositionY: Math.min(100, Math.max(0, toNumber(thumbnail.objectPositionY, 50)))
    }
  };
}

function setStatus(root, selector, message) {
  const status = root.querySelector(selector);
  if (status) status.textContent = message;
}

async function loadPublicCollection(collectionName, normalizer, queryBuilder = null) {
  const { db, collection, getDocs, query, where } = await getFirestoreTools();
  const baseRef = collection(db, collectionName);
  const collectionRef = typeof queryBuilder === 'function' ? queryBuilder(baseRef, { query, where }) : baseRef;
  const snapshot = await getDocs(collectionRef);
  const items = [];

  snapshot.forEach((docSnap) => {
    items.push(normalizer(docSnap.data() || {}, docSnap.id));
  });

  return items;
}

function createElement(tag, className = '', textContent = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function appendList(container, title, values) {
  if (!values?.length) return;

  const block = createElement('div', 'public-formation-detail-block');
  block.append(createElement('h4', 'text-italic', title));
  const list = createElement('ul');
  values.forEach((value) => list.append(createElement('li', 'text-italic', value)));
  block.append(list);
  container.append(block);
}

function getFormationCoverUrl(formation) {
  if (isComingSoon(formation)) return COMING_SOON_COVER_URL;
  return text(formation?.cover?.url);
}

function applyCoverBackground(element, formation) {
  const coverUrl = getFormationCoverUrl(formation);
  const x = isComingSoon(formation) ? 50 : toNumber(formation?.cover?.objectPositionX, 50);
  const y = isComingSoon(formation) ? 50 : toNumber(formation?.cover?.objectPositionY, 50);

  element.style.setProperty('--sbi-cover-x', `${x}%`);
  element.style.setProperty('--sbi-cover-y', `${y}%`);

  if (isComingSoon(formation)) {
    element.classList.add('has-coming-cover');
  } else {
    element.classList.remove('has-coming-cover');
  }

  if (coverUrl) {
    element.style.setProperty('--sbi-cover-image', `url("${coverUrl.replace(/"/g, '%22')}")`);
    element.classList.add('has-cover-image');
  } else {
    element.style.removeProperty('--sbi-cover-image');
    element.classList.remove('has-cover-image');
  }
}

function createFormationDetails(formation) {
  const details = createElement('div', 'public-formation-details');
  details.hidden = true;

  const introText = text(formation.longDescription || formation.shortSummary);
  if (introText) {
    const intro = createElement('p', 'public-formation-detail-intro text-italic', introText);
    details.append(intro);
  }

  appendList(details, 'Objectifs', formation.objectives);
  appendList(details, 'Prérequis', formation.prerequisites);
  appendList(details, 'Points forts', formation.highlights);
  appendList(details, 'Débouchés', formation.outcomes);

  if (formation.program?.length) {
    const program = createElement('div', 'public-formation-detail-block');
    program.append(createElement('h4', 'text-italic', 'Programme'));
    formation.program.forEach((section) => {
      const item = createElement('article', 'public-formation-mini-section');
      item.append(createElement('strong', 'text-italic', section.title));
      if (section.content) item.append(createElement('p', 'text-italic', section.content));
      program.append(item);
    });
    details.append(program);
  }

  if (formation.infoSections?.length) {
    const sections = createElement('div', 'public-formation-detail-block');
    sections.append(createElement('h4', 'text-italic', 'Informations'));
    formation.infoSections.forEach((section) => {
      const item = createElement('article', 'public-formation-mini-section');
      item.append(createElement('strong', 'text-italic', section.title));
      if (section.content) item.append(createElement('p', 'text-italic', section.content));
      sections.append(item);
    });
    details.append(sections);
  }

  const ctaHref = text(formation.cta?.href, `contact.html?formation=${encodeURIComponent(formation.slug)}`);
  const ctaLabel = text(formation.cta?.label, 'Demander des informations');
  const cta = createElement('a', 'public-inline-link public-formation-cta text-italic', `${ctaLabel} ->`);
  cta.href = ctaHref;
  cta.addEventListener('click', forceCloseFormationSheet);
  details.append(cta);

  return details;
}

function unlockFormationSheetScrollState() {
  document.documentElement.classList.remove('sbi-formation-sheet-open');
  document.body?.classList.remove('sbi-formation-sheet-open');
  document.documentElement.style.removeProperty('--sbi-scrollbar-compensation');
}

function closeFormationSheet(sheet, options = {}) {
  let target = sheet || document.querySelector('[data-sbi-formation-sheet]');
  let closeOptions = options || {};

  if (sheet && typeof sheet === 'object' && !sheet.nodeType) {
    target = document.querySelector('[data-sbi-formation-sheet]');
    closeOptions = sheet;
  }

  unlockFormationSheetScrollState();

  if (!target) return;

  const keyHandler = target.__sbiKeyHandler;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    target.__sbiKeyHandler = null;
  }

  target.classList.remove('is-open');

  if (closeOptions.immediate) {
    target.remove();
    return;
  }

  window.setTimeout(() => target.remove(), 180);
}

function forceCloseFormationSheet() {
  closeFormationSheet(null, { immediate: true });
}

window.SBI_CLOSE_PUBLIC_FORMATION_SHEET = forceCloseFormationSheet;
window.addEventListener('sbi:public-shell:before-navigate', forceCloseFormationSheet);
window.addEventListener('pagehide', forceCloseFormationSheet);

function openFormationSheet(formation) {
  if (!formation || isComingSoon(formation)) return;

  closeFormationSheet();

  const sheet = createElement('aside', 'public-formation-sheet');
  sheet.dataset.sbiFormationSheet = 'true';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `Fiche formation ${formation.title}`);

  const shell = createElement('div', 'public-formation-sheet-shell');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'public-formation-sheet-close';
  closeButton.setAttribute('aria-label', 'Fermer la fiche formation');
  closeButton.textContent = '×';

  const hero = createElement('div', 'public-formation-sheet-hero');
  const cover = createElement('div', 'public-formation-sheet-cover');
  applyCoverBackground(cover, formation);
  const heroCopy = createElement('div', 'public-formation-sheet-hero-copy');
  heroCopy.append(createElement('span', 'public-formation-kicker text-italic', formation.category || 'Formation SBI'));
  heroCopy.append(createElement('h2', 'text-italic', formation.title));
  if (formation.subtitle) heroCopy.append(createElement('p', 'text-italic', formation.subtitle));
  hero.append(cover, heroCopy);

  const body = createElement('div', 'public-formation-sheet-body');
  const meta = createElement('div', 'public-formation-sheet-meta');
  [formation.level, formation.duration, formation.modality, formation.targetAudience].filter(Boolean).forEach((value) => {
    meta.append(createElement('span', 'text-italic', value));
  });
  if (meta.children.length) body.append(meta);

  const details = createFormationDetails(formation);
  details.hidden = false;
  body.append(details);

  shell.append(closeButton, hero, body);
  sheet.append(shell);
  document.body.append(sheet);

  const keyHandler = (event) => {
    if (event.key === 'Escape') closeFormationSheet(sheet);
  };
  sheet.__sbiKeyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);
  closeButton.addEventListener('click', () => closeFormationSheet(sheet));
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeFormationSheet(sheet);
  });

  const scrollbarCompensation = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  document.documentElement.style.setProperty('--sbi-scrollbar-compensation', `${scrollbarCompensation}px`);
  document.documentElement.classList.add('sbi-formation-sheet-open');
  document.body.classList.add('sbi-formation-sheet-open');
  window.requestAnimationFrame(() => sheet.classList.add('is-open'));
  closeButton.focus({ preventScroll: true });
}

function createFormationCard(formation, options = {}) {
  const isHome = options.mode === 'home';
  const article = createElement('article', isHome ? 'parcours-card fade-in visible sbi-home-formation-card' : 'public-formation-card fade-in visible');
  article.dataset.formationId = formation.id;
  article.dataset.formationSlug = formation.slug;
  article.dataset.formationStatus = formation.status;
  if (isComingSoon(formation)) article.classList.add('is-coming-soon');
  applyCoverBackground(article, formation);

  const mask = createElement('div', isHome ? 'card-mask' : 'public-formation-cover-mask');
  const badge = createElement('div', isHome ? 'card-badge' : 'public-formation-badge');
  const content = createElement('div', isHome ? 'card-content' : 'public-formation-content');

  const statusLabel = isComingSoon(formation) ? 'Prochainement' : formation.category;
  content.append(createElement('span', 'public-formation-kicker text-italic', statusLabel));

  const title = createElement('h3', 'text-italic', formation.title);
  content.append(title);

  if (!isHome && formation.subtitle) {
    content.append(createElement('p', 'public-formation-subtitle text-italic', formation.subtitle));
  }

  const meta = createElement('div', isHome ? 'card-footer' : 'public-formation-meta');
  const metaItems = [formation.duration, formation.level, formation.modality].filter(Boolean).slice(0, isHome ? 1 : 3);
  metaItems.forEach((value) => meta.append(createElement('span', 'course-count text-italic', value)));

  if (!isComingSoon(formation)) {
    const arrow = createElement('span', 'arrow text-blue', isHome ? '→' : '+');
    meta.append(arrow);
  }

  content.append(meta);

  if (!isHome) {
    content.append(createElement('p', 'public-formation-summary text-italic', formation.shortSummary));
  }

  article.append(mask, badge, content);

  if (isComingSoon(formation)) {
    article.setAttribute('aria-disabled', 'true');
    article.title = `${formation.title} - prochainement`;
    return article;
  }

  if (isHome) {
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', `Ouvrir la fiche formation ${formation.title}`);
    return article;
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'public-formation-toggle text-italic';
  toggle.textContent = 'Ouvrir la fiche complète';
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFormationSheet(formation);
  });

  content.append(toggle);
  return article;
}

function createResourceCard(item) {
  const article = createElement('article', 'public-resource-card fade-in visible');
  article.dataset.resourceId = item.id;

  const marker = createElement('span', 'public-card-index', item.category || item.type || 'SBI');
  const title = createElement('h3', 'text-italic', item.title);
  const description = createElement('p', 'text-italic', item.description);

  article.append(marker, title, description);

  const href = item.file.url || item.externalUrl || `contact.html?brochure=${encodeURIComponent(item.title)}`;
  const link = createElement('a', 'public-inline-link text-italic', item.file.url || item.externalUrl ? 'Consulter ->' : 'Demander la brochure ->');
  link.href = href;
  if (item.file.url || item.externalUrl) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  article.append(link);

  return article;
}

function sortByDisplay(items, field = 'displayOrder') {
  return [...items].sort((a, b) => {
    const orderDiff = toNumber(a[field], 999) - toNumber(b[field], 999);
    if (orderDiff !== 0) return orderDiff;
    return String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' });
  });
}

function injectFormationStructuredData(formations) {
  const existing = document.getElementById('sbi-public-formations-jsonld');
  if (existing) existing.remove();

  const visible = formations.filter(isPublicVisible).slice(0, 24);
  if (!visible.length) return;

  const script = document.createElement('script');
  script.id = 'sbi-public-formations-jsonld';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Formations Sport Business Institute',
    itemListElement: visible.map((formation, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Course',
        name: formation.title,
        description: formation.shortSummary,
        provider: {
          '@type': 'Organization',
          name: 'Sport Business Institute',
          sameAs: 'https://www.sbigroup.fr'
        }
      }
    }))
  });
  document.head.append(script);
}

function createHomePreviewPanel(root) {
  let panel = root.querySelector('[data-sbi-home-formations-preview]');
  if (panel) return panel;

  const grid = root.querySelector('[data-sbi-home-formations-feed]');
  if (!grid) return null;

  panel = createElement('div', 'sbi-home-formation-preview');
  panel.dataset.sbiHomeFormationsPreview = 'true';
  panel.hidden = true;
  grid.insertAdjacentElement('afterend', panel);
  return panel;
}

function renderHomePreview(panel, formation) {
  if (!panel || !formation || isComingSoon(formation)) return;

  panel.hidden = false;
  panel.innerHTML = '';

  const copy = createElement('div', 'sbi-home-formation-preview-copy');
  copy.append(createElement('span', 'section-surtitle text-blue uppercase text-italic', formation.category));
  copy.append(createElement('h3', 'text-italic', formation.title));
  copy.append(createElement('p', 'text-italic', formation.longDescription || formation.shortSummary));

  const meta = createElement('div', 'sbi-home-formation-preview-meta');
  [formation.level, formation.duration, formation.modality].filter(Boolean).forEach((value) => {
    meta.append(createElement('span', 'text-italic', value));
  });
  copy.append(meta);

  const actions = createElement('div', 'sbi-home-formation-preview-actions');
  const allLink = createElement('a', 'btn-primary text-italic', 'Voir toutes les formations');
  allLink.href = `formations.html#${formation.slug}`;
  const contactLink = createElement('a', 'public-outline-cta text-italic', 'Demander des infos');
  contactLink.href = `contact.html?formation=${encodeURIComponent(formation.slug)}`;
  actions.append(allLink, contactLink);
  copy.append(actions);
  panel.append(copy);
}

function bindHomeFormationCards(root, formations) {
  const byId = new Map(formations.map((formation) => [formation.id, formation]));

  root.querySelectorAll('[data-sbi-home-formations-feed] .sbi-home-formation-card').forEach((card) => {
    const formation = byId.get(card.dataset.formationId);
    if (!formation || isComingSoon(formation)) return;

    const activate = () => {
      root.querySelectorAll('.sbi-home-formation-card.is-selected').forEach((node) => node.classList.remove('is-selected'));
      card.classList.add('is-selected');
      openFormationSheet(formation);
    };

    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

async function getPublicFormationsWithFallback() {
  try {
    const loaded = await loadPublicCollection(
      PUBLIC_FORMATIONS_COLLECTION,
      normalizeFormation,
      (baseRef, tools) => tools.query(baseRef, tools.where('status', 'in', ['published', 'coming_soon']))
    );
    const visible = sortByDisplay(loaded.filter(isPublicVisible));
    return { items: visible.length ? visible : FORMATION_FALLBACKS, fromFirebase: visible.length > 0 };
  } catch (error) {
    console.warn('[SBI Public] Formations publiques indisponibles. Fallback HTML appliqué.', error);
    return { items: FORMATION_FALLBACKS, fromFirebase: false, error };
  }
}

async function getPublicResourcesWithFallback() {
  try {
    const loaded = await loadPublicCollection(
      PUBLIC_RESOURCES_COLLECTION,
      normalizeResource,
      (baseRef, tools) => tools.query(baseRef, tools.where('status', '==', 'published'), tools.where('globalVisible', '==', true))
    );
    const visible = sortByDisplay(loaded.filter((item) => item.status === 'published' && item.globalVisible));
    return { items: visible.length ? visible : BROCHURE_FALLBACKS, fromFirebase: visible.length > 0 };
  } catch (error) {
    console.warn('[SBI Public] Ressources publiques indisponibles. Fallback HTML appliqué.', error);
    return { items: BROCHURE_FALLBACKS, fromFirebase: false, error };
  }
}

async function initFormationsPage(root) {
  const grid = root.querySelector('[data-sbi-formations-feed]');
  if (!grid || grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) return;

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;
  grid.classList.add('public-formations-grid');
  setStatus(root, '[data-sbi-formations-status]', 'Chargement du catalogue public SBI...');

  const { items, fromFirebase } = await getPublicFormationsWithFallback();
  const visible = sortByDisplay(items.filter(isPublicVisible));
  grid.replaceChildren(...visible.map((item) => createFormationCard(item)));
  injectFormationStructuredData(visible);

  const publishedCount = visible.filter((item) => item.status === 'published').length;
  const upcomingCount = visible.filter((item) => item.status === 'coming_soon').length;
  const source = fromFirebase ? 'Catalogue Firebase public' : 'Catalogue SBI de base';
  setStatus(root, '[data-sbi-formations-status]', `${source} affiché : ${publishedCount} formation(s) publiée(s), ${upcomingCount} prochainement.`);

  const hash = normalizeSlug(window.location.hash.replace('#', ''));
  if (hash) {
    const target = grid.querySelector(`[data-formation-slug="${hash}"]`);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const formation = visible.find((item) => item.slug === hash);
    if (formation && !isComingSoon(formation)) {
      window.setTimeout(() => openFormationSheet(formation), 180);
    }
  }
}

async function initHomeFeaturedFormations(root) {
  const grid = root.querySelector('[data-sbi-home-formations-feed]');
  if (!grid || grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) return;

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;

  const { items } = await getPublicFormationsWithFallback();
  const featured = sortByDisplay(items.filter((item) => isPublicVisible(item) && item.featuredOnHome), 'homeOrder').slice(0, 4);
  const cards = (featured.length ? featured : FORMATION_FALLBACKS).slice(0, 4);

  grid.replaceChildren(...cards.map((item) => createFormationCard(item, { mode: 'home' })));
  bindHomeFormationCards(root, cards);
}

async function initBrochuresPage(root) {
  const grid = root.querySelector('[data-sbi-brochures-feed]');
  if (!grid || grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) return;

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;
  setStatus(root, '[data-sbi-brochures-status]', 'Chargement des ressources publiques SBI...');

  const { items, fromFirebase } = await getPublicResourcesWithFallback();
  grid.replaceChildren(...items.map((item) => createResourceCard(item)));
  setStatus(root, '[data-sbi-brochures-status]', fromFirebase
    ? 'Ressources Firebase publiques affichées.'
    : 'Ressources SBI de base affichées. Les ressources administrables seront visibles ici dès publication.');
}

function getCheckedValue(form, name) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return text(checked?.value);
}

function buildBrevoPayload(form) {
  const data = new FormData(form);
  const requestConsent = data.get('requestConsent') === 'on';
  const emailConsent = data.get('emailConsent') === 'on';
  const mobileConsent = data.get('mobileConsent') === 'on';

  return {
    email: text(data.get('email')),
    attributes: {
      PRENOM: text(data.get('firstname')),
      NOM: text(data.get('lastname')),
      TELEPHONE: text(data.get('phone')),
      SMS: text(data.get('phone')),
      PROFIL: getCheckedValue(form, 'profile'),
      BESOIN: text(data.get('interest')),
      MESSAGE: text(data.get('message')),
      SOURCE: 'SBI public contact',
      PAGE: window.location.pathname || '/contact.html',
      CONSENT_REPONSE: requestConsent ? 'oui' : 'non',
      CONSENT_EMAIL: emailConsent ? 'oui' : 'non',
      CONSENT_MOBILE: mobileConsent ? 'oui' : 'non'
    },
    consent: {
      requestProcessingAccepted: requestConsent,
      emailCampaigns: emailConsent,
      mobileCampaigns: mobileConsent,
      capturedAt: new Date().toISOString()
    }
  };
}

async function submitBrevoPayload(form, payload) {
  const endpoint = text(form.dataset.brevoEndpoint);
  if (!endpoint) return { mode: 'prepared' };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(text(result.message, `Erreur serveur ${response.status}`));
  }

  return {
    mode: 'sent',
    message: text(result.message),
    warning: text(result.warning),
    brevo: result.brevo || null
  };
}

function getFieldLabel(field) {
  return text(field?.closest?.('[data-field-label]')?.dataset?.fieldLabel)
    || text(field?.dataset?.fieldLabel)
    || text(field?.name)
    || 'ce champ';
}

function getContactValidationError(form) {
  const profile = form.querySelector('input[name="profile"]:checked');
  if (!profile) {
    return {
      field: form.querySelector('input[name="profile"]'),
      message: 'Vous avez oublié de sélectionner votre profil.'
    };
  }

  const requiredFields = [
    form.elements.firstname,
    form.elements.lastname,
    form.elements.email,
    form.elements.phone,
    form.elements.interest,
    form.elements.message
  ].filter(Boolean);

  const missingField = requiredFields.find((field) => !text(field.value));
  if (missingField) {
    return {
      field: missingField,
      message: `Vous avez oublié de remplir ${getFieldLabel(missingField)}.`
    };
  }

  if (form.elements.email && !form.elements.email.validity.valid) {
    return {
      field: form.elements.email,
      message: "L'adresse email n'est pas valide."
    };
  }

  const requestConsent = form.elements.requestConsent;
  if (requestConsent && !requestConsent.checked) {
    return {
      field: requestConsent,
      message: "Veuillez accepter le traitement des données pour envoyer la demande."
    };
  }

  return null;
}

function initContactMessageCounter(form) {
  const message = form.elements.message;
  const counter = form.querySelector('[data-sbi-message-count]');
  if (!message || !counter) return;

  const updateCounter = () => {
    const max = Number(message.getAttribute('maxlength') || 1000);
    counter.textContent = `${message.value.length}/${max}`;
  };

  updateCounter();
  message.addEventListener('input', updateCounter);
}

function isContactFormReady(form) {
  return !getContactValidationError(form);
}

function syncContactSubmitReadiness(form, card) {
  const submitButton = form.querySelector('[data-sbi-contact-submit]');
  const ready = isContactFormReady(form);

  form.classList.toggle('is-ready-to-send', ready);
  card?.classList.toggle('is-ready-to-send', ready);
  submitButton?.classList.toggle('is-ready-to-send', ready);
}

function setContactCardState(card, state = '') {
  if (!card) return;

  card.classList.remove('is-loading', 'is-success', 'is-error');
  if (state) card.classList.add(`is-${state}`);
}


function scrollContactFeedbackIntoView(card) {
  if (!card || !window.matchMedia('(max-width: 768px)').matches) return;

  const target = card.querySelector('[data-sbi-contact-assistant]') || card;
  const header = document.querySelector('.site-header');
  const headerHeight = header?.offsetHeight || 80;

  window.requestAnimationFrame(() => {
    const targetTop = target.getBoundingClientRect().top + window.scrollY;
    const nextTop = Math.max(0, targetTop - headerHeight - 18);
    window.scrollTo({ top: nextTop, behavior: 'smooth' });
  });
}

function initContactAssistant(form, card) {
  const assistant = card?.querySelector('[data-sbi-contact-assistant]');
  const assistantMessage = card?.querySelector('[data-sbi-contact-assistant-message]');
  const status = form.querySelector('[data-sbi-contact-status]');
  const submitButton = form.querySelector('[data-sbi-contact-submit]');
  const submitLabel = form.querySelector('[data-sbi-contact-submit-label]');
  let assistantTimer = null;

  const clearAssistantTimer = () => {
    if (assistantTimer) window.clearTimeout(assistantTimer);
    assistantTimer = null;
  };

  const revealAssistant = (message, tone = 'info', duration = 6200, options = {}) => {
    clearAssistantTimer();

    if (assistantMessage) assistantMessage.textContent = message;
    if (assistant) {
      const persist = options.persist === true || duration === 0;
      assistant.classList.add('is-revealed', 'is-attention');
      assistant.dataset.tone = tone;

      assistantTimer = window.setTimeout(() => {
        assistant.classList.remove('is-attention');
      }, 1100);

      if (!persist) {
        window.setTimeout(() => {
          if (!assistant.matches(':hover') && !assistant.matches(':focus-within')) {
            assistant.classList.remove('is-revealed', 'is-attention');
          }
        }, duration);
      }
    }

    if (status) {
      status.textContent = message;
      status.classList.toggle('is-error', tone === 'error');
      status.classList.toggle('is-success', tone === 'success');
    }

    scrollContactFeedbackIntoView(card);
  };

  const setSubmit = (label, disabled = false) => {
    if (submitLabel) submitLabel.textContent = label;
    if (submitButton) submitButton.disabled = disabled;
  };

  return {
    clear() {
      clearAssistantTimer();
      setContactCardState(card, '');
      setSubmit('Envoyer le message', false);
      if (status) {
        status.textContent = '';
        status.classList.remove('is-error', 'is-success');
      }
      assistant?.classList.remove('is-revealed', 'is-attention');
    },

    loading() {
      setContactCardState(card, 'loading');
      setSubmit('Envoi en cours', true);
      revealAssistant('Je vérifie ta demande avant transmission.', 'info', 4200);
    },

    error(message, field) {
      setContactCardState(card, 'error');
      setSubmit('Envoyer le message', false);
      revealAssistant(message, 'error', 6800);

      if (field?.focus) {
        window.setTimeout(() => field.focus({ preventScroll: true }), 50);
      }
    },

    success(message) {
      setContactCardState(card, 'success');
      setSubmit('Message validé', false);
      revealAssistant(message, 'success', 0, { persist: true });
    }
  };
}

async function hydrateContactDecorativeVideo(root) {
  const video = root.querySelector('[data-site-media="hero-video"].contact-video-bg');
  if (!(video instanceof HTMLVideoElement)) return;

  try {
    const mediaModule = await import('/js/site-index-public.js?v=8.0P.93');
    const initMedia = mediaModule.initSiteIndexMedia || window.SBI_INIT_SITE_INDEX_MEDIA;
    if (typeof initMedia === 'function') await initMedia({ forceRefresh: false });
  } catch (error) {
    video.dataset.mediaState = 'contact-fallback';
  }
}

function initContactForm(root) {
  const form = root.querySelector('[data-sbi-brevo-form]');
  if (!form || form.dataset.sbiContactReady === 'true') return;

  form.dataset.sbiContactReady = 'true';

  const contactRoot = root.querySelector('[data-sbi-contact-root]') || root;
  const card = contactRoot.querySelector('[data-sbi-contact-card]');
  const assistant = initContactAssistant(form, card);
  initContactMessageCounter(form);
  hydrateContactDecorativeVideo(root);

  const params = new URLSearchParams(window.location.search);
  const interest = form.elements.interest;
  const message = form.elements.message;
  const profile = form.elements.profile;
  const motif = text(params.get('motif') || params.get('brochure'));

  if (interest && !interest.value && motif) {
    const lowerMotif = motif.toLowerCase();
    if (lowerMotif.includes('aide') || lowerMotif.includes('alternance')) interest.value = 'alternance';
    else if (lowerMotif.includes('brochure')) interest.value = 'brochure';
    else interest.value = 'formation';
  }

  if (profile && motif.toLowerCase().includes('estimation-aide')) {
    const companyProfile = form.querySelector('input[name="profile"][value="entreprise"]');
    if (companyProfile && !companyProfile.checked) {
      companyProfile.checked = true;
      companyProfile.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (message && !message.value) {
    const transferredMessage = text(params.get('message'));

    if (transferredMessage) {
      message.value = transferredMessage;
    } else if (params.has('montant')) {
      message.value = [
        `Montant estimé : ${text(params.get('montant'))}`,
        `Statut : ${text(params.get('statut'))}`,
        `Formation : ${text(params.get('formation'))}`
      ].join('\n');
    }

    if (message.value) {
      message.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  const clearResolvedState = () => {
    if (
      card?.classList.contains('is-error') ||
      card?.classList.contains('is-success')
    ) {
      assistant?.clear();
    }
  };

  const syncReady = () => syncContactSubmitReadiness(form, card);
  syncReady();

  form.addEventListener('input', () => {
    clearResolvedState();
    syncReady();
  });

  form.addEventListener('change', () => {
    clearResolvedState();
    syncReady();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const validationError = getContactValidationError(form);
    if (validationError) {
      assistant?.error(validationError.message, validationError.field);
      syncReady();
      return;
    }

    const payload = buildBrevoPayload(form);
    window.SBI_LAST_BREVO_CONTACT_PAYLOAD = payload;

    assistant?.loading();

    try {
      const result = await submitBrevoPayload(form, payload);
      const message = result.mode === 'sent'
        ? text(result.message, 'Votre message a bien été envoyé. L’équipe SBI revient vers vous rapidement.')
        : 'Votre demande est validée. Il reste à brancher l’envoi Brevo côté serveur.';
      form.reset();
      form.elements.message?.dispatchEvent(new Event('input', { bubbles: true }));
      syncReady();
      assistant?.success(message);
    } catch (error) {
      assistant?.error(text(error?.message, 'La demande est prête, mais l’envoi Brevo n’est pas disponible pour le moment.'));
    }
  });
}

export function initSbiPublicPages(root = document) {
  const page = document.body?.dataset?.sbiPublicPage || '';
  const pathname = window.location.pathname.toLowerCase();
  const isHome = page === 'home' || pathname === '/' || pathname.endsWith('/index.html');

  if (isHome) initHomeFeaturedFormations(root);
  if (page === 'formations') initFormationsPage(root);
  if (page === 'ressources') initBrochuresPage(root);
  if (page === 'contact') initContactForm(root);
}

window.SBI_INIT_PUBLIC_PAGES = initSbiPublicPages;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSbiPublicPages(document), { once: true });
} else {
  initSbiPublicPages(document);
}
