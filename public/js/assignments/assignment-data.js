/**
 * SBI 8.0P.167.273 — Devoirs & Évaluations : socle partagé (admin / prof / élève).
 *
 * Helpers purs (labels, dates, échappement), fabriques de Cloud Functions
 * callables et chargements Firestore mutualisés. Aucun framework.
 */

import { app } from '/js/firebase-init.js';
import {
  collection,
  getDocs,
  query,
  where,
  documentId
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

export const FUNCTIONS_REGION = 'europe-west1';

let functionsInstance = null;
export function assignmentsFunctions() {
  if (!functionsInstance) functionsInstance = getFunctions(app, FUNCTIONS_REGION);
  return functionsInstance;
}

const callableCache = new Map();
export function assignmentCallable(name) {
  if (!callableCache.has(name)) {
    callableCache.set(name, httpsCallable(assignmentsFunctions(), name));
  }
  return callableCache.get(name);
}

export const STUDENT_ROLES = ['student', 'eleve', 'élève', 'etudiant', 'étudiant'];
export const TEACHER_ROLES = ['teacher', 'prof', 'professeur', 'enseignant'];

export const KIND_META = {
  devoir: { label: 'Devoir', short: 'Devoir', icon: '📝', graded: false },
  evaluation: { label: 'Évaluation', short: 'Éval', icon: '🎯', graded: true }
};

export const STATUS_META = {
  draft: { label: 'Brouillon', tone: 'muted' },
  pending_validation: { label: 'En validation', tone: 'pending' },
  published: { label: 'Publié', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  archived: { label: 'Archivé', tone: 'muted' }
};

// Statut de dépôt côté élève (in_progress = pas encore déposé, calculé client).
export const SUB_STATUS_META = {
  in_progress: { label: 'À rendre', tone: 'pending' },
  pending: { label: 'En attente de correction', tone: 'info' },
  corrected: { label: 'Corrigé', tone: 'success' }
};

export function kindMeta(kind) {
  return KIND_META[kind] || KIND_META.devoir;
}
export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.draft;
}
export function subStatusMeta(status) {
  return SUB_STATUS_META[status] || SUB_STATUS_META.in_progress;
}

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function submissionId(assignmentId, studentUid) {
  return `${assignmentId}_${studentUid}`;
}

function todayMidnightMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dueDateMs(dueAt) {
  if (!dueAt) return null;
  const ms = Date.parse(`${dueAt}T23:59:59`);
  return Number.isFinite(ms) ? ms : null;
}

export function formatDate(dueAt) {
  if (!dueAt) return 'Sans date limite';
  const ms = Date.parse(`${dueAt}T00:00:00`);
  if (!Number.isFinite(ms)) return String(dueAt);
  try {
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return String(dueAt);
  }
}

/** État d'échéance pour un devoir (élève). */
export function dueState(dueAt) {
  if (!dueAt) return { label: 'Sans échéance', tone: 'muted', daysLeft: null };
  const dueMidnight = Date.parse(`${dueAt}T00:00:00`);
  if (!Number.isFinite(dueMidnight)) return { label: 'Sans échéance', tone: 'muted', daysLeft: null };
  const dayMs = 24 * 60 * 60 * 1000;
  const daysLeft = Math.round((dueMidnight - todayMidnightMs()) / dayMs);
  if (daysLeft < 0) return { label: `En retard de ${Math.abs(daysLeft)} j`, tone: 'danger', daysLeft };
  if (daysLeft === 0) return { label: "À rendre aujourd'hui", tone: 'danger', daysLeft };
  if (daysLeft === 1) return { label: 'À rendre demain', tone: 'pending', daysLeft };
  if (daysLeft <= 3) return { label: `À rendre dans ${daysLeft} j`, tone: 'pending', daysLeft };
  return { label: `À rendre le ${formatDate(dueAt)}`, tone: 'info', daysLeft };
}

export function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDateTime(value) {
  const ms = timestampToMs(value);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatNote(correction) {
  if (!correction) return '';
  if (correction.note === null || correction.note === undefined || correction.note === '') return '';
  const note = Number(correction.note);
  if (!Number.isFinite(note)) return '';
  const max = Number(correction.gradeMax) > 0 ? Number(correction.gradeMax) : 20;
  return `${note}/${max}`;
}

export function snapToArray(snapshot) {
  const rows = [];
  if (!snapshot) return rows;
  snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  return rows;
}

export function chunk(items, size = 10) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function userFormationIds(userData = {}) {
  const ids = Array.isArray(userData.formationIds) ? userData.formationIds : [];
  return Array.from(new Set(ids.map((v) => String(v || '').trim()).filter(Boolean)));
}

export function userPromotionIds(userData = {}) {
  const ids = [];
  if (userData.promotionId) ids.push(userData.promotionId);
  if (userData.currentPromotionId) ids.push(userData.currentPromotionId);
  if (userData.cohortId) ids.push(userData.cohortId);
  if (Array.isArray(userData.promotionIds)) ids.push(...userData.promotionIds);
  return Array.from(new Set(ids.map((v) => String(v || '').trim()).filter(Boolean)));
}

function formationTitle(data = {}) {
  return String(data.titre || data.nom || data.name || 'Formation').trim() || 'Formation';
}

/**
 * Formations utilisables dans le formulaire de création :
 * - admin : toutes les formations.
 * - prof  : les formations où il est prof (profs array-contains uid) + ses formationIds.
 */
export async function loadFormationsForCreation({ db, isAdmin, uid, userData }) {
  const map = new Map();
  const addSnap = (snap) => snap?.forEach((docSnap) => {
    map.set(docSnap.id, { id: docSnap.id, titre: formationTitle(docSnap.data()), profs: docSnap.data().profs || [] });
  });

  if (isAdmin) {
    addSnap(await getDocs(collection(db, 'formations')));
  } else {
    try {
      addSnap(await getDocs(query(collection(db, 'formations'), where('profs', 'array-contains', uid))));
    } catch (error) {
      console.warn('[SBI Assignments] requête formations prof échouée :', error?.message || error);
    }
    const fIds = userFormationIds(userData);
    for (const part of chunk(fIds, 10)) {
      if (!part.length) continue;
      try {
        addSnap(await getDocs(query(collection(db, 'formations'), where(documentId(), 'in', part))));
      } catch (error) {
        console.warn('[SBI Assignments] requête formations par id échouée :', error?.message || error);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }));
}

export async function loadPromotionsForFormation({ db, formationId }) {
  if (!formationId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'promotions'), where('formationId', '==', formationId)));
    return snapToArray(snap)
      .map((p) => ({ id: p.id, nom: String(p.nom || p.titre || p.name || 'Promotion').trim() || 'Promotion', status: p.status || '' }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  } catch (error) {
    console.warn('[SBI Assignments] requête promotions échouée :', error?.message || error);
    return [];
  }
}

export function getCallableMessage(error, fallback = 'Action impossible pour le moment.') {
  return String(error?.message || error?.details?.message || fallback)
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\([^)]*\)\.?$/g, '')
    .trim() || fallback;
}
