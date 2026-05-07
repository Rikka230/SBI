const FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const FORMATION_FALLBACKS = [
  {
    titre: 'Marketing & Communication',
    categorie: 'Catalogue SBI',
    description: 'Construire une marque sportive, piloter une campagne et valoriser une communaute.',
    duree: '12 modules'
  },
  {
    titre: 'Management & Leadership',
    categorie: 'Catalogue SBI',
    description: 'Manager une equipe, cadrer un projet et prendre les bonnes decisions sous pression.',
    duree: '9 modules'
  },
  {
    titre: 'Evenementiel sportif',
    categorie: 'Catalogue SBI',
    description: 'Concevoir, produire et securiser une experience sportive de bout en bout.',
    duree: '8 modules'
  },
  {
    titre: 'Digital & Innovation',
    categorie: 'Catalogue SBI',
    description: 'Utiliser les outils numeriques, la data et les nouveaux formats pour accelerer.',
    duree: '10 modules'
  }
];

const BROCHURE_FALLBACKS = [
  {
    titre: 'Brochure formations SBI',
    type: 'Catalogue',
    description: 'Une vue claire des formations, des parcours et de l\'accompagnement SBI.'
  },
  {
    titre: 'Guide alternance & aide',
    type: 'Entreprise',
    description: 'Les reperes essentiels pour preparer un recrutement en alternance.'
  },
  {
    titre: 'Programme Bac / RNCP Niveau 4',
    type: 'Formation',
    description: 'Le cadre de formation SBI centre sur le Bac / RNCP Niveau 4.'
  },
  {
    titre: 'Fiche accompagnement',
    type: 'Conseil',
    description: 'Comment SBI accompagne candidats et entreprises avant, pendant et apres.'
  }
];

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function pick(source = {}, keys = [], fallback = '') {
  const key = keys.find((candidate) => text(source[candidate]));
  return key ? text(source[key], fallback) : fallback;
}

function setStatus(root, selector, message) {
  const status = root.querySelector(selector);
  if (status) status.textContent = message;
}

function createCard(item, options = {}) {
  const article = document.createElement('article');
  article.className = options.className || 'public-info-card fade-in visible';

  const marker = document.createElement('span');
  marker.className = 'public-card-index';
  marker.textContent = text(item.type || item.categorie || item.duree, options.marker || 'SBI');

  const title = document.createElement('h3');
  title.className = 'text-italic';
  title.textContent = text(item.titre || item.title || item.name, 'Formation SBI');

  const description = document.createElement('p');
  description.className = 'text-italic';
  description.textContent = text(item.description || item.resume, 'Contenu SBI en cours de publication.');

  article.append(marker, title, description);

  if (options.linkHref) {
    const link = document.createElement('a');
    link.className = 'public-inline-link text-italic';
    link.href = options.linkHref;
    link.textContent = options.linkLabel || 'Demander la brochure ->';
    article.append(link);
  }

  return article;
}

