#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Lint d'un payload de cours (anti-erreurs avant injection)
 * -----------------------------------------------------------------------
 * Vérifie qu'un payload produit par md-to-course-payload.mjs respecte ce que
 * l'éditeur V2 et le viewer élève attendent. Échoue (exit 1) si une règle
 * bloquante est violée. Usage :
 *   node scripts/course-tools/lint-course-payload.mjs <payload.json>
 * =======================================================================
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mêmes constantes que l'éditeur (apostrophe typographique U+2019).
const QUALIOPI_VALUES = new Set([
  '2.2 Moyens pédagogiques',
  '2.4 Modalités d’évaluation',
  '3.1 Adaptation pédagogique',
  '' // champ optionnel au niveau bloc
]);
const BLOCK_TYPES = new Set(['lesson', 'fill_blank', 'quiz', 'resource', 'assignment', 'checkpoint', 'case_study']);
const FORBIDDEN_CONTENT = [/yeri\s*station/i, /abdoul\s*bane/i]; // CONTENT_CLEANUP_RULES (vault)
const FILL_BLANK_REGEX = /\[\[([^\]]+)\]\]/g; // LA regex de l'éditeur + du viewer

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const path = resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('Usage : lint-course-payload.mjs <payload.json>'); process.exit(1); }
const { course, _meta } = JSON.parse(readFileSync(path, 'utf8'));

/* --- Racine ----------------------------------------------------------- */
if (!course.title || course.title === 'Cours sans titre') err('Titre du cours manquant.');
if (/^Bloc\s*\d/i.test(course.title || '')) err(`Titre avec numéro de bloc (« ${course.title} ») — règle Tony : pas de numéro dans le titre.`);
if (course.titre !== course.title) err('titre et title doivent être identiques.');
if (!_meta?.formationTitle) err('_meta.formationTitle manquant (la note doit indiquer la Formation).');
if (course.statutValidation !== 'draft') err(`statutValidation doit être 'draft' (reçu : ${course.statutValidation}).`);
if (course.actif !== false) err('actif doit être false (brouillon).');
if (course.lmsStatus !== 'draft') err(`lmsStatus doit être 'draft' (reçu : ${course.lmsStatus}).`);
if (course.schemaVersion !== 'lms-course-v2') err('schemaVersion doit être lms-course-v2.');
if (!QUALIOPI_VALUES.has(course.qualiopiEvidence)) err(`qualiopiEvidence cours hors select : « ${course.qualiopiEvidence} ».`);
if (course.validationRule !== 'score_minimum' && course.validationRule !== 'viewed') err(`validationRule invalide : ${course.validationRule}.`);
if (!Number.isFinite(course.validationScore) || course.validationScore < 0 || course.validationScore > 100) err(`validationScore invalide : ${course.validationScore}.`);
if (!course.objectives) warn('Objectifs du cours vides.');
if (!course.competency) warn('Compétence principale vide.');
if (!course.bloc) warn('Bloc partagé vide (le cours ne sera rattaché à aucun bloc).');
if (course.bloc && !/^Bloc\s*\d+$/i.test(course.bloc)) warn(`Nom de bloc partagé non générique : « ${course.bloc} » (règle : « Bloc N », intitulé long en description).`);

/* --- Blocs ------------------------------------------------------------ */
const blocks = Array.isArray(course.learningBlocks) ? course.learningBlocks : [];
if (!blocks.length) err('Aucun bloc pédagogique.');
let computedScore = 0;
let computedDuration = 0;

