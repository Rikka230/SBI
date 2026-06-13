let firestoreToolsPromise = null;
let storageToolsPromise = null;

async function getFirestoreTools() {
  if (!firestoreToolsPromise) {
    firestoreToolsPromise = Promise.all([
      import('/js/firebase-init.js?v=8.0P.99'),
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

async function getStorageTools() {
  if (!storageToolsPromise) {
    storageToolsPromise = Promise.all([
      import('/js/firebase-init.js?v=8.0P.99'),
      import("https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js")
    ]).then(([firebaseModule, storageModule]) => ({
      storage: firebaseModule.storage,
      ref: storageModule.ref,
      getBlob: storageModule.getBlob
    }));
  }

  return storageToolsPromise;
}

const PUBLIC_FORMATIONS_COLLECTION = 'publicFormations';
const PUBLIC_RESOURCES_COLLECTION = 'publicResources';
const PUBLIC_CONTENT_VERSION = '8.0P.153';

const DEFAULT_COVER_LABEL = 'SBI';
const COMING_SOON_COVER_URL = '/assets/coming.png';
const SEO_SITE_ORIGIN = 'https://www.sbigroup.fr';
const DYNAMIC_DETAIL_JSONLD_ID = 'sbi-public-dynamic-detail-jsonld';
const FORMATION_QUERY_KEY = 'formation';
const RESOURCE_QUERY_KEY = 'resource';

const FORMATION_COMPLIANCE_LABELS = [
  ['evaluation', 'Évaluation'],
  ['certification', 'Certification / RNCP'],
  ['accessibility', 'Accessibilité / handicap'],
  ['teachingMethods', 'Méthodes pédagogiques'],
  ['admission', 'Modalités d’admission'],
  ['technicalMeans', 'Moyens techniques'],
  ['complaints', 'Procédure réclamation']
];


let activePublicFormations = [];
let activePublicResources = [];

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

function normalizeComplianceSections(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return FORMATION_COMPLIANCE_LABELS.reduce((payload, [key]) => {
    payload[key] = text(raw[key]);
    return payload;
  }, {});
}

function getVisibleComplianceSections(compliance = {}) {
  return FORMATION_COMPLIANCE_LABELS
    .map(([key, title]) => ({
      title,
      content: text(compliance?.[key])
    }))
    .filter((section) => section.content);
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


function normalizeSeo(value = {}, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    title: text(raw.title || raw.seoTitle || fallback.title),
    description: text(raw.description || raw.metaDescription || fallback.description),
    indexable: raw.indexable !== false,
    ogTitle: text(raw.ogTitle),
    ogDescription: text(raw.ogDescription),
    ogImageUrl: text(raw.ogImageUrl || raw.imageUrl),
    sitemapPriority: toNumber(raw.sitemapPriority, 0.6),
    sitemapChangefreq: text(raw.sitemapChangefreq, 'monthly')
  };
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

function createSeoUrl(pathname = '/', params = {}) {
  const url = new URL(pathname, SEO_SITE_ORIGIN);
  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = text(value);
    if (cleanValue) url.searchParams.set(key, cleanValue);
  });
  return url.href;
}

function createRuntimeUrl(pathname = '/', params = {}) {
  const url = new URL(pathname, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = text(value);
    if (cleanValue) url.searchParams.set(key, cleanValue);
  });
  return `${url.pathname}${url.search}`;
}

function createFormationSeoUrl(formation) {
  const slug = text(formation?.slug);
  // Page statique dédiée (crawlable Google + Bing), canonical consolidé.
  return slug
    ? `${SEO_SITE_ORIGIN}/formations/${slug}.html`
    : createSeoUrl('/formations.html');
}

function createFormationRuntimeUrl(formation) {
  const slug = text(formation?.slug);
  return slug
    ? createRuntimeUrl(`/formations/${slug}.html`)
    : createRuntimeUrl('/formations.html');
}

function createResourceSeoUrl(resource) {
  return createSeoUrl('/ressources.html', { [RESOURCE_QUERY_KEY]: resource?.slug });
}

function createResourceRuntimeUrl(resource) {
  return createRuntimeUrl('/ressources.html', { [RESOURCE_QUERY_KEY]: resource?.slug });
}

function getCurrentDynamicSlug(keys = []) {
  const params = new URLSearchParams(window.location.search);
  for (const key of keys) {
    const value = normalizeSlug(params.get(key));
    if (value) return value;
  }
  return normalizeSlug(window.location.hash.replace('#', ''));
}

function readSeoStateFromHead() {
  const getMeta = (selector) => text(document.head.querySelector(selector)?.getAttribute('content'));
  const canonical = document.head.querySelector('link[rel="canonical"]');

  return {
    title: document.title,
    description: getMeta('meta[name="description"]'),
    robots: getMeta('meta[name="robots"]'),
    canonical: text(canonical?.getAttribute('href')),
    ogType: getMeta('meta[property="og:type"]'),
    ogTitle: getMeta('meta[property="og:title"]'),
    ogDescription: getMeta('meta[property="og:description"]'),
    ogUrl: getMeta('meta[property="og:url"]'),
    ogImage: getMeta('meta[property="og:image"]'),
    twitterCard: getMeta('meta[name="twitter:card"]'),
    twitterTitle: getMeta('meta[name="twitter:title"]'),
    twitterDescription: getMeta('meta[name="twitter:description"]'),
    twitterImage: getMeta('meta[name="twitter:image"]')
  };
}

const baseSeoByPage = new Map();

function getCurrentPublicPageId() {
  return text(document.body?.dataset?.sbiPublicPage, 'home');
}

function captureBaseSeoForCurrentPage({ force = false } = {}) {
  const pageId = getCurrentPublicPageId();
  if (!force && baseSeoByPage.has(pageId)) return baseSeoByPage.get(pageId);

  const state = readSeoStateFromHead();
  baseSeoByPage.set(pageId, state);
  return state;
}

function ensureMeta(selector, createNode) {
  let node = document.head.querySelector(selector);
  if (node) return node;

  node = createNode();
  node.dataset.sbiSeoDynamic = 'head';
  const anchor = document.head.querySelector('link[rel="stylesheet"], link[rel="preload"][as="style"], style');
  if (anchor?.parentNode) document.head.insertBefore(node, anchor);
  else document.head.append(node);
  return node;
}

function setMetaContent(selector, value, createNode) {
  const cleanValue = text(value);
  if (!cleanValue) return;
  ensureMeta(selector, createNode).setAttribute('content', cleanValue);
}

function setManagedHeadState(state = {}) {
  if (state.title) document.title = state.title;

  setMetaContent('meta[name="description"]', state.description, () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    return meta;
  });

  setMetaContent('meta[name="robots"]', state.robots || 'index,follow', () => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    return meta;
  });

  const canonicalUrl = text(state.canonical);
  if (canonicalUrl) {
    const canonical = ensureMeta('link[rel="canonical"]', () => {
      const link = document.createElement('link');
      link.rel = 'canonical';
      return link;
    });
    canonical.href = canonicalUrl;
  }

  setMetaContent('meta[property="og:type"]', state.ogType || 'website', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:type');
    return meta;
  });
  setMetaContent('meta[property="og:title"]', state.ogTitle || state.title, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    return meta;
  });
  setMetaContent('meta[property="og:description"]', state.ogDescription || state.description, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:description');
    return meta;
  });
  setMetaContent('meta[property="og:url"]', state.ogUrl || state.canonical, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:url');
    return meta;
  });
  setMetaContent('meta[property="og:image"]', state.ogImage, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:image');
    return meta;
  });
  setMetaContent('meta[name="twitter:card"]', state.twitterCard || 'summary_large_image', () => {
    const meta = document.createElement('meta');
    meta.name = 'twitter:card';
    return meta;
  });
  setMetaContent('meta[name="twitter:title"]', state.twitterTitle || state.title, () => {
    const meta = document.createElement('meta');
    meta.name = 'twitter:title';
    return meta;
  });
  setMetaContent('meta[name="twitter:description"]', state.twitterDescription || state.description, () => {
    const meta = document.createElement('meta');
    meta.name = 'twitter:description';
    return meta;
  });
  setMetaContent('meta[name="twitter:image"]', state.twitterImage || state.ogImage, () => {
    const meta = document.createElement('meta');
    meta.name = 'twitter:image';
    return meta;
  });
}

