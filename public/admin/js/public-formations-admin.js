import { db, auth } from '/js/firebase-init.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { storage } from '/js/firebase-init.js';
import { compressImageFileToWebpBlob } from '/admin/js/course-media-storage.js';

const COLLECTION = 'publicFormations';
const VERSION = '8.0P.88';

let mounted = false;
let currentItems = [];
let pendingCoverFile = null;
let cleanupFns = [];
let formDirty = false;
let suppressDirtyTracking = false;

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function $(id) {
  return document.getElementById(id);
}

let adminRoot = null;

function getAdminRoot(options = {}) {
  const explicitRoot = options?.root instanceof Element ? options.root : null;
  const tabRoot = explicitRoot?.closest?.('#tab-public-formations') || explicitRoot || document.getElementById('tab-public-formations');
  return tabRoot || document;
}

function queryAdmin(selector) {
  return (adminRoot || document).querySelector(selector);
}

function isCatalogTabActive() {
  const tab = document.getElementById('tab-public-formations');
  return !tab || tab.classList.contains('active');
}

function syncCatalogVisibility() {
  const panel = queryAdmin('[data-sbi-public-formations-admin]');
  if (!panel) return;
  panel.hidden = !isCatalogTabActive();
}

function slugify(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function linesToArray(value) {
  return text(value).split(/\r?\n/).map((line) => text(line)).filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean).join('\n') : '';
}

function sectionsToTextarea(value) {
  if (!Array.isArray(value)) return '';
  return value.map((item) => `${text(item?.title || item?.titre)} | ${text(item?.content || item?.texte || item?.description)}`.trim()).filter(Boolean).join('\n');
}

function textareaToSections(value) {
  return text(value).split(/\r?\n/).map((line, index) => {
    const [title, ...contentParts] = line.split('|');
    return {
      title: text(title, `Section ${index + 1}`),
      content: text(contentParts.join('|')),
      order: index * 10
    };
  }).filter((item) => item.title || item.content);
}

function setStatus(message, tone = '') {
  const status = $('public-formations-admin-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setFormDirty(dirty = true) {
  if (suppressDirtyTracking) return;
  formDirty = dirty;
}

function hasUnsavedChanges() {
  return formDirty || Boolean(pendingCoverFile);
}

function confirmDiscardChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Quitter cette fiche sans sauvegarder ? Les modifications en cours seront perdues.');
}

function bind(target, eventName, handler, options) {
  if (!target?.addEventListener) return;
  target.addEventListener(eventName, handler, options);
  cleanupFns.push(() => target.removeEventListener(eventName, handler, options));
}

function getCoverPosition() {
  return {
    x: Math.min(100, Math.max(0, Number($('public-formation-cover-x')?.value || 50))),
    y: Math.min(100, Math.max(0, Number($('public-formation-cover-y')?.value || 50)))
  };
}

function setCoverPosition(x = 50, y = 50) {
  const safeX = Math.min(100, Math.max(0, Number(x) || 50));
  const safeY = Math.min(100, Math.max(0, Number(y) || 50));
  const frame = $('public-formation-cover-frame');
  const xField = $('public-formation-cover-x');
  const yField = $('public-formation-cover-y');
  if (xField) xField.value = String(Math.round(safeX));
  if (yField) yField.value = String(Math.round(safeY));
  frame?.style.setProperty('--cover-x', `${safeX}%`);
  frame?.style.setProperty('--cover-y', `${safeY}%`);
}

function setCoverPreview(url = '') {
  const img = $('public-formation-cover-preview');
  const fallback = $('public-formation-cover-fallback');
  const clean = text(url);
  if (!img || !fallback) return;
  if (clean) {
    img.src = clean;
    img.hidden = false;
    fallback.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    fallback.hidden = false;
  }
}

function getItemStatusLabel(status) {
  if (status === 'coming_soon') return 'Prochainement';
  if (status === 'draft') return 'Brouillon';
  return 'Publié';
}

