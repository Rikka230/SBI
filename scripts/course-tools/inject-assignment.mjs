#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Injection d'un DEVOIR ou d'une ÉVALUATION (prof)
 * -----------------------------------------------------------------------
 * Module « Devoirs & Évaluations » (.273+, distinct des blocs V2) : crée
 * le devoir via la Cloud Function createOrUpdateAssignment en tant que
 * PROFESSEUR → statut `pending_validation` (soumission admin directe,
 * même règle que les cours depuis le 2026-06-10). L'admin valide/publie
 * et fixe la date limite par promotion.
 *
 * Format de note Obsidian attendu (sections Markdown) :
 *   # DEVOIR — <Titre>            ou   # ÉVALUATION — <Titre>
 *   ## PARAMÈTRES
 *   - Type : devoir | evaluation
 *   - Formation : Animateur E-Sport
 *   - Note maximale : 20          (évaluation uniquement)
 *   - Preuve Qualiopi : oui|non
 *   - Dépôt fichier : oui|non
 *   - Dépôt texte : oui|non
 *   ## CONSIGNE
 *   <texte multi-ligne en clair (rendu pre-wrap côté élève), max 8000>
 *
 * Usage :
 *   node scripts/course-tools/inject-assignment.mjs <note.md> [--yes]
 *   node scripts/course-tools/inject-assignment.mjs --verify <assignmentId>
 * =======================================================================
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ask, signIn, fsRequest, fromFsDoc, callFunction, loadTeacherProfile, resolveFormation
} from './sbi-prof-rest.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(`Usage :
  node scripts/course-tools/inject-assignment.mjs <note.md> [--yes]
  node scripts/course-tools/inject-assignment.mjs --verify <assignmentId>`);
  process.exit(args.length ? 0 : 1);
}

/* ------------------------------ --verify -------------------------------- */

if (args[0] === '--verify') {
  const assignmentId = args[1];
  if (!assignmentId) { console.error('assignmentId requis après --verify.'); process.exit(1); }
  const { idToken } = await signIn();
  const doc = await fsRequest(`/assignments/${assignmentId}`, { idToken });
  const a = fromFsDoc(doc);
  console.log(`titre     : ${a.title}`);
  console.log(`type      : ${a.kind}${a.kind === 'evaluation' ? ` (barème /${a.gradeMax})` : ' (feedback)'}`);
  console.log(`statut    : ${a.status} | Qualiopi: ${a.isQualiopiEvidence ? 'oui' : 'non'}`);
  console.log(`formation : ${a.formationName} (${a.formationId})${a.promotionId ? ` | promotion: ${a.promotionName}` : ' | toutes promotions'}`);
  console.log(`dépôt     : fichier=${a.submissionMode?.file ? 'oui' : 'non'} texte=${a.submissionMode?.text ? 'oui' : 'non'} | date limite: ${a.dueAt || '(admin)'}`);
  console.log(`cursus    : ${a.cursusItemId ? `lié — n°${Number(a.cursusItemOrder) + 1} « ${a.cursusItemTitle} » (${a.cursusItemId})` : 'non lié'}`);
  console.log(`consigne  : ${String(a.consigne || '').length} car., ${String(a.consigne || '').split('\n').length} ligne(s)`);
  console.log('--- début consigne ---');
  console.log(String(a.consigne || '').slice(0, 600));
  console.log('--- fin extrait ---');
  process.exit(0);
}

/* ----------------------------- Parse note ------------------------------- */

const notePath = resolve(args[0]);
const raw = readFileSync(notePath, 'utf8');

function sectionBody(name) {
  // Capture le corps d'une section "## NAME" jusqu'au prochain "## " ou "# " de tête.
  const re = new RegExp(`^##\\s*${name}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,2}\\s|$(?![\\s\\S]))`, 'im');
  const m = raw.match(re);
  // Retire les séparateurs horizontaux Markdown (---) en bordure de section.
  return m ? m[1].replace(/^\s*-{3,}\s*$/gm, '').trim() : '';
}

function paramValue(label) {
  const re = new RegExp(`^\\s*[-*]?\\s*${label}\\s*:\\s*(.+)$`, 'im');
  const m = raw.match(re);
  return m ? m[1].trim() : '';
}

