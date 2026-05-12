import { db, auth, storage } from '/js/firebase-init.js';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const COLLECTION = 'publicResources';
const FORMATIONS_COLLECTION = 'publicFormations';
const VERSION = '8.0P.117';
const MAX_PDF_BYTES = 50 * 1024 * 1024;

let mounted = false;
let adminRoot = null;
let cleanupFns = [];
let currentResources = [];
let currentFormations = [];
let pendingPdfFile = null;
let formDirty = false;
let suppressDirtyTracking = false;

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function $(id) {
  return document.getElementById(id);
}

function getAdminRoot(options = {}) {
  const explicitRoot = options?.root instanceof Element ? options.root : null;
  const tabRoot = explicitRoot?.closest?.('#tab-public-resources') || explicitRoot || document.getElementById('tab-public-resources');
  return tabRoot || document;
}

function queryAdmin(selector) {
  return (adminRoot || document).querySelector(selector);
}

function isResourcesTabActive() {
  const tab = document.getElementById('tab-public-resources');
  return !tab || tab.classList.contains('active');
}

function syncResourcesVisibility() {
  const panel = queryAdmin('[data-sbi-public-resources-admin]');
  if (!panel) return;
  panel.hidden = !isResourcesTabActive();
}

function bind(target, eventName, handler, options) {
  if (!target?.addEventListener) return;
  target.addEventListener(eventName, handler, options);
  cleanupFns.push(() => target.removeEventListener(eventName, handler, options));
}

function setStatus(message, tone = '') {
  const status = $('public-resources-admin-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function slugify(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function makeSafePdfName(fileName = 'brochure.pdf') {
  const base = text(fileName, 'brochure.pdf')
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'brochure';
  return `${base}.pdf`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(/\r?\n|;/).map((item) => text(item)).filter(Boolean);
}

function setFormDirty(dirty = true) {
  if (suppressDirtyTracking) return;
  formDirty = dirty;
}

function hasUnsavedChanges() {
  return formDirty || Boolean(pendingPdfFile);
}

function confirmDiscardChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Quitter cette brochure sans sauvegarder ? Les modifications en cours seront perdues.');
}

function getStatusLabel(status) {
  return status === 'draft' ? 'Brouillon' : 'Publié';
}

function getVisibilityLabel(item) {
  if (item.status !== 'published') return 'Masqué';
  return item.globalVisible ? 'Visible Ressources' : 'Lié uniquement';
}

function normalizeFormation(raw = {}, id = '') {
  return {
    id,
    title: text(raw.title || raw.titre, 'Formation SBI'),
    status: text(raw.status, 'draft'),
    displayOrder: Number(raw.displayOrder ?? 999)
  };
}

function normalizeResource(raw = {}, id = '') {
  const file = raw.file && typeof raw.file === 'object' ? raw.file : {};
  const title = text(raw.title || raw.titre || raw.name, 'Brochure SBI');

  return {
    id,
    title,
    slug: text(raw.slug || slugify(title)),
    description: text(raw.description || raw.resume),
    type: text(raw.type, 'brochure'),
    category: text(raw.category || raw.categorie, 'Brochure'),
    status: text(raw.status, 'draft'),
    globalVisible: raw.globalVisible !== false,
    assignedFormationIds: normalizeList(raw.assignedFormationIds || raw.formationIds),
    displayOrder: Number(raw.displayOrder ?? 999),
    file: {
      url: text(file.url || raw.fileUrl || raw.pdfUrl),
      storagePath: text(file.storagePath || raw.fileStoragePath),
      name: text(file.name || raw.fileName),
      originalName: text(file.originalName || raw.originalFileName),
      mimeType: text(file.mimeType || raw.mimeType, 'application/pdf'),
      size: Number(file.size || raw.fileSize || 0)
    }
  };
}

async function loadFormations() {
  const snap = await getDocs(collection(db, FORMATIONS_COLLECTION));
  const items = [];
  snap.forEach((docSnap) => items.push(normalizeFormation(docSnap.data(), docSnap.id)));
  currentFormations = items.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999) || a.title.localeCompare(b.title, 'fr'));
  return currentFormations;
}

async function loadResources() {
  const snap = await getDocs(collection(db, COLLECTION));
  const items = [];
  snap.forEach((docSnap) => items.push(normalizeResource(docSnap.data(), docSnap.id)));
  currentResources = items.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999) || a.title.localeCompare(b.title, 'fr'));
  return currentResources;
}