function normalizeItem(raw = {}, id = '') {
  const cover = raw.cover && typeof raw.cover === 'object' ? raw.cover : {};
  return {
    id,
    title: text(raw.title || raw.titre, 'Formation SBI'),
    subtitle: text(raw.subtitle),
    shortSummary: text(raw.shortSummary || raw.resumeCourt || raw.description),
    longDescription: text(raw.longDescription || raw.descriptionLongue),
    category: text(raw.category || raw.categorie, 'Formation SBI'),
    level: text(raw.level || raw.niveau),
    duration: text(raw.duration || raw.duree),
    modality: text(raw.modality || raw.modalite),
    targetAudience: text(raw.targetAudience || raw.publicCible),
    objectives: Array.isArray(raw.objectives) ? raw.objectives : [],
    prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites : [],
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    infoSections: Array.isArray(raw.infoSections) ? raw.infoSections : [],
    program: Array.isArray(raw.program) ? raw.program : [],
    cta: raw.cta && typeof raw.cta === 'object' ? raw.cta : {},
    brochureIds: Array.isArray(raw.brochureIds) ? raw.brochureIds : [],
    status: text(raw.status, 'draft'),
    featuredOnHome: raw.featuredOnHome === true,
    displayOrder: Number(raw.displayOrder ?? 999),
    homeOrder: Number(raw.homeOrder ?? 999),
    slug: text(raw.slug || slugify(raw.title || raw.titre)),
    cover: {
      url: text(cover.url || raw.coverUrl),
      storagePath: text(cover.storagePath),
      objectPositionX: Number(cover.objectPositionX ?? 50),
      objectPositionY: Number(cover.objectPositionY ?? 50),
      alt: text(cover.alt)
    }
  };
}

async function loadItems() {
  const snap = await getDocs(collection(db, COLLECTION));
  const items = [];
  snap.forEach((docSnap) => items.push(normalizeItem(docSnap.data(), docSnap.id)));
  currentItems = items.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
  return currentItems;
}

function renderList() {
  const list = $('public-formations-list');
  if (!list) return;
  list.innerHTML = '';

  if (!currentItems.length) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'Aucune fiche publique pour le moment. Crée une première fiche pour alimenter la page Formations.';
    list.append(empty);
    return;
  }

  currentItems.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'public-admin-card';
    card.dataset.id = item.id;
    card.innerHTML = `
      <span>${getItemStatusLabel(item.status)}</span>
      <h3>${item.title}</h3>
      <p>${item.shortSummary || item.subtitle || 'Résumé à compléter.'}</p>
      <p>${item.featuredOnHome ? 'Index : oui' : 'Index : non'} · Ordre ${item.displayOrder || 999}</p>
    `;
    card.addEventListener('click', () => openModal(item.id));
    list.append(card);
  });
}

function fillForm(item = null) {
  suppressDirtyTracking = true;
  $('public-formation-id').value = item?.id || '';
  $('public-formation-title').value = item?.title || '';
  $('public-formation-slug').value = item?.slug || '';
  $('public-formation-slug').dataset.autogenerated = item?.slug ? 'false' : 'true';
  $('public-formation-status').value = item?.status || 'draft';
  $('public-formation-display-order').value = item?.displayOrder ?? 999;
  $('public-formation-home-order').value = item?.homeOrder ?? 999;
  $('public-formation-subtitle').value = item?.subtitle || '';
  $('public-formation-category').value = item?.category || '';
  $('public-formation-level').value = item?.level || '';
  $('public-formation-duration').value = item?.duration || '';
  $('public-formation-modality').value = item?.modality || '';
  $('public-formation-target').value = item?.targetAudience || '';
  $('public-formation-short').value = item?.shortSummary || '';
  $('public-formation-long').value = item?.longDescription || '';
  $('public-formation-objectives').value = arrayToLines(item?.objectives);
  $('public-formation-prerequisites').value = arrayToLines(item?.prerequisites);
  $('public-formation-outcomes').value = arrayToLines(item?.outcomes);
  $('public-formation-highlights').value = arrayToLines(item?.highlights);
  $('public-formation-sections').value = sectionsToTextarea(item?.infoSections);
  $('public-formation-program').value = sectionsToTextarea(item?.program);
  $('public-formation-cta-label').value = item?.cta?.label || '';
  $('public-formation-cta-href').value = item?.cta?.href || '';
  $('public-formation-featured').checked = item?.featuredOnHome === true;
  $('public-formation-brochure-ids').value = arrayToLines(item?.brochureIds);
  $('public-formation-cover-url').value = item?.cover?.url || '';
  $('public-formation-cover-storage-path').value = item?.cover?.storagePath || '';
  setCoverPosition(item?.cover?.objectPositionX ?? 50, item?.cover?.objectPositionY ?? 50);
  setCoverPreview(item?.cover?.url || '');
  pendingCoverFile = null;
  const fileInput = $('public-formation-cover-file');
  if (fileInput) fileInput.value = '';
  updatePreview();
  formDirty = false;
  suppressDirtyTracking = false;
}