async function loadFirestoreCollection(collectionName) {
  const firebase = await import('/js/firebase-init.js');
  const firestore = await import(FIRESTORE_SDK_URL);

  if (!firebase.db || !firestore.getDocs || !firestore.collection) {
    throw new Error('Firestore indisponible');
  }

  const snap = await firestore.getDocs(firestore.collection(firebase.db, collectionName));
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function normalizeFormation(doc = {}) {
  return {
    id: doc.id,
    titre: pick(doc, ['titre', 'title', 'name'], 'Formation SBI'),
    categorie: pick(doc, ['categorie', 'category', 'type'], 'Bac / RNCP Niveau 4'),
    description: pick(doc, ['description', 'resume', 'summary'], 'Formation SBI en cours de publication.'),
    duree: pick(doc, ['duree', 'duration'], 'SBI'),
    visible: doc.visible !== false && doc.isPublic !== false && doc.public !== false
  };
}

function normalizeBrochure(doc = {}) {
  return {
    id: doc.id,
    titre: pick(doc, ['titre', 'title', 'name'], 'Brochure SBI'),
    type: pick(doc, ['type', 'categorie', 'category'], 'Brochure'),
    description: pick(doc, ['description', 'resume', 'summary'], 'Document SBI en cours de publication.'),
    url: pick(doc, ['url', 'fileUrl', 'downloadUrl'], '')
  };
}

async function initFormationsPage(root) {
  const grid = root.querySelector('[data-sbi-formations-feed]');
  if (!grid || grid.dataset.sbiFeedReady === 'true') return;

  grid.dataset.sbiFeedReady = 'true';
  setStatus(root, '[data-sbi-formations-status]', 'Connexion au catalogue Firebase preparee.');

  try {
    const docs = (await loadFirestoreCollection('formations'))
      .map(normalizeFormation)
      .filter((item) => item.visible);

    if (!docs.length) throw new Error('Aucune formation publique disponible');

    grid.replaceChildren(...docs.map((item) => createCard(item)));
    setStatus(root, '[data-sbi-formations-status]', `${docs.length} formation(s) chargee(s) depuis Firebase.`);
  } catch (error) {
    grid.replaceChildren(...FORMATION_FALLBACKS.map((item) => createCard(item)));
    setStatus(root, '[data-sbi-formations-status]', 'Affichage du catalogue SBI de base. Firebase alimentera cette zone des que les donnees publiques seront disponibles.');
  }
}

async function initBrochuresPage(root) {
  const grid = root.querySelector('[data-sbi-brochures-feed]');
  if (!grid || grid.dataset.sbiFeedReady === 'true') return;

  grid.dataset.sbiFeedReady = 'true';
  setStatus(root, '[data-sbi-brochures-status]', 'Connexion brochures Firebase preparee.');

  try {
    const docs = (await loadFirestoreCollection('brochures')).map(normalizeBrochure);
    if (!docs.length) throw new Error('Aucune brochure publique disponible');

    grid.replaceChildren(...docs.map((item) => createCard(item, {
      className: 'public-resource-card fade-in visible',
      linkHref: item.url || `contact.html?brochure=${encodeURIComponent(item.id || item.titre)}`,
      linkLabel: item.url ? 'Ouvrir la brochure ->' : 'Demander la brochure ->'
    })));
    setStatus(root, '[data-sbi-brochures-status]', `${docs.length} brochure(s) chargee(s) depuis Firebase.`);
  } catch (error) {
    grid.replaceChildren(...BROCHURE_FALLBACKS.map((item) => createCard(item, {
      className: 'public-resource-card fade-in visible',
      linkHref: `contact.html?brochure=${encodeURIComponent(item.titre)}`,
      linkLabel: 'Demander la brochure ->'
    })));
    setStatus(root, '[data-sbi-brochures-status]', 'Brochures de base affichees. La collection Firebase "brochures" pourra prendre le relais.');
  }
}

function buildBrevoPayload(form) {
  const data = new FormData(form);

  return {
    email: text(data.get('email')),
    attributes: {
      PRENOM: text(data.get('firstname')),
      NOM: text(data.get('lastname')),
      SMS: text(data.get('phone')),
      BESOIN: text(data.get('interest')),
      MESSAGE: text(data.get('message')),
      SOURCE: 'SBI public contact'
    },
    consent: {
      emailCampaigns: data.get('consent') === 'on',
      mobileCampaigns: data.get('consent') === 'on',
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

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { mode: 'sent' };
}

function initContactForm(root) {
  const form = root.querySelector('[data-sbi-brevo-form]');
  if (!form || form.dataset.sbiContactReady === 'true') return;

  form.dataset.sbiContactReady = 'true';

  const status = form.querySelector('[data-sbi-contact-status]');
  const setMessage = (message) => {
    if (status) status.textContent = message;
  };

  const params = new URLSearchParams(window.location.search);
  const interest = form.elements.interest;
  const message = form.elements.message;
  const motif = text(params.get('motif') || params.get('brochure'));

  if (interest && !interest.value && motif) {
    if (motif.includes('aide') || motif.includes('alternance')) interest.value = 'alternance';
    else if (motif.includes('brochure')) interest.value = 'brochure';
    else interest.value = 'formation';
  }

  if (message && !message.value && params.has('montant')) {
    message.value = [
      `Montant estime : ${text(params.get('montant'))}`,
      `Statut : ${text(params.get('statut'))}`,
      `Formation : ${text(params.get('formation'))}`
    ].join('\n');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const payload = buildBrevoPayload(form);
    window.SBI_LAST_BREVO_CONTACT_PAYLOAD = payload;

    try {
      const result = await submitBrevoPayload(form, payload);
      setMessage(result.mode === 'sent'
        ? 'Demande envoyee. Un conseiller SBI revient vers vous.'
        : 'Demande preparee. La connexion Brevo devra etre branchee cote serveur.');
    } catch (error) {
      setMessage('La demande est preparee, mais l\'envoi Brevo n\'est pas disponible pour le moment.');
    }
  });
}

export function initSbiPublicPages(root = document) {
  const page = document.body?.dataset?.sbiPublicPage || '';

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