function removeDynamicDetailStructuredData() {
  document.getElementById(DYNAMIC_DETAIL_JSONLD_ID)?.remove();
}

function injectDynamicDetailStructuredData(payload) {
  removeDynamicDetailStructuredData();
  if (!payload) return;

  const script = document.createElement('script');
  script.id = DYNAMIC_DETAIL_JSONLD_ID;
  script.type = 'application/ld+json';
  script.dataset.sbiSeoDynamic = 'detail';
  script.textContent = JSON.stringify(payload);
  document.head.append(script);
}

function resetDynamicSeoToPageDefaults() {
  removeDynamicDetailStructuredData();
  const state = baseSeoByPage.get(getCurrentPublicPageId()) || captureBaseSeoForCurrentPage();
  setManagedHeadState(state);
}

function getFormationSeoImage(formation) {
  if (isComingSoon(formation)) return createSeoUrl('/assets/coming.png');
  const image = text(formation?.seo?.ogImageUrl || formation?.cover?.url);
  return image || createSeoUrl('/assets/sbi_brand.webp');
}

function getResourceSeoImage(resource) {
  const image = text(resource?.seo?.ogImageUrl || resource?.thumbnail?.url);
  return image || createSeoUrl('/assets/sbi_brand.webp');
}

function applyFormationDynamicSeo(formation) {
  if (!formation || isComingSoon(formation)) return;
  captureBaseSeoForCurrentPage();

  const title = text(formation.seo?.title, `${formation.title} - Formation Sport Business Institute`);
  const description = text(formation.seo?.description || formation.longDescription || formation.shortSummary, `Découvrez la formation ${formation.title} proposée par Sport Business Institute.`);
  const canonical = createFormationSeoUrl(formation);
  const image = getFormationSeoImage(formation);

  setManagedHeadState({
    title,
    description,
    robots: formation.seo?.indexable === false ? 'noindex,follow' : 'index,follow',
    canonical,
    ogType: 'article',
    ogTitle: text(formation.seo?.ogTitle, title),
    ogDescription: text(formation.seo?.ogDescription, description),
    ogUrl: canonical,
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: text(formation.seo?.ogTitle, title),
    twitterDescription: text(formation.seo?.ogDescription, description),
    twitterImage: image
  });

  injectDynamicDetailStructuredData({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: formation.title,
    description,
    url: canonical,
    image,
    courseMode: formation.modality || undefined,
    educationalLevel: formation.level || undefined,
    provider: {
      '@type': 'EducationalOrganization',
      name: 'Sport Business Institute',
      url: SEO_SITE_ORIGIN
    }
  });
}