function openModal(id = '') {
  const item = id ? currentItems.find((entry) => entry.id === id) : null;
  $('public-formation-modal-title').textContent = item ? 'Modifier la fiche formation' : 'Créer une fiche formation';
  $('delete-public-formation').style.display = item ? '' : 'none';
  fillForm(item);
  $('public-formation-modal').hidden = false;
  $('public-formation-title')?.focus?.({ preventScroll: true });
}

function closeModal({ force = false } = {}) {
  if (!force && !confirmDiscardChanges()) return false;
  $('public-formation-modal').hidden = true;
  pendingCoverFile = null;
  formDirty = false;
  return true;
}

function updatePreview() {
  const preview = $('public-formation-admin-preview');
  if (!preview) return;
  const status = $('public-formation-status')?.value || 'draft';
  const title = text($('public-formation-title')?.value, 'Formation SBI');
  const summary = text($('public-formation-short')?.value, 'Le rendu public se met à jour pendant la saisie.');
  preview.querySelector('span').textContent = getItemStatusLabel(status);
  preview.querySelector('h4').textContent = title;
  preview.querySelector('p').textContent = summary;
}

function gatherFormData() {
  const title = text($('public-formation-title')?.value);
  const slug = slugify($('public-formation-slug')?.value || title);
  const position = getCoverPosition();

  if (!title) throw new Error('Le titre est obligatoire.');
  if (!slug) throw new Error('Le slug SEO est obligatoire.');

  return {
    title,
    slug,
    status: $('public-formation-status')?.value || 'draft',
    subtitle: text($('public-formation-subtitle')?.value),
    category: text($('public-formation-category')?.value),
    level: text($('public-formation-level')?.value),
    duration: text($('public-formation-duration')?.value),
    modality: text($('public-formation-modality')?.value),
    targetAudience: text($('public-formation-target')?.value),
    shortSummary: text($('public-formation-short')?.value),
    longDescription: text($('public-formation-long')?.value),
    objectives: linesToArray($('public-formation-objectives')?.value),
    prerequisites: linesToArray($('public-formation-prerequisites')?.value),
    outcomes: linesToArray($('public-formation-outcomes')?.value),
    highlights: linesToArray($('public-formation-highlights')?.value),
    infoSections: textareaToSections($('public-formation-sections')?.value),
    program: textareaToSections($('public-formation-program')?.value),
    cta: {
      label: text($('public-formation-cta-label')?.value),
      href: text($('public-formation-cta-href')?.value)
    },
    brochureIds: linesToArray($('public-formation-brochure-ids')?.value),
    featuredOnHome: $('public-formation-featured')?.checked === true,
    displayOrder: Number($('public-formation-display-order')?.value || 999),
    homeOrder: Number($('public-formation-home-order')?.value || 999),
    cover: {
      url: text($('public-formation-cover-url')?.value),
      storagePath: text($('public-formation-cover-storage-path')?.value),
      objectPositionX: position.x,
      objectPositionY: position.y,
      alt: `${title} - Sport Business Institute`
    },
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || ''
  };
}

async function uploadCoverIfNeeded(docId, data) {
  if (!pendingCoverFile) return data;

  setStatus('Compression et upload de la couverture...', 'loading');
  const blob = await compressImageFileToWebpBlob(pendingCoverFile);
  const storagePath = `site/formations/${docId}/cover/${Date.now()}-${slugify(pendingCoverFile.name || 'cover')}.webp`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, blob, {
    contentType: 'image/webp',
    customMetadata: {
      source: 'sbi-public-formations',
      uploadedBy: auth.currentUser?.uid || ''
    }
  });

  const url = await getDownloadURL(fileRef);
  return {
    ...data,
    cover: {
      ...data.cover,
      url,
      storagePath
    }
  };
}

async function saveForm(event) {
  event.preventDefault();

  try {
    setStatus('Sauvegarde de la fiche publique...', 'loading');
    const id = text($('public-formation-id')?.value);
    let data = gatherFormData();

    if (id) {
      data = await uploadCoverIfNeeded(id, data);
      await updateDoc(doc(db, COLLECTION, id), data);
    } else {
      const created = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || ''
      });
      data = await uploadCoverIfNeeded(created.id, data);
      await updateDoc(doc(db, COLLECTION, created.id), data);
    }

    pendingCoverFile = null;
    formDirty = false;
    closeModal({ force: true });
    await refresh();
    setStatus('Fiche publique sauvegardée.', 'success');
  } catch (error) {
    console.error('[SBI Public Formations Admin] Sauvegarde impossible :', error);
    setStatus(error.message || 'Sauvegarde impossible.', 'error');
    alert(error.message || 'Sauvegarde impossible.');
  }
}

