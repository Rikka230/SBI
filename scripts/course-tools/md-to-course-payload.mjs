#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Convertisseur note Obsidian → payload éditeur V2
 * -----------------------------------------------------------------------
 * Lit une note de cours du vault (format « copier-coller éditeur »,
 * cf. 14_COURSES_QUALIOPI/COURSES/ANIMATEUR_E_SPORT/*.md) et produit un
 * JSON au format EXACT que l'éditeur V2 sauvegarde (schemaVersion
 * 'lms-course-v2'), prêt pour lint-course-payload.mjs puis inject-course.mjs.
 *
 * La normalisation RÉPLIQUE public/js/course-editor-v2/course-editor-v2.js :
 *   - extractTokens (regex /\[\[([^\]]+)\]\]/g)            [l.2440]
 *   - normalizeQuizQuestions (correctIndices, min 2 opts)  [l.2323]
 *   - normalizePedagogicBlockForSave / hydrateCheckpoint   [l.1029/1005]
 *   - normalizeLearningBlockForSave (order/scores)         [l.1068]
 *   - convertBlocksToLegacyChapters (chapitres legacy)     [l.1082]
 *   - buildCoursePayload (champs racine, compteurs)        [l.3050]
 *
 * Conversions Obsidian → éditeur :
 *   - texte à trous : [mot] (simple crochet) → [[mot]]
 *   - QCM : lettres (B / « B et D ») → correctIndices [1] / [1,3]
 *   - Preuve Qualiopi libre → select fermé (2.2 / 2.4 / 3.1)
 *
 * Usage : node scripts/course-tools/md-to-course-payload.mjs <note.md> [-o out.json]
 * Aucune écriture Firestore ici : sortie JSON locale uniquement.
 * =======================================================================
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ---------------------------------------------------------------------
 * Répliques EXACTES des utilitaires de l'éditeur V2
 * ------------------------------------------------------------------- */

const BLOCK_TYPES = [
  { type: 'lesson', label: 'Leçon' },
  { type: 'fill_blank', label: 'Texte à trous' },
  { type: 'quiz', label: 'QCM' },
  { type: 'resource', label: 'Ressource' },
  { type: 'assignment', label: 'Devoir' },
  { type: 'checkpoint', label: 'Checkpoint' },
  { type: 'case_study', label: 'Étude de cas' }
];
const BLOCK_TYPE_MAP = new Map(BLOCK_TYPES.map((item) => [item.type, item]));
const PEDAGOGIC_BLOCK_TYPES = new Set(['resource', 'assignment', 'checkpoint', 'case_study']);

// Valeurs EXACTES du select Qualiopi de l'éditeur (apostrophe typographique U+2019).
const QUALIOPI_MOYENS = '2.2 Moyens pédagogiques';
const QUALIOPI_EVALUATION = '2.4 Modalités d’évaluation';
const QUALIOPI_ADAPTATION = '3.1 Adaptation pédagogique';

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function escapeHtml(value) {
  return normalizeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function makeId(prefix = 'block') {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function toPositiveMinutes(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, minutes);
}

function extractTokens(text = '') {
  const matches = [...String(text).matchAll(/\[\[([^\]]+)\]\]/g)];
  return matches.map((m) => normalizeString(m[1])).filter(Boolean);
}

function normalizeFillBlankRows(block) {
  if (Array.isArray(block.blanks) && block.blanks.length) return block.blanks;
  const tokens = extractTokens(block.prompt || '');
  block.blanks = tokens.map((token) => ({ id: makeId('blank'), token, answers: token, points: 1 }));
  return block.blanks;
}

function normalizeQuizQuestions(block) {
  if (!block) return [];
  if (!Array.isArray(block.questions) || !block.questions.length) block.questions = [];
  block.questions = block.questions.map((question) => {
    const options = Array.isArray(question.options) && question.options.length ? question.options : ['', ''];
    while (options.length < 2) options.push('');
    const correctIndices = Array.isArray(question.correctIndices)
      ? question.correctIndices.map((i) => Number(i)).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
      : [];
    return {
      id: question.id || makeId('question'),
      question: question.question || '',
      options,
      correctIndices: correctIndices.length ? correctIndices : [0],
      points: Number(question.points || 1)
    };
  });
  return block.questions;
}

function getBlockScore(block = {}) {
  if (!block) return 0;
  if (block.type === 'fill_blank') {
    return normalizeFillBlankRows(block).reduce((t, blank) => t + Number(blank.points || 0), 0);
  }
  if (block.type === 'quiz') {
    return normalizeQuizQuestions(block).reduce((t, q) => t + Number(q.points || 0), 0);
  }
  if (block.type === 'checkpoint') {
    const score = Number(block.checkpointScore ?? block.xpReward ?? block.score ?? 10);
    return Number.isFinite(score) && score > 0 ? score : 10;
  }
  const score = Number(block.score || 0);
  return Number.isFinite(score) && score > 0 ? score : 0;
}

function calculateCourseMaxScore(blocks = []) {
  return blocks.reduce((total, block) => {
    if (!block || block.visibleInProgram === false) return total;
    return total + getBlockScore(block);
  }, 0);
}

function forceAutonomousCorrectionBlock(block = {}) {
  if (!block || typeof block !== 'object') return block;
  if (block.type === 'assignment') {
    return { ...block, manualValidation: false, correctionMode: 'self', teacherSubmissionPlanned: true };
  }
  if (block.type === 'case_study') {
    return { ...block, correctionMode: 'self', teacherSubmissionPlanned: true };
  }
  return block;
}

function getBlockMeta(type) {
  return BLOCK_TYPE_MAP.get(type) || { label: type || 'Bloc' };
}

function getBlockStepTitle(block, index = 0) {
  return normalizeString(block?.title || block?.titre) || `${getBlockMeta(block?.type).label} ${index + 1}`;
}

function getCheckpointItemsForBlock(block, blocks = []) {
  if (!block || !Array.isArray(blocks)) return [];
  const checkpointIndex = blocks.findIndex((item) => item.id === block.id);
  const sourceBlocks = checkpointIndex >= 0 ? blocks.slice(0, checkpointIndex) : blocks;
  return sourceBlocks
    .filter((item) => item && item.visibleInProgram !== false && item.type !== 'checkpoint')
    .map((item, index) => ({
      id: item.id || `step-${index}`,
      title: getBlockStepTitle(item, index),
      type: item.type || 'lesson',
      label: getBlockMeta(item.type).label
    }));
}

function hydrateCheckpointBlock(block, blocks = []) {
  if (!block || block.type !== 'checkpoint') return block;
  const checkpointScore = getBlockScore(block);
  return {
    ...block,
    checkpointMode: 'acquis_checklist',
    checkpointItems: getCheckpointItemsForBlock(block, blocks),
    requiresAllChecked: true,
    isBlockingPrerequisite: true,
    checkpointScore,
    xpReward: checkpointScore
  };
}

function normalizePedagogicBlockForSave(block = {}) {
  if (!PEDAGOGIC_BLOCK_TYPES.has(block.type)) return block;
  const next = { ...block };
  if (next.type === 'resource') {
    next.resourceDescription = next.resourceDescription || '';
    next.consultationInstruction = next.consultationInstruction || '';
    next.resourceUrl = next.resourceUrl || '';
    next.resourceStoragePath = next.resourceStoragePath || '';
    next.resourceFileName = next.resourceFileName || '';
    next.resourceMimeType = next.resourceMimeType || '';
    next.resourceSize = Number(next.resourceSize || 0);
    next.resourceOriginalSize = Number(next.resourceOriginalSize || 0);
    next.resourceCompressed = next.resourceCompressed === true;
    next.content = next.resourceDescription || '';
  } else if (next.type === 'assignment') {
    next.assignmentPrompt = next.assignmentPrompt || '';
    next.assignmentCorrection = next.assignmentCorrection || '';
    next.evaluationCriteria = next.evaluationCriteria || '';
    next.content = next.assignmentPrompt || '';
  } else if (next.type === 'checkpoint') {
    next.checkpointGoal = next.checkpointGoal || '';
    next.expectedResult = next.expectedResult || '';
    next.content = next.checkpointGoal || '';
  } else if (next.type === 'case_study') {
    next.scenario = next.scenario || '';
    next.caseContext = next.caseContext || '';
    next.analysisMaterials = next.analysisMaterials || '';
    next.guidedQuestions = next.guidedQuestions || '';
    next.expectedAnswer = next.expectedAnswer || '';
    next.content = next.scenario || '';
  }
  return next;
}

function normalizeLearningBlockForSave(block = {}, index = 0, blocks = []) {
  const normalizedBlock = normalizePedagogicBlockForSave(forceAutonomousCorrectionBlock(block));
  const hydratedBlock = hydrateCheckpointBlock(normalizedBlock, blocks);
  const blockScore = getBlockScore(hydratedBlock);
  return {
    ...hydratedBlock,
    order: index,
    activityType: hydratedBlock.type,
    schemaVersion: 'learning-block-v1',
    maxScore: blockScore,
    score: blockScore
  };
}

function renderFillBlankStudentPromptHtml(block) {
  const prompt = escapeHtml(block.prompt || '');
  const html = prompt.replace(/\[\[([^\]]+)\]\]/g, '<span class="sbi-fib-blank-static" aria-hidden="true"></span>');
  return html || '<span style="color:var(--editor-muted);">Aucun texte a completer.</span>';
}