function applyResourceDynamicSeo(resource) {
  if (!resource) return;
  captureBaseSeoForCurrentPage();

  const title = text(resource.seo?.title, `${resource.title} - Ressource Sport Business Institute`);
  const description = text(resource.seo?.description || resource.description, `Consultez la ressource ${resource.title} proposée par Sport Business Institute.`);
  const canonical = createResourceSeoUrl(resource);
  const image = getResourceSeoImage(resource);

  setManagedHeadState({
    title,
    description,
    robots: resource.seo?.indexable === false ? 'noindex,follow' : 'index,follow',
    canonical,
    ogType: 'article',
    ogTitle: text(resource.seo?.ogTitle, title),
    ogDescription: text(resource.seo?.ogDescription, description),
    ogUrl: canonical,
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: text(resource.seo?.ogTitle, title),
    twitterDescription: text(resource.seo?.ogDescription, description),
    twitterImage: image
  });

  injectDynamicDetailStructuredData({
    '@context': 'https://schema.org',
    '@type': 'DigitalDocument',
    name: resource.title,
    description,
    url: canonical,
    image,
    fileFormat: resource.file?.mimeType || undefined,
    associatedMedia: resource.file?.url ? {
      '@type': 'MediaObject',
      contentUrl: resource.file.url,
      encodingFormat: resource.file.mimeType || 'application/pdf'
    } : undefined,
    publisher: {
      '@type': 'EducationalOrganization',
      name: 'Sport Business Institute',
      url: SEO_SITE_ORIGIN
    }
  });
}

function syncDetailHistory(pathname, key, slug, mode = 'push') {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug || !window.history?.[`${mode}State`]) return;

  const url = new URL(pathname, window.location.origin);
  url.searchParams.set(key, cleanSlug);
  const nextUrl = `${url.pathname}${url.search}`;
  if (`${window.location.pathname}${window.location.search}` === nextUrl) return;

  window.history[`${mode}State`]({ sbiDynamicDetail: key, slug: cleanSlug }, '', nextUrl);
}

function clearDetailHistory(pathname, keys = [], mode = 'push') {
  if (!window.history?.[`${mode}State`]) return;

  const url = new URL(pathname, window.location.origin);
  const nextUrl = url.pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  const hasDynamicParam = keys.some((key) => new URLSearchParams(window.location.search).has(key));
  if (!hasDynamicParam || current === nextUrl) return;

  window.history[`${mode}State`]({ sbiDynamicDetail: null }, '', nextUrl);
}