blocks.forEach((block, i) => {
  const tag = `Bloc ${i + 1} (${block.type}) « ${block.title} »`;
  if (!BLOCK_TYPES.has(block.type)) err(`${tag} : type inconnu.`);
  if (!block.title) err(`${tag} : titre manquant.`);
  if (block.order !== i) err(`${tag} : order=${block.order} attendu ${i}.`);
  if (block.schemaVersion !== 'learning-block-v1') err(`${tag} : schemaVersion bloc invalide.`);
  if (block.qualiopiEvidence && !QUALIOPI_VALUES.has(block.qualiopiEvidence)) err(`${tag} : qualiopiEvidence hors select : « ${block.qualiopiEvidence} ».`);
  if (!Number.isFinite(block.durationMinutes) || block.durationMinutes < 0) err(`${tag} : timer invalide (${block.durationMinutes}).`);
  if (block.durationMinutes === 0 && block.type !== 'checkpoint') warn(`${tag} : timer 0 min (autorisé seulement pour un checkpoint).`);
  if (block.durationMinutes > 30) warn(`${tag} : timer ${block.durationMinutes} min — vérifier qu'il reste pédagogique, pas punitif.`);
  computedDuration += Math.max(0, Number(block.durationMinutes) || 0);
  if (block.visibleInProgram !== false) computedScore += Number(block.maxScore || 0);

  if (block.type === 'fill_blank') {
    const tokens = [...String(block.prompt || '').matchAll(FILL_BLANK_REGEX)].map((m) => m[1].trim()).filter(Boolean);
    if (!tokens.length) err(`${tag} : aucun trou détecté par la regex de l'éditeur ([[...]]).`);
    if (/\](?!\])|(?<!\[)\[(?!\[)/.test(String(block.prompt || '').replace(FILL_BLANK_REGEX, ''))) {
      warn(`${tag} : crochets simples résiduels dans le prompt — vérifier la conversion [[...]].`);
    }
    const blanks = Array.isArray(block.blanks) ? block.blanks : [];
    if (blanks.length !== tokens.length) err(`${tag} : ${tokens.length} trou(x) dans le prompt mais ${blanks.length} entrée(s) blanks.`);
    blanks.forEach((blank, j) => {
      if (!blank.token) err(`${tag} : blanks[${j}] sans token.`);
      if (tokens[j] && blank.token !== tokens[j]) err(`${tag} : blanks[${j}].token (« ${blank.token} ») ≠ trou n°${j + 1} du prompt (« ${tokens[j]} »).`);
      if (!blank.answers) err(`${tag} : blanks[${j}] sans réponses acceptées.`);
      if (!Number.isFinite(blank.points) || blank.points <= 0) err(`${tag} : blanks[${j}].points invalide (${blank.points}).`);
    });
    if (!['per_blank', 'global'].includes(block.scoringMode)) err(`${tag} : scoringMode invalide (${block.scoringMode}).`);
  }

  if (block.type === 'quiz') {
    const questions = Array.isArray(block.questions) ? block.questions : [];
    if (!questions.length) err(`${tag} : QCM sans question.`);
    const positions = [];
    questions.forEach((q, j) => {
      if (!q.question) err(`${tag} : question ${j + 1} vide.`);
      if (!Array.isArray(q.options) || q.options.length < 2) err(`${tag} : question ${j + 1} doit avoir ≥ 2 options.`);
      if (q.options.some((o) => !String(o || '').trim())) err(`${tag} : question ${j + 1} contient une option vide.`);
      if (!Array.isArray(q.correctIndices) || !q.correctIndices.length) err(`${tag} : question ${j + 1} sans bonne réponse.`);
      q.correctIndices.forEach((idx) => {
        if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) err(`${tag} : question ${j + 1} correctIndices hors limites (${idx}).`);
      });
      if (!Number.isFinite(q.points) || q.points <= 0) err(`${tag} : question ${j + 1} points invalides (${q.points}).`);
      positions.push(q.correctIndices[0]);
    });
    const distinct = new Set(positions);
    if (questions.length >= 4 && distinct.size === 1) {
      warn(`${tag} : toutes les bonnes réponses sont en position ${String.fromCharCode(65 + positions[0])} — varier la position.`);
    }
  }

  if (block.type === 'resource') {
    if (!block.resourceDescription) warn(`${tag} : description de ressource vide.`);
    if (!block.resourceStoragePath && !block.resourceUrl) warn(`${tag} : aucun fichier ni lien attaché — à uploader avant soumission.`);
  }
  if (block.type === 'assignment') {
    if (!block.assignmentPrompt) err(`${tag} : sujet du devoir vide.`);
    if (!block.evaluationCriteria) warn(`${tag} : critères de réussite vides.`);
    if (!block.assignmentCorrection) err(`${tag} : correction autonome (assignmentCorrection) vide — retour Tony 2026-06-10.`);
  }
  if (block.type === 'case_study') {
    if (!block.scenario && !block.caseContext) err(`${tag} : étude de cas sans cas ni contexte.`);
    if (!block.instructions) err(`${tag} : consigne (instructions) manquante — retour Tony 2026-06-10.`);
    if (!block.guidedQuestions) warn(`${tag} : pas de questions guidées.`);
    if (!block.expectedAnswer) warn(`${tag} : pas de correction attendue (auto-évaluation impossible).`);
  }
  if (block.type === 'lesson' && !/sbi-|style=|<h2|<strong/.test(String(block.content || ''))) {
    warn(`${tag} : contenu sans mise en forme SBI (styles Quill attendus).`);
  }
  if (block.type === 'checkpoint') {
    if (!block.checkpointGoal) warn(`${tag} : objectif du checkpoint vide.`);
    if (block.requiresAllChecked !== true || block.checkpointMode !== 'acquis_checklist') err(`${tag} : checkpoint non hydraté (checkpointMode/requiresAllChecked).`);
    if (block.durationMinutes > 1) warn(`${tag} : timer checkpoint ${block.durationMinutes} min (recommandé : 0-1, ne pas bloquer inutilement).`);
  }
});