function buildPedagogicLine(label, value) {
  const cleanValue = normalizeString(value);
  if (!cleanValue) return '';
  return `<div class="sbi-pedagogic-line"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(cleanValue)}</span></div>`;
}

function buildPedagogicText(label, value) {
  const cleanValue = normalizeString(value);
  if (!cleanValue) return '';
  return `<section class="sbi-pedagogic-section"><h5>${escapeHtml(label)}</h5><p>${escapeHtml(cleanValue).replace(/\n/g, '<br>')}</p></section>`;
}

function buildPedagogicBlockContent(block = {}) {
  const instructions = block.instructions
    ? `<p class="sbi-preview-instructions">${escapeHtml(block.instructions)}</p>`
    : '';
  let body = '';
  if (block.type === 'resource') {
    const resourceLink = block.resourceUrl
      ? `<a class="sbi-pedagogic-link" href="${escapeHtml(block.resourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.resourceUrl)}</a>`
      : '';
    const resourceFile = block.resourceFileName ? buildPedagogicLine('Fichier', block.resourceFileName) : '';
    body = `${buildPedagogicLine('Type', block.resourceType || 'link')}${resourceFile}${resourceLink}${buildPedagogicText('Description', block.resourceDescription)}${buildPedagogicText('À observer / retenir', block.consultationInstruction)}`;
  } else if (block.type === 'assignment') {
    body = `${buildPedagogicText('Travail demandé', block.assignmentPrompt)}${buildPedagogicLine('Livrable attendu', block.deliverableType || 'text')}${buildPedagogicLine('Délai', block.duePolicy || 'promotion_date')}${buildPedagogicLine('Correction', 'autonome')}${buildPedagogicText('Critères d’évaluation', block.evaluationCriteria)}`;
  } else if (block.type === 'checkpoint') {
    body = `${buildPedagogicText('Objectif', block.checkpointGoal)}${buildPedagogicText('Résultat attendu', block.expectedResult)}`;
  } else if (block.type === 'case_study') {
    body = `${buildPedagogicText('Contexte', block.caseContext)}${buildPedagogicText('Scénario', block.scenario)}${buildPedagogicText('Questions guidées', block.guidedQuestions)}${buildPedagogicText('Réponse attendue', block.expectedAnswer)}`;
  }
  return `${instructions}${body}`;
}

