#!/usr/bin/env node
/**
 * =======================================================================
 * SBI course-tools — Injection d'un payload de cours en BROUILLON (prof)
 * -----------------------------------------------------------------------
 * Crée le document `courses/{id}` au format EXACT de l'éditeur V2, en tant
 * que PROFESSEUR authentifié, puis synchronise la référence de bloc partagé
 * (CF syncCourseBlockReference) — exactement ce que fait l'éditeur au save.
 *
 * SÉCURITÉ (contrat) :
 *  - identifiants JAMAIS en argument/committé/loggé : invite interactive
 *    (saisie du mot de passe masquée) ou variables d'env SBI_PROF_EMAIL /
 *    SBI_PROF_PASSWORD posées par l'utilisateur dans SA session shell.
 *  - création en BROUILLON uniquement (rules : auteurId==uid, actif:false,
 *    statutValidation:'draft'). La soumission admin exige --submit APRÈS
 *    contrôle humain dans l'éditeur réel.
 *  - aucune suppression ici.
 *
 * Implémentation 100 % REST (aucune dépendance npm) :
 *  - Auth      : identitytoolkit accounts:signInWithPassword (clé web publique)
 *  - Firestore : REST v1 (runQuery / createDocument / get)
 *  - Callables : POST https://europe-west1-<project>.cloudfunctions.net/<fn>
 *  - Storage   : upload multipart (métadonnée uploadedBy exigée par les rules)
 *
 * Usage :
 *   node scripts/course-tools/inject-course.mjs <payload.json> [--resource "Titre du bloc=chemin.pdf"]...
 *   node scripts/course-tools/inject-course.mjs --submit <courseId>   (après contrôle éditeur)
 * =======================================================================
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import readline from 'node:readline';

const PROJECT_ID = 'sbi-web-4f6b4';
const API_KEY = 'AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY'; // clé WEB publique (public/js/firebase-init.js)
const STORAGE_BUCKET = 'sbi-web-4f6b4.firebasestorage.app';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FN_BASE = `https://europe-west1-${PROJECT_ID}.cloudfunctions.net`;

/* --------------------------- Auth interactive -------------------------- */

function ask(question, { hidden = false } = {}) {
  return new Promise((resolvePrompt) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (!hidden) {
      rl.question(question, (answer) => { rl.close(); resolvePrompt(answer.trim()); });
      return;
    }
    // Saisie masquée : écho coupé. Comparaisons par charCodeAt (aucun caractère
    // de contrôle littéral dans la source).
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    let value = '';
    const listener = (chunk) => {
      const char = chunk.toString('utf8');
      const code = char.charCodeAt(0);
      if (char === '\r' || char === '\n') {
        stdin.setRawMode?.(wasRaw || false);
        stdin.removeListener('data', listener);
        process.stdout.write('\n');
        rl.close();
        resolvePrompt(value.trim());
      } else if (code === 3) { // Ctrl+C
        process.stdout.write('\n');
        process.exit(130);
      } else if (code === 8 || code === 127) { // Backspace / Delete
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', listener);
  });
}

async function signIn() {
  const email = process.env.SBI_PROF_EMAIL || await ask('Email du compte PROFESSEUR : ');
  const password = process.env.SBI_PROF_PASSWORD || await ask('Mot de passe (saisie masquée) : ', { hidden: true });
  if (!email || !password) { console.error('Identifiants requis.'); process.exit(1); }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) { console.error(`✗ Connexion refusée : ${data?.error?.message || res.status}`); process.exit(1); }
  return { idToken: data.idToken, uid: data.localId };
}

/* ------------------- Sérialisation JSON → Firestore REST ---------------- */

function toFsValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (value && value.__time__) return { timestampValue: value.__time__ };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFsValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFsFields(value) } };
  throw new Error(`Type non sérialisable : ${typeof value}`);
}

function toFsFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[key] = toFsValue(val);
  }
  return fields;
}

function fromFsValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) return fromFsDoc({ fields: v.mapValue.fields || {} });
  return null;
}

function fromFsDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromFsValue(v);
  return out;
}

/* ------------------------------ Firestore ------------------------------ */

async function fsRequest(path, { method = 'GET', body, idToken, query = '' } = {}) {
  const res = await fetch(`${FS_BASE}${path}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firestore ${method} ${path} → ${res.status} : ${data?.error?.message || 'erreur'}`);
  return data;
}

async function runQuery(idToken, structuredQuery) {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ structuredQuery })
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(`Firestore runQuery → ${res.status} : ${data?.error?.message || JSON.stringify(data).slice(0, 200)}`);
  return (Array.isArray(data) ? data : [])
    .filter((row) => row.document)
    .map((row) => ({ id: row.document.name.split('/').pop(), ...fromFsDoc(row.document) }));
}

async function callFunction(name, payload, idToken) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`CF ${name} → ${data?.error?.message || res.status}`);
  return data.result;
}

