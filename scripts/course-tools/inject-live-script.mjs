#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Script de live : upload du PDF de déroulé (prof)
 * -----------------------------------------------------------------------
 * Fonctionnalité 8.0P.167.357 : un script d'animation (PDF) est attaché à
 * un live du cursus par formation + titre normalisé. Visible UNIQUEMENT
 * des profs/admins dans le scheduler V2 (jamais des élèves).
 *
 *  - Doc Firestore : liveScripts/{formationId}__{slug(titre du live)}
 *  - Fichier       : Storage live-scripts/{scriptId}/{fichier}
 *
 * L'ID est DÉTERMINISTE et calculé comme le front (normalizeText +
 * slugifyScriptKey de live-scheduler-v2-page.js) à partir du TITRE RÉEL
 * du live dans le cursus — l'outil résout ce titre via la CF
 * getLiveSchedulerData (correspondance approchée sur --title).
 *
 * Usage :
 *   node scripts/course-tools/inject-live-script.mjs --list [--formation "…"]
 *   node scripts/course-tools/inject-live-script.mjs --title "<titre du live>" --pdf <fichier.pdf> [--formation "…"] [--yes]
 *   node scripts/course-tools/inject-live-script.mjs --verify "<titre du live>" [--formation "…"]
 * =======================================================================
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import {
  ask, signIn, fsRequest, fromFsDoc, toFsFields, callFunction, uploadFile,
  loadTeacherProfile, resolveFormation, normalizeTitleKey, slugifyScriptKey
} from './sbi-prof-rest.mjs';

const args = process.argv.slice(2);

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : '';
}

const mode = args.includes('--list') ? 'list' : args.includes('--verify') ? 'verify' : args.includes('--title') ? 'inject' : '';
if (!mode || args.includes('--help')) {
  console.log(`Usage :
  node scripts/course-tools/inject-live-script.mjs --list [--formation "Animateur E-Sport"]
  node scripts/course-tools/inject-live-script.mjs --title "<titre du live>" --pdf <fichier.pdf> [--formation "…"] [--yes]
  node scripts/course-tools/inject-live-script.mjs --verify "<titre du live>" [--formation "…"]`);
  process.exit(mode ? 0 : 1);
}

const formationTitle = argValue('--formation') || 'Animateur E-Sport';

const { idToken, uid } = await signIn();
const { profile, authorName } = await loadTeacherProfile(idToken, uid);
console.log(`✔ Connecté : ${authorName} (${profile.role})`);
const formation = await resolveFormation(idToken, profile, formationTitle);
console.log(`✔ Formation : ${formation.titre || formation.title} (${formation.id})`);

/* ------------- Lives du cursus (mêmes sources que le scheduler) ---------- */

function isLiveItem(item = {}) {
  const type = String(item.type || item.kind || item.sourceType || '').toLowerCase();
  return type === 'live_session' || type === 'workshop' || Boolean(item.liveTracking && typeof item.liveTracking === 'object');
}

function isTestItem(item = {}) {
  const values = [item.id, item.itemId, item.sourceItemId, item.liveId, item.type, item.sourceType]
    .map((v) => String(v || '').toLowerCase());
  return item.isTestLive === true || item.testLive === true || values.includes('sbi-live-test') || values.includes('live_test');
}

function itemTitle(item = {}) {
  return String(item.title || item.courseTitle || item.liveTracking?.title || '').trim();
}

function itemSourceId(item = {}) {
  return String(item.sourceItemId || item.id || item.itemId || '').trim();
}

async function collectLives() {
  const data = await callFunction('getLiveSchedulerData', { role: 'teacher', version: 'v2' }, idToken);
  const promotions = (data.promotions || []).filter((p) => String(p.formationId || '') === formation.id);
  const templates = new Map((data.templates || []).map((t) => [String(t.id || ''), t]));
  const lives = new Map(); // titleKey → { title, sourceItemId, origin }
  const push = (item, origin) => {
    if (!item || typeof item !== 'object' || !isLiveItem(item) || isTestItem(item)) return;
    const title = itemTitle(item);
    if (!title) return;
    const key = normalizeTitleKey(title);
    if (!lives.has(key)) lives.set(key, { title, sourceItemId: itemSourceId(item), origin });
  };
  for (const promotion of promotions) {
    const templateId = String(promotion.curriculumTemplateId || promotion.templateId || promotion.cursusTemplateId || promotion.curriculumId || '');
    const template = templates.get(templateId);
    (Array.isArray(template?.items) ? template.items : []).forEach((item) => push(item, 'cursus'));
    (Array.isArray(promotion.coursePlan) ? promotion.coursePlan : []).forEach((item) => push(item, 'coursePlan'));
    (Array.isArray(promotion.livePlanning) ? promotion.livePlanning : []).forEach((item) => push(item, 'livePlanning'));
  }
  return { lives, promotionCount: promotions.length };
}

const { lives, promotionCount } = await collectLives();
console.log(`✔ ${lives.size} live(s) de cursus trouvés sur ${promotionCount} promotion(s) de la formation.`);

if (mode === 'list') {
  for (const { title, sourceItemId, origin } of lives.values()) {
    console.log(`  - « ${title} » (source: ${origin}${sourceItemId ? `, id: ${sourceItemId}` : ''})`);
    console.log(`      scriptId: ${formation.id}__${slugifyScriptKey(title)}`);
  }
  process.exit(0);
}