/* --- Cohérences globales ---------------------------------------------- */
if (course.maxScore !== computedScore) err(`maxScore (${course.maxScore}) ≠ somme des scores de blocs visibles (${computedScore}).`);
if (course.totalScore !== course.maxScore || course.totalXp !== course.maxScore) err('totalScore/totalXp doivent égaler maxScore.');
if (course.estimatedDurationMinutes !== computedDuration) err(`estimatedDurationMinutes (${course.estimatedDurationMinutes}) ≠ somme des timers (${computedDuration}).`);
if (!Array.isArray(course.chapitres) || course.chapitres.length !== blocks.length) err('chapitres legacy absent ou de longueur différente de learningBlocks.');
const hasEval = blocks.some((b) => ['quiz', 'fill_blank', 'assignment', 'case_study', 'checkpoint'].includes(b.type));
if (course.validationRule === 'score_minimum' && !hasEval) warn('validationRule=score_minimum mais aucun bloc évaluatif.');

const fullText = JSON.stringify(course);
FORBIDDEN_CONTENT.forEach((re) => { if (re.test(fullText)) err(`Contenu interdit détecté (${re}) — règle CONTENT_CLEANUP_RULES.`); });

const docSize = Buffer.byteLength(fullText, 'utf8');
if (docSize > 900 * 1024) err(`Document trop volumineux (${Math.round(docSize / 1024)} Ko, limite Firestore ~1 Mo).`);
else if (docSize > 700 * 1024) warn(`Document volumineux (${Math.round(docSize / 1024)} Ko) — surveiller la limite Firestore (1 Mo).`);

/* --- Rapport ----------------------------------------------------------- */
console.log(`Lint : ${course.title}`);
console.log(`  ${blocks.length} blocs · ${course.maxScore} pts · ${course.estimatedDurationMinutes} min · ${Math.round(docSize / 1024)} Ko`);
if (warnings.length) { console.log(`  ⚠ ${warnings.length} avertissement(s) :`); warnings.forEach((w) => console.log(`    - ${w}`)); }
if (errors.length) {
  console.log(`  ✗ ${errors.length} ERREUR(S) bloquante(s) :`);
  errors.forEach((e) => console.log(`    - ${e}`));
  process.exit(1);
}
console.log('  ✔ Aucune erreur bloquante.');