function convertBlocksToLegacyChapters(blocks = []) {
  return blocks.map((rawBlock, index) => {
    const block = hydrateCheckpointBlock(rawBlock, blocks);
    if (block.type === 'quiz') {
      return {
        id: block.id || makeId('chap'),
        type: 'quiz',
        titre: block.title || `QCM ${index + 1}`,
        durationMinutes: toPositiveMinutes(block.durationMinutes),
        maxScore: getBlockScore(block),
        score: getBlockScore(block),
        questions: (block.questions || []).map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? q.options : [],
          correctIndices: Array.isArray(q.correctIndices) ? q.correctIndices : []
        }))
      };
    }
    if (block.type === 'fill_blank') {
      const prompt = renderFillBlankStudentPromptHtml(block);
      const blanks = normalizeFillBlankRows(block).map((blank) => ({
        id: blank.id || makeId('blank'),
        token: blank.token || '',
        answers: blank.answers || blank.token || '',
        points: Number(blank.points || 1)
      }));
      return {
        id: block.id || makeId('chap'),
        type: 'text',
        activityType: 'fill_blank',
        titre: block.title || `Texte à trous ${index + 1}`,
        instructions: block.instructions || '',
        prompt: block.prompt || '',
        blanks,
        scoringMode: block.scoringMode || 'per_blank',
        maxAttempts: Number(block.maxAttempts || 2),
        showAnswersAtEnd: block.showAnswersAtEnd !== false,
        feedbackCorrect: block.feedbackCorrect || '',
        feedbackIncorrect: block.feedbackIncorrect || '',
        contenu: `<h3>${escapeHtml(block.title || 'Texte à trous')}</h3><p>${escapeHtml(block.instructions || '')}</p><div>${prompt}</div>`,
        mediaType: 'image',
        durationMinutes: toPositiveMinutes(block.durationMinutes),
        maxScore: getBlockScore(block),
        score: getBlockScore(block),
        questions: []
      };
    }
    if (PEDAGOGIC_BLOCK_TYPES.has(block.type)) {
      const forced = forceAutonomousCorrectionBlock(block);
      const blockScore = getBlockScore(forced);
      return {
        id: forced.id || makeId('chap'),
        type: forced.type,
        activityType: forced.type,
        titre: forced.title || getBlockMeta(forced.type).label,
        instructions: forced.instructions || '',
        contenu: buildPedagogicBlockContent(forced),
        mediaType: 'image',
        durationMinutes: toPositiveMinutes(forced.durationMinutes),
        maxScore: blockScore,
        score: blockScore,
        questions: [],
        resourceType: forced.resourceType || '',
        resourceUrl: forced.resourceUrl || '',
        resourceStoragePath: forced.resourceStoragePath || '',
        resourceFileName: forced.resourceFileName || '',
        resourceMimeType: forced.resourceMimeType || '',
        resourceSize: Number(forced.resourceSize || 0),
        resourceOriginalSize: Number(forced.resourceOriginalSize || 0),
        resourceCompressed: forced.resourceCompressed === true,
        resourceDescription: forced.resourceDescription || '',
        consultationInstruction: forced.consultationInstruction || '',
        assignmentPrompt: forced.assignmentPrompt || '',
        assignmentCorrection: forced.assignmentCorrection || '',
        deliverableType: forced.deliverableType || '',
        duePolicy: forced.duePolicy || '',
        evaluationCriteria: forced.evaluationCriteria || '',
        correctionMode: forced.correctionMode || 'self',
        manualValidation: forced.manualValidation === true,
        teacherSubmissionPlanned: forced.teacherSubmissionPlanned !== false,
        checkpointGoal: forced.checkpointGoal || '',
        checkpointMode: forced.checkpointMode || '',
        expectedResult: forced.expectedResult || '',
        checkpointItems: Array.isArray(forced.checkpointItems) ? forced.checkpointItems : [],
        requiresAllChecked: forced.requiresAllChecked !== false,
        isBlockingPrerequisite: forced.isBlockingPrerequisite === true,
        checkpointScore: Number(forced.checkpointScore || blockScore || 0),
        xpReward: Number(forced.xpReward || blockScore || 0),
        caseContext: forced.caseContext || '',
        scenario: forced.scenario || '',
        analysisMaterials: forced.analysisMaterials || '',
        guidedQuestions: forced.guidedQuestions || '',
        expectedAnswer: forced.expectedAnswer || ''
      };
    }
    return {
      id: block.id || makeId('chap'),
      type: 'text',
      titre: block.title || `Leçon ${index + 1}`,
      contenu: block.content || block.instructions || '',
      mediaType: block.mediaType || 'image',
      mediaImage: block.mediaImage || '',
      mediaVideo: block.mediaVideo || '',
      durationMinutes: toPositiveMinutes(block.durationMinutes),
      questions: []
    };
  });
}