async function deleteCurrent() {
  const id = text($('public-formation-id')?.value);
  if (!id) return;

  if (!confirm('Supprimer cette fiche publique ? Cela ne supprime pas la catégorie privée ni les cours.')) return;

  try {
    setStatus('Suppression de la fiche publique...', 'loading');
    await deleteDoc(doc(db, COLLECTION, id));
    formDirty = false;
    closeModal({ force: true });
    await refresh();
    setStatus('Fiche publique supprimée.', 'success');
  } catch (error) {
    console.error('[SBI Public Formations Admin] Suppression impossible :', error);
    setStatus(error.message || 'Suppression impossible.', 'error');
  }
}

async function refresh() {
  try {
    setStatus('Chargement du catalogue public...', 'loading');
    await loadItems();
    renderList();
    setStatus(`${currentItems.length} fiche(s) publique(s) chargée(s).`, 'success');
  } catch (error) {
    console.error('[SBI Public Formations Admin] Chargement impossible :', error);
    setStatus('Catalogue public indisponible. Vérifie les règles Firestore et le rôle admin.', 'error');
  }
}

function setupCoverInput() {
  const input = $('public-formation-cover-file');
  bind(input, 'change', () => {
    const file = input.files?.[0];
    pendingCoverFile = file || null;

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Choisis une image valide.');
      input.value = '';
      pendingCoverFile = null;
      return;
    }

    const url = URL.createObjectURL(file);
    setCoverPreview(url);
    setCoverPosition(50, 50);
    setFormDirty();
    updatePreview();
  });
}

function setupCoverDrag() {
  const frame = $('public-formation-cover-frame');
  if (!frame) return;

  let dragging = false;

  const updateFromEvent = (event) => {
    const rect = frame.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setCoverPosition(x, y);
    setFormDirty();
  };

  bind(frame, 'pointerdown', (event) => {
    dragging = true;
    frame.setPointerCapture?.(event.pointerId);
    updateFromEvent(event);
  });

  bind(frame, 'pointermove', (event) => {
    if (!dragging) return;
    updateFromEvent(event);
  });

  bind(frame, 'pointerup', () => { dragging = false; });
  bind(frame, 'pointercancel', () => { dragging = false; });
}

function setupFormAutoSlug() {
  const title = $('public-formation-title');
  const slug = $('public-formation-slug');
  bind(title, 'input', () => {
    if (!slug.value || slug.dataset.autogenerated === 'true') {
      slug.value = slugify(title.value);
      slug.dataset.autogenerated = 'true';
    }
    updatePreview();
  });
  bind(slug, 'input', () => { slug.dataset.autogenerated = 'false'; });
}

export function initPublicFormationsAdmin(options = {}) {
  adminRoot = getAdminRoot(options);
  const panel = queryAdmin('[data-sbi-public-formations-admin]');

  if (mounted && panel) return () => {};
  if (!panel || !panel.closest('#tab-public-formations')) return () => {};

  mounted = true;
  cleanupFns = [];
  syncCatalogVisibility();
  bind(window, 'sbi:course-tab-change', syncCatalogVisibility);

  bind($('btn-create-public-formation'), 'click', () => openModal(''));
  bind($('close-public-formation-modal'), 'click', () => closeModal());
  bind($('public-formation-modal'), 'click', (event) => {
    if (event.target === $('public-formation-modal')) closeModal();
  });
  bind($('public-formation-form'), 'submit', saveForm);
  bind($('delete-public-formation'), 'click', deleteCurrent);

  document.querySelectorAll('#public-formation-form input, #public-formation-form textarea, #public-formation-form select').forEach((field) => {
    bind(field, 'input', () => { setFormDirty(); updatePreview(); });
    bind(field, 'change', () => { setFormDirty(); updatePreview(); });
  });

  setupCoverInput();
  setupCoverDrag();
  setupFormAutoSlug();
  refresh();

  return () => {
    cleanupFns.splice(0, cleanupFns.length).forEach((fn) => {
      try { fn(); } catch {}
    });
    mounted = false;
    adminRoot = null;
  };
}

window.SBI_INIT_PUBLIC_FORMATIONS_ADMIN = initPublicFormationsAdmin;