/* ------------------------------- Storage -------------------------------- */

async function uploadResource(idToken, uid, courseId, blockId, filePath) {
  const fileName = basename(filePath);
  const objectName = `courses/${courseId}/chapters/${blockId}/${fileName}`;
  const contentType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
  const fileBuffer = readFileSync(filePath);
  const boundary = `sbi${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: objectName, contentType, metadata: { uploadedBy: uid } });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), fileBuffer, Buffer.from(tail, 'utf8')]);
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=multipart&name=${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: { Authorization: `Firebase ${idToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Upload ${fileName} → ${res.status} : ${data?.error?.message || 'refusé'}`);
  return { storagePath: objectName, fileName, contentType, size: fileBuffer.length };
}

/* --------------------------------- Main --------------------------------- */

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(`Usage :
  node scripts/course-tools/inject-course.mjs <payload.json> [--resource "Titre du bloc=chemin.pdf"]...
  node scripts/course-tools/inject-course.mjs --submit <courseId>`);
  process.exit(args.length ? 0 : 1);
}

if (args[0] === '--submit') {
  const courseId = args[1];
  if (!courseId) { console.error('courseId requis après --submit.'); process.exit(1); }
  const { idToken } = await signIn();
  const confirm = await ask(`Soumettre le cours ${courseId} à la validation admin ? Le cours sera VERROUILLÉ. (oui/non) : `);
  if (!/^o(ui)?$/i.test(confirm)) { console.log('Annulé.'); process.exit(0); }
  const result = await callFunction('submitCourseForValidation', { courseId }, idToken);
  console.log(`✔ Soumis : ${result?.message || 'cours en attente de validation admin.'}`);
  process.exit(0);
}

const payloadPath = resolve(args[0]);
const resourceArgs = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--resource' && args[i + 1]) {
    const [blockTitle, ...rest] = args[i + 1].split('=');
    resourceArgs.push({ blockTitle: blockTitle.trim(), filePath: resolve(rest.join('=').trim()) });
    i++;
  }
}

const { course, _meta } = JSON.parse(readFileSync(payloadPath, 'utf8'));
console.log(`\nCours à injecter : ${course.title}`);
console.log(`Formation (note) : ${_meta.formationTitle}`);
console.log(`Bloc partagé     : ${course.bloc}${_meta.blocFull && _meta.blocFull !== course.bloc ? ` (intitulé long : ${_meta.blocFull})` : ''}\n`);

const { idToken, uid } = await signIn();

// Profil prof (authorName comme l'éditeur).
const profileDoc = await fsRequest(`/users/${uid}`, { idToken });
const profile = fromFsDoc(profileDoc);
const authorName = `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.email || '';
console.log(`✔ Connecté : ${authorName} (${profile.role})`);
if (!['teacher', 'prof', 'professeur', 'enseignant'].includes(String(profile.role || '').toLowerCase())) {
  console.error('✗ Ce compte n’est pas un compte professeur — injection refusée.');
  process.exit(1);
}

// 1) Formation : résolution par titre parmi les formations du prof.
const formations = await runQuery(idToken, {
  from: [{ collectionId: 'formations' }],
  where: { fieldFilter: { field: { fieldPath: 'profs' }, op: 'ARRAY_CONTAINS', value: { stringValue: uid } } }
});
if (!formations.length) { console.error('✗ Aucune formation où ce prof est membre (formation.profs).'); process.exit(1); }
const wanted = String(_meta.formationTitle || '').toLowerCase();
const formation = formations.find((f) => String(f.titre || f.title || '').toLowerCase().includes(wanted.replace(/^formation\s+/i, '')))
  || (formations.length === 1 ? formations[0] : null);
if (!formation) {
  console.error(`✗ Formation « ${_meta.formationTitle} » introuvable. Formations du prof :`);
  formations.forEach((f) => console.error(`   - ${f.titre || f.title} (${f.id})`));
  process.exit(1);
}
console.log(`✔ Formation : ${formation.titre || formation.title} (${formation.id})`);

// 2) Blocs partagés existants : anti-doublon (réutiliser le nom exact).
let existingBlocks = [];
try {
  existingBlocks = await runQuery(idToken, {
    from: [{ collectionId: 'courseBlocks' }],
    where: { fieldFilter: { field: { fieldPath: 'formationIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: formation.id } } }
  });
} catch (error) {
  console.warn(`⚠ Lecture courseBlocks impossible (${error.message}) — vérification de doublon ignorée.`);
}
if (existingBlocks.length) {
  console.log(`  Blocs partagés existants pour cette formation : ${existingBlocks.map((b) => `« ${b.title || b.blockTitle} »`).join(', ')}`);
  const sameKey = (a, b) => String(a || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '') === String(b || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const match = existingBlocks.find((b) => sameKey(b.title || b.blockTitle, course.bloc));
  if (match && (match.title || match.blockTitle) !== course.bloc) {
    console.log(`  → Réutilisation du nom EXACT existant : « ${match.title || match.blockTitle} » (au lieu de « ${course.bloc} »).`);
    course.bloc = match.title || match.blockTitle;
    course.blockTitle = course.bloc;
  }
}

// 3) Cours homonyme ? (les cours du prof)
try {
  const myCourses = await runQuery(idToken, {
    from: [{ collectionId: 'courses' }],
    where: { fieldFilter: { field: { fieldPath: 'auteurId' }, op: 'EQUAL', value: { stringValue: uid } } }
  });
  const dup = myCourses.find((c) => String(c.title || c.titre || '').toLowerCase() === course.title.toLowerCase());
  if (dup) {
    console.error(`✗ Un cours du même titre existe déjà (${dup.id}, statut ${dup.statutValidation}). Injection refusée (pas de doublon).`);
    process.exit(1);
  }
} catch (error) {
  console.warn(`⚠ Vérification d'homonyme impossible (${error.message}).`);
}

// 4) Confirmation et création (BROUILLON, règles validTeacherCourseWrite).
const go = await ask(`Créer ce cours en BROUILLON (${course.learningBlocks.length} blocs, ${course.maxScore} pts) ? (oui/non) : `);
if (!/^o(ui)?$/i.test(go)) { console.log('Annulé.'); process.exit(0); }

const nowIso = new Date().toISOString();
const docBody = {
  fields: toFsFields({
    ...course,
    auteurId: uid,
    authorName,
    formations: [formation.id],
    formationIds: [formation.id],
    targetFormationIds: [formation.id],
    targetFormationTitles: [formation.titre || formation.title || ''],
    targetTeacherIds: Array.isArray(formation.profs) ? formation.profs : [uid],
    targetStudents: [],
    dateCreation: { __time__: nowIso },
    createdAt: { __time__: nowIso },
    updatedAt: { __time__: nowIso }
  })
};
const created = await fsRequest('/courses', { method: 'POST', body: docBody, idToken });
const courseId = created.name.split('/').pop();
console.log(`✔ Cours créé en brouillon : ${courseId}`);
console.log(`  Éditeur : /teacher/course-editor.html?id=${courseId}`);

// 5) Upload des ressources fournies (--resource "Titre=fichier.pdf").
for (const { blockTitle, filePath } of resourceArgs) {
  const block = course.learningBlocks.find((b) => b.type === 'resource' && b.title.toLowerCase().includes(blockTitle.toLowerCase()));
  if (!block) { console.warn(`⚠ Bloc ressource « ${blockTitle} » introuvable — upload ignoré.`); continue; }
  try {
    const up = await uploadResource(idToken, uid, courseId, block.id, filePath);
    const patchBlock = (b) => (b.id === block.id
      ? { ...b, resourceType: 'pdf', resourceStoragePath: up.storagePath, resourceFileName: up.fileName, resourceMimeType: up.contentType, resourceSize: up.size, resourceOriginalSize: up.size }
      : b);
    course.learningBlocks = course.learningBlocks.map(patchBlock);
    course.chapitres = course.chapitres.map((c) => (c.id === block.id
      ? { ...c, resourceType: 'pdf', resourceStoragePath: up.storagePath, resourceFileName: up.fileName, resourceMimeType: up.contentType, resourceSize: up.size, resourceOriginalSize: up.size }
      : c));
    await fsRequest(`/courses/${courseId}`, {
      method: 'PATCH', idToken,
      query: '?updateMask.fieldPaths=learningBlocks&updateMask.fieldPaths=chapitres&updateMask.fieldPaths=updatedAt',
      body: { fields: toFsFields({ learningBlocks: course.learningBlocks, chapitres: course.chapitres, updatedAt: { __time__: new Date().toISOString() } }) }
    });
    console.log(`✔ Ressource uploadée : ${up.fileName} → ${up.storagePath}`);
  } catch (error) {
    console.warn(`⚠ Upload « ${blockTitle} » échoué : ${error.message} (à faire via l'éditeur).`);
  }
}

// 6) Synchronisation du référentiel de blocs (comme l'éditeur après save).
if (course.bloc) {
  try {
    await callFunction('syncCourseBlockReference', { courseId }, idToken);
    console.log('✔ Référence de bloc partagé synchronisée (syncCourseBlockReference).');
  } catch (error) {
    console.warn(`⚠ syncCourseBlockReference : ${error.message} (non bloquant, re-synchronisé au prochain save éditeur).`);
  }
} else {
  console.log('ℹ Pas de bloc partagé sur ce cours — synchronisation ignorée.');
}

console.log(`\nTERMINÉ — cours en BROUILLON. Étapes suivantes :
  1. Contrôler le rendu dans l'éditeur prof : /teacher/course-editor.html?id=${courseId}
  2. Vérifier blocs / trous / QCM / timers / ressources.
  3. Soumettre SEULEMENT après contrôle : node scripts/course-tools/inject-course.mjs --submit ${courseId}`);