function renderFormationOptions(selectedIds = []) {
  const select = $('public-resource-formations');
  if (!select) return;

  const selected = new Set(selectedIds.map((id) => text(id)).filter(Boolean));
  select.innerHTML = '';

  if (!currentFormations.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucune fiche formation publique disponible';
    option.disabled = true;
    select.append(option);
    return;
  }

  currentFormations.forEach((formation) => {
    const option = document.createElement('option');
    option.value = formation.id;
    option.textContent = `${formation.title}${formation.status === 'draft' ? ' · brouillon' : ''}`;
    option.selected = selected.has(formation.id);
    select.append(option);
  });
}

function getSelectedFormationIds() {
  const select = $('public-resource-formations');
  if (!select) return [];
  return Array.from(select.selectedOptions || []).map((option) => text(option.value)).filter(Boolean);
}

function getFormationNames(ids = []) {
  const selected = new Set(ids);
  return currentFormations
    .filter((formation) => selected.has(formation.id))
    .map((formation) => formation.title);
}

function renderList() {
  const list = $('public-resources-list');
  if (!list) return;
  list.innerHTML = '';

  if (!currentResources.length) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'Aucune brochure PDF pour le moment. Ajoute un premier document pour alimenter la page Ressources.';
    list.append(empty);
    return;
  }

  currentResources.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'public-admin-card public-admin-resource-card';
    card.dataset.id = item.id;

    const badge = document.createElement('span');
    badge.textContent = `${getStatusLabel(item.status)} · ${getVisibilityLabel(item)}`;

    const title = document.createElement('h3');
    title.textContent = item.title;

    const description = document.createElement('p');
    description.textContent = item.description || 'Description à compléter.';

    const meta = document.createElement('p');
    const formationCount = item.assignedFormationIds.length;
    const fileLabel = item.file.url ? `PDF ${formatFileSize(item.file.size)}`.trim() : 'PDF manquant';
    meta.textContent = `${fileLabel} · ${formationCount ? `${formationCount} formation(s) liée(s)` : 'Brochure globale'} · Ordre ${item.displayOrder || 999}`;

    card.append(badge, title, description, meta);
    card.addEventListener('click', () => openModal(item.id));
    list.append(card);
  });
}

function updateFileUi() {
  const current = $('public-resource-file-current');
  const previewFile = $('public-resource-preview-file');
  const url = text($('public-resource-file-url')?.value);
  const name = text($('public-resource-file-original-name')?.value || $('public-resource-file-name')?.value);
  const size = Number($('public-resource-file-size')?.value || 0);

  const label = pendingPdfFile
    ? `Nouveau PDF : ${pendingPdfFile.name} · ${formatFileSize(pendingPdfFile.size)}`
    : (url ? `PDF actuel : ${name || 'brochure.pdf'} ${formatFileSize(size) ? `· ${formatFileSize(size)}` : ''}` : 'Aucun PDF sélectionné.');

  if (current) current.textContent = label;
  if (previewFile) previewFile.textContent = url || pendingPdfFile
    ? label
    : 'PDF requis pour publier une brochure consultable.';
}

function updatePreview() {
  const preview = $('public-resource-admin-preview');
  if (!preview) return;
  const status = $('public-resource-status')?.value || 'draft';
  const visible = $('public-resource-global-visible')?.checked === true;
  const title = text($('public-resource-title')?.value, 'Brochure SBI');
  const description = text($('public-resource-description')?.value, 'Le rendu public se met à jour pendant la saisie.');
  preview.querySelector('span').textContent = `${getStatusLabel(status)} · ${visible ? 'Ressources' : 'Formation liée'}`;
  preview.querySelector('h4').textContent = title;
  preview.querySelector('p').textContent = description;
  updateFileUi();
}

function fillForm(item = null) {
  suppressDirtyTracking = true;
  $('public-resource-id').value = item?.id || '';
  $('public-resource-title').value = item?.title || '';
  $('public-resource-slug').value = item?.slug || '';
  $('public-resource-slug').dataset.autogenerated = item?.slug ? 'false' : 'true';
  $('public-resource-status').value = item?.status || 'draft';
  $('public-resource-category').value = item?.category || 'Brochure';
  $('public-resource-display-order').value = item?.displayOrder ?? 999;
  $('public-resource-description').value = item?.description || '';
  $('public-resource-global-visible').checked = item?.globalVisible !== false;
  $('public-resource-file-url').value = item?.file?.url || '';
  $('public-resource-file-storage-path').value = item?.file?.storagePath || '';
  $('public-resource-file-name').value = item?.file?.name || '';
  $('public-resource-file-original-name').value = item?.file?.originalName || '';
  $('public-resource-file-mime-type').value = item?.file?.mimeType || 'application/pdf';
  $('public-resource-file-size').value = item?.file?.size || 0;

  pendingPdfFile = null;
  const fileInput = $('public-resource-file');
  if (fileInput) fileInput.value = '';

  renderFormationOptions(item?.assignedFormationIds || []);
  updatePreview();
  formDirty = false;
  suppressDirtyTracking = false;
}

