/**
 * =======================================================================
 * SBI 8.0P.167.282 — Documents de formation : module partagé
 * -----------------------------------------------------------------------
 * API commune à la page admin (gestion) et aux pages élève/prof (lecture).
 * Collection Firestore `formationDocuments`, fichiers Storage
 * `formation-documents/{formationId}/{docId}/{fileName}`.
 *
 * Catégories : 4 types fixes (livret, reglement, planning, referentiel) +
 * liste libre "autre". Le planning peut être ciblé sur une promotion
 * (promotionId rempli) ou par défaut formation (promotionId vide).
 * =======================================================================
 */
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const FORMATION_DOCS_COLLECTION = 'formationDocuments';

// mode : 'single' = 1 doc par formation (remplaçable) ; 'planning' = défaut
// formation + overrides par promotion ; 'list' = plusieurs docs libres.
export const DOC_CATEGORIES = [
  { key: 'livret', label: "Livret d'accueil", icon: '📘', mode: 'single' },
  { key: 'reglement', label: 'Règlement intérieur', icon: '📋', mode: 'single' },
  { key: 'planning', label: 'Planning', icon: '🗓️', mode: 'planning' },
  { key: 'referentiel', label: 'Référentiel / RNCP', icon: '🎓', mode: 'single' },
  { key: 'autre', label: 'Autres documents', icon: '📎', mode: 'list' }
];

export const CATEGORY_KEYS = DOC_CATEGORIES.map((c) => c.key);
export const CATEGORY_LABELS = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.key, c.label]));
export const CATEGORY_ICONS = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.key, c.icon]));

export function normalizeCategory(value) {
  const v = String(value || '').trim().toLowerCase();
  return CATEGORY_KEYS.includes(v) ? v : 'autre';
}

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} Mo`;
}

export function sanitizeStorageName(name = 'document') {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}

export function chunk(arr, size = 10) {
  const out = [];
  const list = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function snapToArray(snap) {
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
  return out;
}

// Normalise les formations rattachées à un utilisateur (ids uniquement).
export function userFormationIds(userData = {}) {
  const ids = new Set();
  (Array.isArray(userData.formationIds) ? userData.formationIds : []).forEach((v) => {
    const s = String(v || '').trim();
    if (s) ids.add(s);
  });
  return Array.from(ids);
}

// Agrège toutes les promotions possibles d'un utilisateur.
export function userPromotionIds(userData = {}) {
  const ids = new Set();
  ['promotionId', 'currentPromotionId', 'assignedPromotionId', 'cohortId'].forEach((k) => {
    const s = String(userData[k] || '').trim();
    if (s) ids.add(s);
  });
  ['promotionIds', 'assignedPromotionIds'].forEach((k) => {
    (Array.isArray(userData[k]) ? userData[k] : []).forEach((v) => {
      const s = String(v || '').trim();
      if (s) ids.add(s);
    });
  });
  return Array.from(ids);
}

// Id déterministe pour les catégories à doc unique + planning (formation-wide
// ou ciblé promotion). Pour 'autre' (liste), passer un suffixe unique.
export function buildFormationDocId({ formationId, category, promotionId = '', uniqueSuffix = '' }) {
  const cat = normalizeCategory(category);
  const fid = String(formationId || '').trim();
  if (cat === 'autre') return `autre_${fid}_${uniqueSuffix || Date.now()}`;
  if (cat === 'planning' && promotionId) return `planning_${fid}_${String(promotionId).trim()}`;
  return `${cat}_${fid}`;
}

export async function loadFormationDocuments({ db, formationId }) {
  const fid = String(formationId || '').trim();
  if (!fid) return [];
  const snap = await getDocs(query(collection(db, FORMATION_DOCS_COLLECTION), where('formationId', '==', fid)));
  return snapToArray(snap);
}

// Lecture multi-formations (élève/prof) : query 'in' chunkée → chaque doc
// renvoyé satisfait la règle Firestore (membre de la formation).
export async function loadFormationDocumentsForFormations({ db, formationIds }) {
  const ids = [...new Set((formationIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  const out = [];
  for (const part of chunk(ids, 10)) {
    if (!part.length) continue;
    const snap = await getDocs(query(collection(db, FORMATION_DOCS_COLLECTION), where('formationId', 'in', part)));
    out.push(...snapToArray(snap));
  }
  return out;
}

export async function loadPromotionsForFormation({ db, formationId }) {
  const fid = String(formationId || '').trim();
  if (!fid) return [];
  const snap = await getDocs(query(collection(db, 'promotions'), where('formationId', '==', fid)));
  return snapToArray(snap)
    .map((p) => ({ id: p.id, name: p.nom || p.titre || p.name || p.promotionName || p.id }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }));
}

export function groupByCategory(docs = []) {
  const groups = { livret: [], reglement: [], planning: [], referentiel: [], autre: [] };
  (Array.isArray(docs) ? docs : []).forEach((d) => {
    const cat = normalizeCategory(d.category);
    (groups[cat] || groups.autre).push(d);
  });
  return groups;
}

/**
 * Résout les documents VISIBLES par un élève/prof selon ses promotions :
 * - planning : ceux ciblés sur une de ses promotions s'il y en a, sinon le
 *   planning par défaut formation (promotionId vide) ;
 * - autre : formation-wide + ceux ciblés sur une de ses promotions ;
 * - livret/reglement/referentiel : formation-wide (promotionId vide).
 * Renvoie { livret:[], reglement:[], planning:[], referentiel:[], autre:[] }.
 */
export function resolveVisibleDocuments(docs = [], promotionIds = []) {
  const promoSet = new Set((promotionIds || []).map((v) => String(v || '').trim()).filter(Boolean));
  const byCat = groupByCategory(docs);
  const result = { livret: [], reglement: [], planning: [], referentiel: [], autre: [] };

  result.livret = byCat.livret.filter((d) => !d.promotionId);
  result.reglement = byCat.reglement.filter((d) => !d.promotionId);
  result.referentiel = byCat.referentiel.filter((d) => !d.promotionId);

  const planningTargeted = byCat.planning.filter((d) => d.promotionId && promoSet.has(d.promotionId));
  const planningWide = byCat.planning.filter((d) => !d.promotionId);
  result.planning = planningTargeted.length ? planningTargeted : planningWide;

  result.autre = byCat.autre.filter((d) => !d.promotionId || promoSet.has(d.promotionId));

  return result;
}