const titleMatch = raw.match(/^#\s*(DEVOIR|[ÉE]VALUATION)\s*[—\-–]\s*(.+)$/im);
if (!titleMatch) {
  console.error('✗ Titre introuvable : la note doit commencer par « # DEVOIR — <Titre> » ou « # ÉVALUATION — <Titre> ».');
  process.exit(1);
}
const kindFromTitle = /DEVOIR/i.test(titleMatch[1]) ? 'devoir' : 'evaluation';
const kind = /^eval/i.test(paramValue('Type')) ? 'evaluation' : (paramValue('Type') ? 'devoir' : kindFromTitle);
const title = titleMatch[2].trim();
const formationTitle = paramValue('Formation') || 'Animateur E-Sport';
const isQualiopiEvidence = /^o/i.test(paramValue('Preuve Qualiopi') || 'oui');
const fileMode = !/^n/i.test(paramValue('Dépôt fichier') || 'oui');
const textMode = /^o/i.test(paramValue('Dépôt texte') || 'non');
let gradeMax = null;
if (kind === 'evaluation') {
  gradeMax = Number(paramValue('Note maximale') || 20);
  if (!Number.isFinite(gradeMax) || gradeMax <= 0 || gradeMax > 1000) gradeMax = 20;
}
const consigne = sectionBody('CONSIGNE');

/* -------------------------------- Lint ---------------------------------- */

const errors = [];
const warnings = [];
if (!title) errors.push('Titre vide.');
if (title.length > 200) errors.push(`Titre trop long (${title.length} > 200).`);
if (/^bloc\s*\d/i.test(title)) warnings.push('Le titre commence par un numéro de bloc — règle Tony : titres sans numéro.');
if (!consigne) errors.push('Section ## CONSIGNE vide ou absente.');
if (consigne.length > 8000) errors.push(`Consigne trop longue (${consigne.length} > 8000).`);
if (!fileMode && !textMode) errors.push('Au moins un mode de dépôt (fichier ou texte) est requis.');
for (const forbidden of ['Yeri Station', 'Abdoul Bane']) {
  if (raw.includes(forbidden)) errors.push(`Contenu interdit : « ${forbidden} » (CONTENT_CLEANUP_RULES).`);
}
if (/[#*_]{2,}|\[\[|\]\]/.test(consigne)) {
  warnings.push('La consigne contient de la syntaxe Markdown (##, **, [[…]]) : elle sera affichée EN CLAIR côté élève (pre-wrap, pas de rendu Markdown).');
}
warnings.forEach((w) => console.warn(`⚠ ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✗ ${e}`));
  process.exit(1);
}

console.log(`\n${kind === 'evaluation' ? 'ÉVALUATION' : 'DEVOIR'} à injecter : ${title}`);
console.log(`Formation : ${formationTitle}`);
console.log(`Dépôt     : fichier=${fileMode ? 'oui' : 'non'} texte=${textMode ? 'oui' : 'non'}${kind === 'evaluation' ? ` | barème /${gradeMax}` : ''} | Qualiopi=${isQualiopiEvidence ? 'oui' : 'non'}`);
console.log(`Consigne  : ${consigne.length} car., ${consigne.split('\n').length} ligne(s)\n`);

/* ------------------------------ Injection ------------------------------- */

const { idToken, uid } = await signIn();
const { profile, authorName } = await loadTeacherProfile(idToken, uid);
console.log(`✔ Connecté : ${authorName} (${profile.role})`);

const formation = await resolveFormation(idToken, profile, formationTitle);
console.log(`✔ Formation : ${formation.titre || formation.title} (${formation.id})`);

// Anti-doublon : devoirs existants de la formation lisibles par le prof.
try {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/sbi-web-4f6b4/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'assignments' }],
        where: { fieldFilter: { field: { fieldPath: 'formationId' }, op: 'EQUAL', value: { stringValue: formation.id } } }
      }
    })
  });
  const rows = await res.json();
  if (res.ok && Array.isArray(rows)) {
    const docs = rows.filter((r) => r.document).map((r) => fromFsDoc(r.document));
    const dup = docs.find((d) => String(d.title || '').toLowerCase() === title.toLowerCase());
    if (dup) {
      console.error(`✗ Un devoir/évaluation du même titre existe déjà (statut ${dup.status}). Injection refusée (pas de doublon).`);
      process.exit(1);
    }
  }
} catch (error) {
  console.warn(`⚠ Vérification d'homonyme impossible (${error.message}).`);
}

const autoYes = args.includes('--yes');
const go = autoYes ? 'oui' : await ask(`Créer ce ${kind} et le SOUMETTRE à la validation admin ? (oui/non) : `);
if (!/^o(ui)?$/i.test(go)) { console.log('Annulé.'); process.exit(0); }

const result = await callFunction('createOrUpdateAssignment', {
  kind,
  title,
  consigne,
  formationId: formation.id,
  promotionId: '',
  dueAt: '',
  submissionMode: { file: fileMode, text: textMode },
  gradeMax,
  isQualiopiEvidence,
  // 8.0P.167.358 : la CF lie automatiquement le devoir à l'item du cursus
  // (coursePlan, types assignment/exam/evaluation) dont le titre normalisé
  // correspond au titre du devoir.
  cursusAutoMatch: true,
  status: 'pending_validation'
}, idToken);

console.log(`\n✔ ${kind === 'evaluation' ? 'Évaluation' : 'Devoir'} créé : ${result.assignmentId} (statut ${result.status})`);
console.log(`  Vérification : node scripts/course-tools/inject-assignment.mjs --verify ${result.assignmentId}`);
console.log('  Côté admin   : /admin/admin-assignments.html (valider/publier, fixer la date limite par promotion).');