function openModal(id = '') {
  const item = id ? currentResources.find((entry) => entry.id === id) : null;
  $('public-resource-modal-title').textContent = item ? 'Modifier la brochure' : 'Créer une brochure';
  $('delete-public-resource').style.display = item ? '' : 'none';
  fillForm(item);
  $('public-resource-modal').hidden = false;
  $('public-resource-title')?.focus?.({ preventScroll: true });
}

function closeModal({ force = false } = {}) {
  if (!force && !confirmDiscardChanges()) return false;
  $('public-resource-modal').hidden = true;
  pendingPdfFile = null;
  formDirty = false;
  return true;
}

function gatherFormData() {
  const title = text($('public-resource-title')?.value);
  const slug = slugify($('public-resource-slug')?.value || title);
  const fileUrl = text($('public-resource-file-url')?.value);

  if (!title) throw new Error('Le titre est obligatoire.');
  if (!slug) throw new Error('Le slug SEO est obligatoire.');
  if (!fileUrl && !pendingPdfFile) throw new Error('Ajoute un fichier PDF avant de sauvegarder cette brochure.');

  return {
    title,
    slug,
    type: 'brochure',
    category: text($('public-resource-category')?.value, 'Brochure'),
    description: text($('public-resource-description')?.value),
    status: $('public-resource-status')?.value || 'draft',
    globalVisible: $('public-resource-global-visible')?.checked === true,
    assignedFormationIds: getSelectedFormationIds(),
    displayOrder: Number($('public-resource-display-order')?.value || 999),
    file: {
      url: fileUrl,
      storagePath: text($('public-resource-file-storage-path')?.value),
      name: text($('public-resource-file-name')?.value),
      originalName: text($('public-resource-file-original-name')?.value),
      mimeType: text($('public-resource-file-mime-type')?.value, 'application/pdf'),
      size: Number($('public-resource-file-size')?.value || 0)
    },
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || ''
  };
}

function validatePdfFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) throw new Error('Le fichier doit être un PDF.');
  if (file.size > MAX_PDF_BYTES) throw new Error('Le PDF dépasse 50 Mo. Optimise-le avant upload.');
}

async function uploadPdfIfNeeded(docId, data) {
  if (!pendingPdfFile) return data;

  validatePdfFile(pendingPdfFile);
  setStatus('Upload du PDF vers Firebase Storage...', 'loading');

  const safeName = makeSafePdfName(pendingPdfFile.name || `${data.slug}.pdf`);
  const storagePath = `site/resources/${docId}/${Date.now()}-${safeName}`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, pendingPdfFile, {
    contentType: 'application/pdf',
    customMetadata: {
      source: 'sbi-public-resources',
      type: 'brochure-pdf',
      uploadedBy: auth.currentUser?.uid || ''
    }
  });

  const url = await getDownloadURL(fileRef);

  return {
    ...data,
    file: {
      url,
      storagePath,
      name: safeName,
      originalName: pendingPdfFile.name || safeName,
      mimeType: 'application/pdf',
      size: pendingPdfFile.size || 0
    }
  };
}

async function deleteStoragePath(storagePath) {
  const cleanPath = text(storagePath);
  if (!cleanPath) return;
  try {
    await deleteObject(ref(storage, cleanPath));
  } catch (error) {
    console.warn('[SBI Public Resources Admin] PDF Storage non supprimé :', cleanPath, error);
  }
}