/* ---------------------------------------------------------------------
 * Parseur de la note Obsidian (format « copier-coller éditeur »)
 * ------------------------------------------------------------------- */

const TYPE_FROM_LABEL = new Map([
  ['leçon', 'lesson'], ['lecon', 'lesson'],
  ['texte à trous', 'fill_blank'], ['texte a trous', 'fill_blank'],
  ['qcm', 'quiz'],
  ['ressource', 'resource'],
  ['devoir', 'assignment'],
  ['checkpoint', 'checkpoint'],
  ['étude de cas', 'case_study'], ['etude de cas', 'case_study'], ['cas pratique', 'case_study']
]);

function deburr(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Découpe la note en « segments » : pour chaque H1 (# ...), une liste ordonnée
 * de paires { label, text } où label = dernier sous-titre (## / ###) ou ligne
 * de libellé « Xxx : », et text = contenu du bloc ```txt suivant.
 */
function parseNoteSegments(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;
  let label = '';
  let inFence = false;
  let fenceBuffer = [];

  for (const rawLine of lines) {
    const line = rawLine;
    if (inFence) {
      if (/^```\s*$/.test(line)) {
        inFence = false;
        if (current) current.items.push({ label, text: fenceBuffer.join('\n').trim() });
        fenceBuffer = [];
      } else {
        fenceBuffer.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) { inFence = true; fenceBuffer = []; continue; }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      current = { title: h1[1].trim(), items: [] };
      sections.push(current);
      label = '';
      continue;
    }
    const h23 = line.match(/^#{2,3}\s+(.+)$/);
    if (h23) { label = h23[1].trim(); continue; }
    const labelLine = line.match(/^([A-Za-zÀ-ÿ’' \-]+?)\s*:\s*$/);
    if (labelLine) { label = labelLine[1].trim(); continue; }
  }
  return sections;
}

// Les notes annotent parfois le champ cible : « Contexte (champ caseContext) »
// → on matche sur le libellé débarrassé du suffixe parenthésé.
function cleanLabel(label) {
  return deburr(label).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\/\s.*$/, '').trim();
}

function itemText(section, labelPattern) {
  const re = labelPattern instanceof RegExp ? labelPattern : new RegExp(`^${labelPattern}$`, 'i');
  const found = (section?.items || []).find(
    (item) => re.test(cleanLabel(item.label)) || re.test(deburr(item.label)) || re.test(item.label)
  );
  return found ? found.text : '';
}

function parsePedagogicParams(text = '') {
  const params = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const key = deburr(m[1]);
    const value = m[2].trim();
    if (key.startsWith('competence')) params.competency = value;
    else if (key.startsWith('preuve')) params.qualiopiFree = value;
    else if (key.startsWith('duree')) params.durationMinutes = parseInt(value, 10) || 0;
    else if (key === 'score') params.score = parseInt(value, 10) || 0;
    else if (key.startsWith('inclure')) params.visibleInProgram = !/^non/i.test(value);
    else if (key.startsWith('regle')) params.rule = value;
    else if (key.startsWith('seuil')) params.threshold = parseInt(value, 10) || 0;
  }
  return params;
}

// Preuve Qualiopi libre (note) → valeur EXACTE du select fermé de l'éditeur.
// Priorité au préfixe explicite « 2.2 / 2.4 / 3.1 » s'il est présent dans la note.
function mapQualiopiEvidence(freeText = '', blockType = '') {
  const t = deburr(freeText);
  if (/\b2[.,]2\b/.test(t)) return QUALIOPI_MOYENS;
  if (/\b2[.,]4\b/.test(t)) return QUALIOPI_EVALUATION;
  if (/\b3[.,]1\b/.test(t)) return QUALIOPI_ADAPTATION;
  if (/adaptation|positionnement|besoin|rythme|niveau/.test(t)) return QUALIOPI_ADAPTATION;
  if (['quiz', 'fill_blank', 'assignment', 'checkpoint', 'case_study'].includes(blockType)) return QUALIOPI_EVALUATION;
  if (/quiz|evaluation|devoir|checkpoint|score|exercice|complete/.test(t)) return QUALIOPI_EVALUATION;
  return QUALIOPI_MOYENS;
}

// Texte brut (note) → HTML simple compatible Quill (paragraphes + listes).
function textToHtml(text = '') {
  const out = [];
  let listBuffer = [];
  const flushList = () => {
    if (listBuffer.length) {
      out.push(`<ul>${listBuffer.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      listBuffer = [];
    }
  };
  for (const paragraph of text.split(/\n{2,}/)) {
    const lines = paragraph.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const li = line.match(/^[-•]\s+(.+)$/);
      if (li) { listBuffer.push(li[1].replace(/\s*;\s*$/, '')); continue; }
      flushList();
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
    flushList();
  }
  flushList();
  return out.join('');
}

// [mot] (simple crochet, format Obsidian historique) → [[mot]] (éditeur).
function upgradeBracketSyntax(prompt = '') {
  if (prompt.includes('[[')) return prompt;
  return prompt.replace(/\[([^\[\]\n]+)\]/g, '[[$1]]');
}

function parseQuizQuestions(section) {
  const questions = [];
  let current = null;
  for (const item of section.items) {
    const label = deburr(item.label);
    if (/^question\s*\d+/.test(label)) {
      if (current) questions.push(current);
      current = { question: item.text, options: [], correctLetters: '', points: 1 };
    } else if (current && /^reponses?$/.test(label)) {
      current.options = item.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((l) => l.replace(/^[A-Z]\s*[.)]\s*/, ''));
    } else if (current && /^bonnes? reponses?$/.test(label)) {
      current.correctLetters = item.text.trim();
    } else if (current && /^points?$/.test(label)) {
      current.points = parseInt(item.text, 10) || 1;
    }
  }
  if (current) questions.push(current);
  return questions.map((q) => {
    const letters = (q.correctLetters.match(/[A-Z]/g) || ['A']);
    const correctIndices = letters.map((letter) => letter.charCodeAt(0) - 65)
      .filter((i) => i >= 0 && i < q.options.length);
    return {
      id: makeId('question'),
      question: q.question,
      options: q.options,
      correctIndices: correctIndices.length ? correctIndices : [0],
      points: q.points
    };
  });
}

function buildLessonContent(section, report) {
  const script = itemText(section, /script video/);
  const content = itemText(section, /^contenu$/);
  const media = deburr(itemText(section, /^media$/));
  const imageSuggestion = itemText(section, /suggestion image/);
  const title = itemText(section, /^titre du bloc$/);
  let html = '';
  if (script) {
    report.videosToProduce.push({ block: title, script: script.slice(0, 120) + '…' });
    html += `<h2>Script vidéo</h2>${textToHtml(script)}<h2>Contenu du cours</h2>`;
  }
  html += textToHtml(content);
  if (media.includes('video')) report.mediaPlanned.push({ block: title, type: 'video' });
  if (imageSuggestion) report.imagesToProduce.push({ block: title, suggestion: imageSuggestion });
  return html;
}

function parseBlocks(sections, report) {
  const blocks = [];
  for (const section of sections) {
    if (!/^BLOC\s/i.test(section.title)) continue;
    const typeLabel = deburr(itemText(section, /^type de bloc$/));
    const type = TYPE_FROM_LABEL.get(typeLabel);
    if (!type) { report.warnings.push(`Type de bloc inconnu « ${typeLabel} » (${section.title}) — ignoré.`); continue; }

    const params = parsePedagogicParams(itemText(section, /parametres pedagogiques/));
    const base = {
      id: makeId(type === 'fill_blank' ? 'fib' : type),
      type,
      title: itemText(section, /^titre du bloc$/) || getBlockMeta(type).label,
      instructions: itemText(section, /^consignes?$/),
      durationMinutes: toPositiveMinutes(params.durationMinutes ?? 5),
      visibleInProgram: params.visibleInProgram !== false,
      qualiopiEvidence: mapQualiopiEvidence(params.qualiopiFree, type),
      competency: params.competency || ''
    };
    if (params.qualiopiFree) report.qualiopiFreeTexts.push({ block: base.title, note: params.qualiopiFree, mapped: base.qualiopiEvidence });

    if (type === 'lesson') {
      blocks.push({ ...base, content: buildLessonContent(section, report), mediaType: 'image', mediaImage: '', mediaVideo: '', score: Number(params.score || 0) });
    } else if (type === 'resource') {
      const description = itemText(section, /^contenu$/) || itemText(section, /^description/);
      report.pdfsToGenerate.push({ block: base.title, sourceChars: description.length });
      blocks.push({
        ...base,
        resourceType: 'pdf',
        resourceUrl: '', resourceStoragePath: '', resourceFileName: '', resourceMimeType: '',
        resourceSize: 0, resourceOriginalSize: 0, resourceCompressed: false,
        resourceDescription: description,
        consultationInstruction: itemText(section, /observer|retenir/),
        score: Number(params.score || 0)
      });
    } else if (type === 'fill_blank') {
      const prompt = upgradeBracketSyntax(itemText(section, /^texte a trous$/));
      const tokens = extractTokens(prompt);
      // Réponses attendues : 2 formats dans les notes —
      //  (a) liste simple : un token par ligne ;
      //  (b) structuré : « Trou N : / Réponse principale : X / Alternatives acceptées : a, b ».
      const expectedRaw = itemText(section, /reponses attendues/);
      const answersByIndex = [];
      if (/r[ée]ponse principale/i.test(expectedRaw)) {
        let current = null;
        for (const line of expectedRaw.split(/\r?\n/)) {
          if (/^trou\s*\d+/i.test(line.trim())) { if (current) answersByIndex.push(current); current = []; continue; }
          const main = line.match(/r[ée]ponse principale\s*:\s*(.+)$/i);
          if (main && current) { current.unshift(main[1].trim()); continue; }
          const alts = line.match(/alternatives?\s+accept[ée]es?\s*:\s*(.+)$/i);
          if (alts && current) { current.push(...alts[1].split(/[,;]/).map((v) => v.trim()).filter(Boolean)); }
        }
        if (current) answersByIndex.push(current);
      } else {
        expectedRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => answersByIndex.push([l]));
      }
      if (answersByIndex.length && answersByIndex.length !== tokens.length) {
        report.warnings.push(`${base.title} : ${tokens.length} trou(x) détecté(s) mais ${answersByIndex.length} réponse(s) attendue(s) listée(s).`);
      }
      const totalScore = Number(params.score || tokens.length);
      const perBlank = tokens.length ? Math.floor(totalScore / tokens.length) : 1;
      const remainder = tokens.length ? totalScore - perBlank * tokens.length : 0;
      if (remainder) report.warnings.push(`${base.title} : score ${totalScore} non divisible par ${tokens.length} trous — reste ${remainder} affecté au premier trou.`);
      const blanks = tokens.map((token, i) => {
        const variants = answersByIndex[i] || [];
        const merged = [token, ...variants.filter((v) => deburr(v) !== deburr(token))];
        return {
          id: makeId('blank'),
          token,
          answers: merged.join('; '),
          points: perBlank + (i === 0 ? remainder : 0)
        };
      });
      blocks.push({
        ...base, prompt, blanks,
        scoringMode: 'per_blank', maxAttempts: 2, showAnswersAtEnd: true,
        feedbackCorrect: 'Bonne réponse ! Vous avez correctement complété l’idée.',
        feedbackIncorrect: 'Relisez la consigne et vérifiez chaque élément attendu.'
      });
    } else if (type === 'quiz') {
      blocks.push({ ...base, questions: parseQuizQuestions(section) });
    } else if (type === 'case_study') {
      blocks.push({
        ...base,
        caseContext: itemText(section, /^contexte$/),
        scenario: itemText(section, /^cas$|^scenario$/),
        analysisMaterials: itemText(section, /document|support/),
        guidedQuestions: itemText(section, /questions/),
        expectedAnswer: itemText(section, /correction attendue|elements de reponse|reponses attendues/),
        correctionMode: 'self', teacherSubmissionPlanned: true,
        score: Number(params.score || 0)
      });
    } else if (type === 'assignment') {
      blocks.push({
        ...base,
        assignmentPrompt: itemText(section, /^sujet$|^travail demande$/),
        assignmentCorrection: itemText(section, /correction attendue|grille/),
        evaluationCriteria: itemText(section, /criteres/),
        deliverableType: 'text', duePolicy: 'promotion_date',
        correctionMode: 'self', manualValidation: false, teacherSubmissionPlanned: true,
        score: Number(params.score || 0)
      });
    } else if (type === 'checkpoint') {
      blocks.push({
        ...base,
        checkpointGoal: itemText(section, /^contenu$|^objectif/),
        checkpointMode: 'acquis_checklist',
        expectedResult: itemText(section, /conditions pedagogiques|resultat attendu|elements a valider/),
        checkpointItems: [],
        requiresAllChecked: true, isBlockingPrerequisite: true,
        checkpointScore: Number(params.score || 10), xpReward: Number(params.score || 10)
      });
    }
  }
  return blocks;
}

/* ---------------------------------------------------------------------
 * Assemblage du payload (réplique de buildCoursePayload, action 'draft')
 * ------------------------------------------------------------------- */

function convertNote(markdown, sourceName) {
  const sections = parseNoteSegments(markdown);
  const report = { warnings: [], videosToProduce: [], imagesToProduce: [], pdfsToGenerate: [], qualiopiFreeTexts: [], mediaPlanned: [] };

  // La section COURSE INFO est celle qui contient réellement « Titre du cours »
  // (la note commence par un H1 d'en-tête « Cours LMS — … » qui n'en a pas).
  const courseInfo = sections.find((s) => (s.items || []).some((item) => deburr(item.label) === 'titre du cours'))
    || sections.find((s) => /^COURS\b/i.test(s.title))
    || sections[0];
  const objectivesSection = sections.find((s) => /^OBJECTIFS/i.test(s.title));

  const title = itemText(courseInfo, /^titre du cours$/);
  const formationTitle = itemText(courseInfo, /^formation$/);
  const blocFull = itemText(courseInfo, /^bloc partage$/);
  const blocShortMatch = blocFull.match(/^(Bloc\s*\d+)/i);
  const bloc = blocShortMatch ? blocShortMatch[1].replace(/\s+/, ' ') : blocFull;
  if (bloc !== blocFull && blocFull) {
    report.warnings.push(`Bloc partagé raccourci « ${blocFull} » → « ${bloc} » (règle : nom générique ; intitulé long en description/Obsidian). À confirmer contre les blocs existants à l'injection.`);
  }
  const consigneGenerale = itemText(courseInfo, /^consigne generale$/);
  if (consigneGenerale) report.warnings.push('« Consigne générale » (note) n’a pas de champ dédié dans Course Info — conservée dans _meta (reste documentée dans Obsidian/Word).');
  const courseQualiopiFree = itemText(courseInfo, /^preuve qualiopi$/);
  const threshold = parseInt(itemText(courseInfo, /^seuil$/), 10) || 70;

  const objectives = objectivesSection ? itemText(objectivesSection, /^contenu$/) : '';
  const competency = itemText(courseInfo, /^competence ciblee$/);

  const sourceBlocks = parseBlocks(sections, report);
  const normalizedSource = sourceBlocks.map((b) => normalizePedagogicBlockForSave(b));
  const learningBlocks = normalizedSource.map((block, index, blocks) => normalizeLearningBlockForSave(block, index, blocks));
  const totalCourseScore = calculateCourseMaxScore(learningBlocks);
  const chapitres = convertBlocksToLegacyChapters(learningBlocks);

  const quizCount = learningBlocks.filter((b) => b.type === 'quiz').length;
  const fillBlankCount = learningBlocks.filter((b) => b.type === 'fill_blank').length;
  const lessonCount = learningBlocks.filter((b) => b.type === 'lesson').length;
  const estimatedDurationMinutes = learningBlocks.reduce((t, b) => t + toPositiveMinutes(b.durationMinutes), 0);

  // Champs racine — réplique buildCoursePayload(action='draft'), hors champs
  // remplis à l'injection (auteurId, authorName, formations/targets, timestamps).
  const course = {
    titre: title || 'Cours sans titre',
    title: title || 'Cours sans titre',
    bloc,
    blockTitle: bloc,
    actif: false,
    statutValidation: 'draft',
    objectives,
    competency,
    qualiopiEvidence: mapQualiopiEvidence(courseQualiopiFree, ''),
    visibleInProgram: true,
    validationRule: 'score_minimum',
    validationScore: threshold,
    estimatedDurationMinutes,
    maxScore: totalCourseScore,
    totalScore: totalCourseScore,
    totalXp: totalCourseScore,
    schemaVersion: 'lms-course-v2',
    editorVersion: 'course-tools-v1',
    learningBlocks,
    chapitres,
    lessonCount,
    quizCount,
    fillBlankCount,
    resourceCount: learningBlocks.filter((b) => ['resource', 'assignment', 'checkpoint', 'case_study'].includes(b.type)).length,
    lessonType: fillBlankCount || quizCount ? 'mixed' : 'text',
    lmsStatus: 'draft'
  };

  return {
    course,
    _meta: {
      source: sourceName,
      formationTitle,
      blocFull,
      consigneGenerale,
      courseQualiopiFree,
      ...report
    }
  };
}

/* ---------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------- */

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage : node scripts/course-tools/md-to-course-payload.mjs <note.md> [-o sortie.json]');
  process.exit(args.length ? 0 : 1);
}
const inputPath = resolve(args[0]);
const outFlag = args.indexOf('-o');
const outputPath = outFlag >= 0 ? resolve(args[outFlag + 1]) : resolve(dirname(inputPath), `${basename(inputPath, '.md')}.payload.json`);

const markdown = readFileSync(inputPath, 'utf8');
const result = convertNote(markdown, basename(inputPath));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`✔ Payload écrit : ${outputPath}`);
console.log(`  Titre        : ${result.course.title}`);
console.log(`  Blocs        : ${result.course.learningBlocks.length} (leçons ${result.course.lessonCount}, QCM ${result.course.quizCount}, trous ${result.course.fillBlankCount}, autres ${result.course.resourceCount})`);
console.log(`  Score total  : ${result.course.maxScore} pts · Durée : ${result.course.estimatedDurationMinutes} min · Seuil : ${result.course.validationScore}%`);
console.log(`  Bloc partagé : ${result.course.bloc}${result._meta.blocFull !== result.course.bloc ? `  (intitulé long : ${result._meta.blocFull})` : ''}`);
if (result._meta.warnings.length) {
  console.log('  ⚠ Avertissements :');
  result._meta.warnings.forEach((w) => console.log(`    - ${w}`));
}
