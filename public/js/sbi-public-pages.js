const FORMATION_FALLBACKS = [
  {
    titre: 'Marketing & Communication',
    categorie: 'Catalogue SBI',
    description: 'Construire une marque sportive, piloter une campagne et valoriser une communauté.',
    duree: '12 modules'
  },
  {
    titre: 'Management & Leadership',
    categorie: 'Catalogue SBI',
    description: 'Manager une équipe, cadrer un projet et prendre les bonnes décisions sous pression.',
    duree: '9 modules'
  },
  {
    titre: 'Événementiel sportif',
    categorie: 'Catalogue SBI',
    description: 'Concevoir, produire et sécuriser une expérience sportive de bout en bout.',
    duree: '8 modules'
  },
  {
    titre: 'Digital & Innovation',
    categorie: 'Catalogue SBI',
    description: 'Utiliser les outils numériques, la data et les nouveaux formats pour accélérer.',
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
    description: 'Les repères essentiels pour préparer un recrutement en alternance.'
  },
  {
    titre: 'Programme Bac / RNCP Niveau 4',
    type: 'Formation',
    description: 'Le cadre de formation SBI centré sur le Bac / RNCP Niveau 4.'
  },
  {
    titre: 'Fiche accompagnement',
    type: 'Conseil',
    description: 'Comment SBI accompagne candidats et entreprises avant, pendant et après.'
  }
];

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
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

function initFormationsPage(root) {
  const grid = root.querySelector('[data-sbi-formations-feed]');
  if (!grid || grid.dataset.sbiFeedReady === 'true') return;

  grid.dataset.sbiFeedReady = 'true';
  grid.replaceChildren(...FORMATION_FALLBACKS.map((item) => createCard(item)));
  setStatus(root, '[data-sbi-formations-status]', 'Catalogue SBI de base affiché. La connexion back-office/Firebase sera branchée plus tard.');
}

function initBrochuresPage(root) {
  const grid = root.querySelector('[data-sbi-brochures-feed]');
  if (!grid || grid.dataset.sbiFeedReady === 'true') return;

  grid.dataset.sbiFeedReady = 'true';
  grid.replaceChildren(...BROCHURE_FALLBACKS.map((item) => createCard(item, {
    className: 'public-resource-card fade-in visible',
    linkHref: `contact.html?brochure=${encodeURIComponent(item.titre)}`,
    linkLabel: 'Demander la brochure ->'
  })));
  setStatus(root, '[data-sbi-brochures-status]', 'Brochures SBI de base affichées. La connexion back-office/Firebase sera branchée plus tard.');
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
    const mediaModule = await import('/js/site-index-public.js?v=8.0P.67');
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
  const motif = text(params.get('motif') || params.get('brochure'));
  const transferredMessage = text(params.get('message'));

  if (interest && !interest.value && motif) {
    const lowerMotif = motif.toLowerCase();
    if (lowerMotif.includes('aide') || lowerMotif.includes('alternance') || lowerMotif.includes('estimation')) interest.value = 'alternance';
    else if (lowerMotif.includes('brochure')) interest.value = 'brochure';
    else interest.value = 'formation';
  }

  if (motif && motif.toLowerCase().includes('estimation')) {
    const companyProfile = form.querySelector('input[name="profile"][value="entreprise"]');
    if (companyProfile && !form.querySelector('input[name="profile"]:checked')) {
      companyProfile.checked = true;
    }
  }

  if (message && !message.value && transferredMessage) {
    const max = Number(message.getAttribute('maxlength') || 1000);
    message.value = transferredMessage.slice(0, max);
    message.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (message && !message.value && params.has('montant')) {
    message.value = [
      `Reste à charge mensuel estimé : ${text(params.get('montant'))}`,
      `Reste à charge total estimé : ${text(params.get('montantTotal'))}`,
      `Statut : ${text(params.get('statut'))}`,
      `Formation : ${text(params.get('formation'))}`
    ].join('\n');

    message.dispatchEvent(new Event('input', { bubbles: true }));
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