async function saveForm(event) {
  event.preventDefault();

  try {
    setStatus('Sauvegarde de la brochure...', 'loading');
    const id = text($('public-resource-id')?.value);
    const previousItem = id ? currentResources.find((entry) => entry.id === id) : null;
    let data = gatherFormData();

    if (id) {
      data = await uploadPdfIfNeeded(id, data);
      await updateDoc(doc(db, COLLECTION, id), data);
      if (pendingPdfFile && previousItem?.file?.storagePath && previousItem.file.storagePath !== data.file.storagePath) {
        await deleteStoragePath(previousItem.file.storagePath);
      }
    } else {
      const resourceRef = doc(collection(db, COLLECTION));
      data = await uploadPdfIfNeeded(resourceRef.id, data);
      await setDoc(resourceRef, {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || ''
      });
    }

    pendingPdfFile = null;
    formDirty = false;
    closeModal({ force: true });
    await refresh();
    setStatus('Brochure sauvegardée.', 'success');
  } catch (error) {
    console.error('[SBI Public Resources Admin] Sauvegarde impossible :', error);
    setStatus(error.message || 'Sauvegarde impossible.', 'error');
    alert(error.message || 'Sauvegarde impossible.');
  }
}

async function deleteCurrent() {
  const id = text($('public-resource-id')?.value);
  if (!id) return;

  const item = currentResources.find((entry) => entry.id === id);
  if (!confirm('Supprimer cette brochure PDF ? Le document sera retiré de la page Ressources.')) return;

  try {
    setStatus('Suppression de la brochure...', 'loading');
    await deleteDoc(doc(db, COLLECTION, id));
    await deleteStoragePath(item?.file?.storagePath);
    formDirty = false;
    closeModal({ force: true });
    await refresh();
    setStatus('Brochure supprimée.', 'success');
  } catch (error) {
    console.error('[SBI Public Resources Admin] Suppression impossible :', error);
    setStatus(error.message || 'Suppression impossible.', 'error');
  }
}

async function refresh() {
  try {
    setStatus('Chargement des brochures...', 'loading');
    await Promise.all([loadFormations(), loadResources()]);
    renderList();
    renderFormationOptions([]);
    setStatus(`${currentResources.length} brochure(s) chargée(s).`, 'success');
  } catch (error) {
    console.error('[SBI Public Resources Admin] Chargement impossible :', error);
    setStatus('Brochures indisponibles. Vérifie les règles Firestore, Storage et le rôle admin.', 'error');
  }
}

function setupPdfInput() {
  const input = $('public-resource-file');
  bind(input, 'change', () => {
    const file = input.files?.[0] || null;

    try {
      if (file) validatePdfFile(file);
      pendingPdfFile = file;
      setFormDirty();
      updatePreview();
    } catch (error) {
      alert(error.message || 'PDF invalide.');
      input.value = '';
      pendingPdfFile = null;
      updatePreview();
    }
  });
}

function setupAutoSlug() {
  const title = $('public-resource-title');
  const slug = $('public-resource-slug');
  bind(title, 'input', () => {
    if (!slug.value || slug.dataset.autogenerated === 'true') {
      slug.value = slugify(title.value);
      slug.dataset.autogenerated = 'true';
    }
    updatePreview();
  });
  bind(slug, 'input', () => { slug.dataset.autogenerated = 'false'; });
}

export function initPublicResourcesAdmin(options = {}) {
  adminRoot = getAdminRoot(options);
  const panel = queryAdmin('[data-sbi-public-resources-admin]');

  if (mounted && panel) return () => {};
  if (!panel || !panel.closest('#tab-public-resources')) return () => {};

  mounted = true;
  cleanupFns = [];
  syncResourcesVisibility();
  bind(window, 'sbi:course-tab-change', syncResourcesVisibility);

  bind($('btn-create-public-resource'), 'click', () => openModal(''));
  bind($('close-public-resource-modal'), 'click', () => closeModal());
  bind($('public-resource-modal'), 'click', (event) => {
    if (event.target === $('public-resource-modal')) closeModal();
  });
  bind($('public-resource-form'), 'submit', saveForm);
  bind($('delete-public-resource'), 'click', deleteCurrent);

  document.querySelectorAll('#public-resource-form input, #public-resource-form textarea, #public-resource-form select').forEach((field) => {
    bind(field, 'input', () => { setFormDirty(); updatePreview(); });
    bind(field, 'change', () => { setFormDirty(); updatePreview(); });
  });

  setupPdfInput();
  setupAutoSlug();
  refresh();

  return () => {
    cleanupFns.splice(0, cleanupFns.length).forEach((fn) => {
      try { fn(); } catch {}
    });
    mounted = false;
    adminRoot = null;
    pendingPdfFile = null;
    formDirty = false;
  };
}

window.SBI_INIT_PUBLIC_RESOURCES_ADMIN = initPublicResourcesAdmin;