/* ------------------- Résolution du live par titre ------------------------ */

const wantedTitle = mode === 'verify' ? argValue('--verify') : argValue('--title');
if (!wantedTitle) { console.error(`✗ Titre requis après --${mode === 'verify' ? 'verify' : 'title'}.`); process.exit(1); }
const wantedKey = normalizeTitleKey(wantedTitle);

let match = lives.get(wantedKey) || null;
if (!match) {
  const candidates = [...lives.values()].filter((l) => {
    const key = normalizeTitleKey(l.title);
    return key.includes(wantedKey) || wantedKey.includes(key);
  });
  if (candidates.length === 1) match = candidates[0];
  else if (candidates.length > 1) {
    console.error(`✗ Titre ambigu — ${candidates.length} lives correspondent :`);
    candidates.forEach((c) => console.error(`   - « ${c.title} »`));
    process.exit(1);
  }
}
if (!match) {
  console.warn(`⚠ Aucun live du cursus ne correspond à « ${wantedTitle} ».`);
  if (mode === 'verify') {
    console.warn('  (--list pour voir les titres exacts)');
  } else {
    console.warn('  Le script sera enregistré avec CE titre : il ne s\'affichera dans le scheduler');
    console.warn('  que si un live du cursus porte exactement ce titre (correspondance normalisée).');
    match = { title: wantedTitle.trim(), sourceItemId: '', origin: 'manuel' };
  }
}
if (!match) process.exit(1);

const scriptId = `${formation.id}__${slugifyScriptKey(match.title)}`;
console.log(`✔ Live ciblé : « ${match.title} » (source: ${match.origin})`);
console.log(`  scriptId : ${scriptId}`);

/* ------------------------------ --verify --------------------------------- */

if (mode === 'verify') {
  const doc = await fsRequest(`/liveScripts/${scriptId}`, { idToken });
  const s = fromFsDoc(doc);
  console.log(`fichier   : ${s.fileName} (${s.contentType}, ${Math.round((s.size || 0) / 1024)} Ko)`);
  console.log(`storage   : ${s.storagePath}`);
  console.log(`live      : ${s.liveTitle} | titleKey: ${s.titleKey}${s.sourceItemId ? ` | sourceItemId: ${s.sourceItemId}` : ''}`);
  console.log(`déposé par: ${s.uploadedByEmail || s.uploadedBy} le ${s.uploadedAt || '?'}`);
  process.exit(0);
}

/* ------------------------------ Injection -------------------------------- */

const pdfPath = resolve(argValue('--pdf'));
if (!argValue('--pdf') || !existsSync(pdfPath)) {
  console.error('✗ Fichier PDF requis : --pdf <fichier.pdf>');
  process.exit(1);
}
if (!pdfPath.toLowerCase().endsWith('.pdf')) {
  console.error('✗ Seuls les PDF sont acceptés par cet outil (le scheduler accepte aussi Word/PowerPoint à la main).');
  process.exit(1);
}

// Script existant ? (remplacement)
let previous = null;
try {
  const doc = await fsRequest(`/liveScripts/${scriptId}`, { idToken });
  previous = fromFsDoc(doc);
  console.log(`ℹ Script existant : ${previous.fileName} (sera remplacé).`);
} catch (_) { /* pas de script existant */ }

const autoYes = args.includes('--yes');
const go = autoYes ? 'oui' : await ask(`${previous ? 'REMPLACER' : 'Ajouter'} le script de « ${match.title} » avec ${basename(pdfPath)} ? (oui/non) : `);
if (!/^o(ui)?$/i.test(go)) { console.log('Annulé.'); process.exit(0); }

const safeName = basename(pdfPath).replace(/[^\w.\- ]+/g, '_');
const objectName = `live-scripts/${scriptId}/${safeName}`;
const up = await uploadFile(idToken, uid, objectName, pdfPath, 'application/pdf');
console.log(`✔ PDF uploadé : ${up.storagePath} (${Math.round(up.size / 1024)} Ko)`);

const nowIso = new Date().toISOString();
const payload = {
  formationId: formation.id,
  sourceItemId: match.sourceItemId || '',
  titleKey: normalizeTitleKey(match.title),
  liveTitle: match.title,
  fileName: up.fileName,
  storagePath: up.storagePath,
  contentType: up.contentType,
  size: up.size,
  uploadedBy: uid,
  uploadedByEmail: profile.email || '',
  uploadedAt: { __time__: nowIso },
  updatedAt: { __time__: nowIso }
};
await fsRequest(`/liveScripts/${scriptId}`, {
  method: 'PATCH',
  idToken,
  body: { fields: toFsFields(payload) }
});
console.log(`✔ Doc liveScripts/${scriptId} écrit.`);

if (previous?.storagePath && previous.storagePath !== up.storagePath) {
  try {
    await fetch(`https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/${encodeURIComponent(previous.storagePath)}`, {
      method: 'DELETE',
      headers: { Authorization: `Firebase ${idToken}` }
    });
    console.log(`✔ Ancien fichier supprimé : ${previous.storagePath}`);
  } catch (error) {
    console.warn(`⚠ Ancien fichier non supprimé (${error.message}).`);
  }
}

console.log(`\nTERMINÉ — script visible dans le scheduler V2 (détail du live « ${match.title} »), profs/admins uniquement.
  Vérification : node scripts/course-tools/inject-live-script.mjs --verify "${match.title}"`);