function isMobilePublicViewport() {
  return window.matchMedia?.('(max-width: 768px)')?.matches || window.innerWidth <= 768;
}

function forceResetMobileFormationsSlider(grid) {
  if (!grid || !isMobilePublicViewport()) return;

  if (!grid.__sbiMobileSliderTouchBound) {
    const markTouched = () => {
      grid.dataset.sbiMobileSliderTouched = 'true';
    };
    grid.addEventListener('pointerdown', markTouched, { passive: true });
    grid.addEventListener('touchstart', markTouched, { passive: true });
    grid.addEventListener('wheel', markTouched, { passive: true });
    grid.__sbiMobileSliderTouchBound = true;
  }

  delete grid.dataset.sbiMobileSliderTouched;
  grid.dataset.sbiMobileSliderResetting = 'true';

  const reset = () => {
    if (!grid.isConnected || grid.dataset.sbiMobileSliderTouched === 'true') return;
    try {
      grid.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } catch {
      grid.scrollLeft = 0;
      grid.scrollTop = 0;
    }
    grid.scrollLeft = 0;
    grid.scrollTop = 0;
  };

  reset();
  window.requestAnimationFrame(() => {
    reset();
    window.requestAnimationFrame(reset);
  });

  [90, 220, 460, 760].forEach((delay) => {
    window.setTimeout(reset, delay);
  });

  window.setTimeout(() => {
    if (grid.isConnected) delete grid.dataset.sbiMobileSliderResetting;
  }, 860);
}

function resetActiveMobileFormationsSlider() {
  if ((document.body?.dataset?.sbiPublicPage || '') !== 'formations') return;
  forceResetMobileFormationsSlider(document.querySelector('[data-sbi-formations-feed]'));
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
    complianceSections: normalizeComplianceSections(raw.complianceSections),
    cta: raw.cta && typeof raw.cta === 'object' ? raw.cta : {},
    brochureIds: normalizeList(raw.brochureIds || raw.brochures),
    status: getStatus(raw),
    featuredOnHome: raw.featuredOnHome === true || raw.miseEnAvantIndex === true,
    displayOrder: toNumber(raw.displayOrder ?? raw.ordreAffichage, 999),
    homeOrder: toNumber(raw.homeOrder ?? raw.ordreIndex ?? raw.displayOrder, 999),
    slug,
    seo: normalizeSeo(raw.seo, { title, description: raw.shortSummary || raw.description }),
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
  const slug = normalizeSlug(raw.slug, normalizeSlug(title, id || 'ressource-sbi'));
  const file = raw.file && typeof raw.file === 'object' ? raw.file : {};
  const thumbnail = raw.thumbnail && typeof raw.thumbnail === 'object' ? raw.thumbnail : {};

  return {
    id: text(id || raw.id || slug),
    slug,
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
      name: text(file.name || raw.fileName),
      originalName: text(file.originalName || raw.originalFileName),
      mimeType: text(file.mimeType || raw.mimeType, 'application/pdf'),
      size: toNumber(file.size || raw.fileSize, 0)
    },
    externalUrl: text(raw.externalUrl || raw.url),
    seo: normalizeSeo(raw.seo, { title, description: raw.description || raw.resume }),
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

function ensureComplianceDetailsStyles() {
  if (document.getElementById('sbi-public-compliance-details-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-public-compliance-details-style';
  style.textContent = `
    .public-formation-sheet .public-formation-quality-band {
      grid-column: 1 / -1;
      width: 100%;
      padding: 0;
      overflow: hidden;
      border: 1px solid rgba(126, 181, 255, 0.22);
      background: linear-gradient(135deg, rgba(10, 18, 34, 0.96), rgba(7, 10, 20, 0.92));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
    }

    .public-formation-sheet .public-formation-quality-band summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 3.35rem;
      padding: 1rem 1.1rem;
      cursor: pointer;
      list-style: none;
      border-left: 3px solid var(--public-blue, #2f7dff);
      background: rgba(47, 125, 255, 0.06);
    }

    .public-formation-sheet .public-formation-quality-band summary::-webkit-details-marker {
      display: none;
    }

    .public-formation-sheet .public-formation-quality-band summary h4 {
      margin: 0;
      color: #fff;
      font-size: 0.94rem;
      letter-spacing: 0.075em;
      text-transform: uppercase;
    }

    .public-formation-sheet .public-formation-quality-band summary::after {
      content: '+';
      display: inline-grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid rgba(87, 130, 255, 0.45);
      border-radius: 999px;
      color: #dce8ff;
      font-size: 1rem;
      line-height: 1;
      flex: 0 0 auto;
      background: rgba(87, 130, 255, 0.08);
    }

    .public-formation-sheet .public-formation-quality-band[open] summary {
      border-bottom: 1px solid rgba(126, 181, 255, 0.14);
    }

    .public-formation-sheet .public-formation-quality-band[open] summary::after {
      content: '−';
    }

    .public-formation-sheet .public-formation-quality-content {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      padding: 1rem;
    }

    .public-formation-sheet .public-formation-quality-card {
      min-width: 0;
      padding: 1rem;
      border: 1px solid rgba(126, 181, 255, 0.14);
      background: rgba(255, 255, 255, 0.028);
    }

    .public-formation-sheet .public-formation-quality-card strong {
      display: block;
      margin: 0 0 0.55rem;
      color: #f3f7ff;
      font-size: 0.88rem;
      letter-spacing: 0.035em;
    }

    .public-formation-sheet .public-formation-quality-card p {
      margin: 0;
      color: rgba(224, 235, 255, 0.74);
      line-height: 1.62;
    }

    .public-formation-sheet .public-formation-quality-card p + p {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.075);
    }

    @media (max-width: 820px) {
      .public-formation-sheet .public-formation-quality-content {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}

function splitComplianceParagraphs(content = '') {
  return text(content)
    .split(/\n{2,}|\r?\n(?=[A-ZÀ-ÖØ-Ý0-9])/g)
    .map((paragraph) => text(paragraph))
    .filter(Boolean);
}

function appendComplianceSections(container, compliance = {}) {
  const sections = getVisibleComplianceSections(compliance);
  if (!sections.length) return;

  ensureComplianceDetailsStyles();

  const block = document.createElement('details');
  block.className = 'public-formation-detail-block public-formation-quality-band';

  const summary = document.createElement('summary');
  summary.append(createElement('h4', 'text-italic', 'Informations pédagogiques et qualité'));
  block.append(summary);

  const content = createElement('div', 'public-formation-quality-content');

  sections.forEach((section) => {
    const item = createElement('article', 'public-formation-quality-card');
    item.append(createElement('strong', 'text-italic', section.title));

    const paragraphs = splitComplianceParagraphs(section.content);
    paragraphs.forEach((paragraphText) => {
      item.append(createElement('p', 'text-italic', paragraphText));
    });

    content.append(item);
  });

  block.append(content);
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
    const program = createElement('div', 'public-formation-detail-block public-formation-program');
    program.append(createElement('h4', 'text-italic', 'Programme'));
    const programScroll = createElement('div', 'public-formation-program-scroll');
    formation.program.forEach((section) => {
      const item = createElement('article', 'public-formation-mini-section');
      item.append(createElement('strong', 'text-italic', section.title));
      if (section.content) item.append(createElement('p', 'text-italic public-formation-program-text', section.content));
      programScroll.append(item);
    });
    program.append(programScroll);
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

  appendComplianceSections(details, formation.complianceSections);

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

  if (closeOptions.restoreUrl !== false && getCurrentPublicPageId() === 'formations') {
    clearDetailHistory('/formations.html', [FORMATION_QUERY_KEY], closeOptions.historyMode || 'push');
    resetDynamicSeoToPageDefaults();
  }

  target.classList.remove('is-open');

  if (closeOptions.immediate) {
    target.remove();
    return;
  }

  window.setTimeout(() => target.remove(), 180);
}

function forceCloseFormationSheet() {
  closeFormationSheet(null, { immediate: true, restoreUrl: false });
}

window.SBI_CLOSE_PUBLIC_FORMATION_SHEET = forceCloseFormationSheet;
window.addEventListener('sbi:public-shell:before-navigate', forceCloseFormationSheet);
window.addEventListener('pagehide', forceCloseFormationSheet);

function openFormationSheet(formation, options = {}) {
  if (!formation || isComingSoon(formation)) return;

  closeFormationSheet(null, { immediate: true, restoreUrl: false });

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

  if (options.applySeo !== false) applyFormationDynamicSeo(formation);
  if (options.updateUrl !== false && getCurrentPublicPageId() === 'formations') {
    syncDetailHistory('/formations.html', FORMATION_QUERY_KEY, formation.slug, options.historyMode || 'push');
  }

  window.requestAnimationFrame(() => sheet.classList.add('is-open'));
  closeButton.focus({ preventScroll: true });
}

function createFormationCard(formation, options = {}) {
  const isHome = options.mode === 'home';
  const isCatalogue = !isHome;
  const cardTag = isCatalogue && !isComingSoon(formation) ? 'a' : 'article';
  const article = createElement(cardTag, 'parcours-card fade-in visible sbi-home-formation-card');

  if (cardTag === 'a') {
    article.href = createFormationRuntimeUrl(formation);
  }

  article.dataset.formationId = formation.id;
  article.dataset.formationSlug = formation.slug;
  article.dataset.formationStatus = formation.status;
  if (isComingSoon(formation)) article.classList.add('is-coming-soon');
  applyCoverBackground(article, formation);

  const mask = createElement('div', 'card-mask');
  const badge = createElement('div', 'card-badge');
  const content = createElement('div', 'card-content');

  const statusLabel = isComingSoon(formation) ? 'Prochainement' : text(formation.category, 'Formation SBI');
  content.append(createElement('span', 'public-formation-kicker text-italic', statusLabel));
  content.append(createElement('h3', 'text-italic', formation.title));

  const footer = createElement('div', 'card-footer');
  const metaText = isComingSoon(formation)
    ? 'Bientôt disponible'
    : text(formation.duration || formation.level || formation.modality, isHome ? 'Voir la fiche' : 'Formation');
  footer.append(createElement('span', 'course-count text-italic', metaText));

  if (!isComingSoon(formation)) {
    footer.append(createElement('span', 'arrow text-blue', '→'));
  }

  content.append(footer);
  article.append(mask, badge, content);

  if (isComingSoon(formation)) {
    article.setAttribute('aria-disabled', 'true');
    article.title = `${formation.title} - prochainement`;
    return article;
  }

  article.tabIndex = 0;
  article.setAttribute('role', isCatalogue ? 'link' : 'button');
  article.setAttribute('aria-label', `Ouvrir la fiche formation ${formation.title}`);

  if (isCatalogue) {
    const activate = (event) => {
      event?.preventDefault?.();
      openFormationSheet(formation);
    };
    article.addEventListener('click', activate);
    article.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  }

  return article;
}

function formatPublicFileSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function getPublicResourceFileName(item) {
  const rawName = text(item?.file?.originalName || item?.file?.name || item?.title || 'brochure-sbi');
  const clean = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'brochure-sbi';
  return `${clean}.pdf`;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'brochure-sbi.pdf';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

function triggerDirectDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'brochure-sbi.pdf';
  link.rel = 'noopener noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
}

async function downloadPublicResourceFile(item) {
  const filename = getPublicResourceFileName(item);
  const storagePath = text(item?.file?.storagePath);
  const directUrl = text(item?.file?.url || item?.externalUrl);

  try {
    if (storagePath) {
      const { storage, ref, getBlob } = await getStorageTools();
      const blob = await getBlob(ref(storage, storagePath));
      triggerBlobDownload(blob, filename);
      return;
    }

    if (directUrl) {
      triggerDirectDownload(directUrl, filename);
      return;
    }

    throw new Error('Aucun fichier PDF disponible pour cette ressource.');
  } catch (error) {
    console.warn('[SBI Public] Téléchargement direct impossible.', error);
    if (directUrl) triggerDirectDownload(directUrl, filename);
  }
}

function createResourceCard(item) {
  const article = createElement('article', 'public-resource-card fade-in visible');
  article.dataset.resourceId = item.id;

  article.dataset.resourceSlug = item.slug;

  const marker = createElement('span', 'public-card-index', item.category || item.type || 'SBI');
  const title = createElement('h3', 'text-italic');
  const titleLink = createElement('a', 'public-resource-title-link text-italic', item.title);
  titleLink.href = createResourceRuntimeUrl(item);
  titleLink.setAttribute('aria-label', `Voir la fiche ressource ${item.title}`);
  title.append(titleLink);
  const description = createElement('p', 'text-italic', item.description);

  titleLink.addEventListener('click', () => {
    window.requestAnimationFrame(() => revealResourceFromUrl([item], { historyMode: 'replace' }));
  });

  article.append(marker, title, description);

  const hasFile = Boolean(item.file?.url);
  const href = item.file?.url || item.externalUrl || `contact.html?brochure=${encodeURIComponent(item.title)}`;

  if (hasFile) {
    const metaText = ['PDF', formatPublicFileSize(item.file.size)].filter(Boolean).join(' · ');
    if (metaText) article.append(createElement('div', 'public-resource-meta text-italic', metaText));

    const actions = createElement('div', 'public-resource-actions');

    const viewLink = createElement('a', 'public-resource-action public-resource-action-primary text-italic', 'Visualiser');
    viewLink.href = href;
    viewLink.target = '_blank';
    viewLink.rel = 'noopener noreferrer';

    const downloadButton = createElement('button', 'public-resource-action public-resource-download-btn text-italic', 'Télécharger');
    downloadButton.type = 'button';
    downloadButton.addEventListener('click', () => downloadPublicResourceFile(item));

    actions.append(viewLink, downloadButton);
    article.append(actions);
    return article;
  }

  const link = createElement('a', 'public-inline-link text-italic', item.externalUrl ? 'Consulter ->' : 'Demander la brochure ->');
  link.href = href;
  if (item.externalUrl) {
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

  const visible = formations.filter((formation) => isPublicVisible(formation) && formation.seo?.indexable !== false).slice(0, 24);
  if (!visible.length) return;

  const script = document.createElement('script');
  script.id = 'sbi-public-formations-jsonld';
  script.type = 'application/ld+json';
  script.dataset.sbiSeoDynamic = 'formations';
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
        description: formation.seo?.description || formation.shortSummary,
        url: createFormationSeoUrl(formation),
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


function injectResourceStructuredData(resources) {
  const existing = document.getElementById('sbi-public-resources-jsonld');
  if (existing) existing.remove();

  const visible = resources.filter((resource) => resource.status === 'published' && resource.globalVisible && resource.seo?.indexable !== false).slice(0, 24);
  if (!visible.length) return;

  const script = document.createElement('script');
  script.id = 'sbi-public-resources-jsonld';
  script.type = 'application/ld+json';
  script.dataset.sbiSeoDynamic = 'resources';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Ressources Sport Business Institute',
    itemListElement: visible.map((resource, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'DigitalDocument',
        name: resource.title,
        description: resource.seo?.description || resource.description,
        url: createResourceSeoUrl(resource),
        encodingFormat: resource.file?.mimeType || undefined,
        publisher: {
          '@type': 'EducationalOrganization',
          name: 'Sport Business Institute',
          url: SEO_SITE_ORIGIN
        }
      }
    }))
  });
  document.head.append(script);
}

function revealFormationFromUrl(formations = [], options = {}) {
  const slug = getCurrentDynamicSlug([FORMATION_QUERY_KEY, 'slug']);
  if (!slug) {
    resetDynamicSeoToPageDefaults();
    return false;
  }

  const formation = formations.find((item) => item.slug === slug);
  if (!formation || isComingSoon(formation)) {
    resetDynamicSeoToPageDefaults();
    return false;
  }

  const target = document.querySelector(`[data-formation-slug="${slug}"]`);
  target?.scrollIntoView?.({ behavior: options.behavior || 'smooth', block: 'center' });
  openFormationSheet(formation, {
    historyMode: options.historyMode || 'replace',
    updateUrl: options.updateUrl !== false,
    applySeo: true
  });
  return true;
}

function revealResourceFromUrl(resources = [], options = {}) {
  const slug = getCurrentDynamicSlug([RESOURCE_QUERY_KEY, 'ressource', 'brochure']);
  if (!slug) {
    resetDynamicSeoToPageDefaults();
    return false;
  }

  const resource = resources.find((item) => item.slug === slug);
  if (!resource) {
    resetDynamicSeoToPageDefaults();
    return false;
  }

  const target = document.querySelector(`[data-resource-slug="${slug}"]`);
  target?.scrollIntoView?.({ behavior: options.behavior || 'smooth', block: 'center' });
  target?.classList.add('is-seo-target');
  window.setTimeout(() => target?.classList.remove('is-seo-target'), 1400);

  applyResourceDynamicSeo(resource);
  if (options.updateUrl !== false) {
    syncDetailHistory('/ressources.html', RESOURCE_QUERY_KEY, resource.slug, options.historyMode || 'replace');
  }
  return true;
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
  allLink.href = createFormationRuntimeUrl(formation);
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
    return { items: visible, fromFirebase: true };
  } catch (error) {
    console.warn('[SBI Public] Formations publiques indisponibles. Aucun placeholder statique affiché.', error);
    return { items: [], fromFirebase: false, error };
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
    return { items: visible, fromFirebase: true };
  } catch (error) {
    console.warn('[SBI Public] Ressources publiques indisponibles. Aucun placeholder statique affiché.', error);
    return { items: [], fromFirebase: false, error };
  }
}

async function initFormationsPage(root) {
  const grid = root.querySelector('[data-sbi-formations-feed]');
  if (!grid) return;
  captureBaseSeoForCurrentPage({ force: true });

  if (grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) {
    revealFormationFromUrl(activePublicFormations, { historyMode: 'replace', behavior: 'auto' });
    return;
  }

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;
  grid.classList.add('public-formations-grid', 'grid-parcours');
  // Statut technique masqué côté public : pas de message admin/client.

  const { items, fromFirebase } = await getPublicFormationsWithFallback();
  const visible = sortByDisplay(items.filter(isPublicVisible));
  activePublicFormations = visible;
  grid.replaceChildren(...visible.map((item) => createFormationCard(item)));
  forceResetMobileFormationsSlider(grid);
  injectFormationStructuredData(visible);

  const publishedCount = visible.filter((item) => item.status === 'published').length;
  const upcomingCount = visible.filter((item) => item.status === 'coming_soon').length;
  const source = fromFirebase ? 'Catalogue Firebase public' : 'Catalogue SBI de base';
  // Les compteurs restent internes : l'interface publique ne montre pas de bloc technique Firebase.

  const hasDynamicFormation = revealFormationFromUrl(visible, { historyMode: 'replace', behavior: 'smooth' });
  if (!hasDynamicFormation && !getCurrentDynamicSlug([FORMATION_QUERY_KEY, 'slug'])) {
    resetDynamicSeoToPageDefaults();
  }
}

async function initHomeFeaturedFormations(root) {
  const grid = root.querySelector('[data-sbi-home-formations-feed]');
  if (!grid || grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) return;

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;

  const { items } = await getPublicFormationsWithFallback();
  const cards = sortByDisplay(items.filter((item) => isPublicVisible(item) && item.featuredOnHome), 'homeOrder').slice(0, 4);

  grid.replaceChildren(...cards.map((item) => createFormationCard(item, { mode: 'home' })));
  bindHomeFormationCards(root, cards);
}

async function initBrochuresPage(root) {
  const grid = root.querySelector('[data-sbi-brochures-feed]');
  if (!grid) return;
  captureBaseSeoForCurrentPage({ force: true });

  if (grid.dataset.sbiFeedReady === PUBLIC_CONTENT_VERSION) {
    revealResourceFromUrl(activePublicResources, { historyMode: 'replace', behavior: 'auto' });
    return;
  }

  grid.dataset.sbiFeedReady = PUBLIC_CONTENT_VERSION;
  setStatus(root, '[data-sbi-brochures-status]', 'Chargement des ressources publiques SBI...');

  const { items, fromFirebase } = await getPublicResourcesWithFallback();
  activePublicResources = items;
  grid.replaceChildren(...items.map((item) => createResourceCard(item)));
  injectResourceStructuredData(items);
  revealResourceFromUrl(items, { historyMode: 'replace', behavior: 'smooth' });
  setStatus(root, '[data-sbi-brochures-status]', fromFirebase
    ? 'Ressources Firebase publiques affichées.'
    : 'Ressources SBI disponibles. Les nouveaux documents publiés apparaîtront automatiquement ici.');
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
    website: text(data.get('website')),
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
    const mediaModule = await import('/js/site-index-public.js?v=8.0P.99');
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

function handleDynamicPublicUrl({ behavior = 'auto', historyMode = 'replace' } = {}) {
  const page = getCurrentPublicPageId();

  if (page === 'formations') {
    revealFormationFromUrl(activePublicFormations, { behavior, historyMode });
    return;
  }

  if (page === 'ressources') {
    revealResourceFromUrl(activePublicResources, { behavior, historyMode });
  }
}

window.addEventListener('sbi:public-shell:navigated', (event) => {
  if (event?.detail?.page === 'formations') {
    window.requestAnimationFrame(resetActiveMobileFormationsSlider);
  }

  window.requestAnimationFrame(() => {
    handleDynamicPublicUrl({ behavior: event?.detail?.source === 'popstate' ? 'auto' : 'smooth', historyMode: 'replace' });
  });
});

window.addEventListener('pageshow', () => {
  window.requestAnimationFrame(() => {
    resetActiveMobileFormationsSlider();
    handleDynamicPublicUrl({ behavior: 'auto', historyMode: 'replace' });
  });
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSbiPublicPages(document), { once: true });
} else {
  initSbiPublicPages(document);
}
