/**
 * =======================================================================
 * SBI course-tools — Helpers REST partagés (compte professeur)
 * -----------------------------------------------------------------------
 * Extraits de inject-course.mjs (validé en réel) pour les outils
 * inject-assignment.mjs et inject-live-script.mjs. 100 % REST, aucune
 * dépendance npm.
 *
 * SÉCURITÉ (contrat) : identifiants JAMAIS en argument/committés/loggés.
 * Lecture de ~/.sbi/prof.env (local, hors dépôt), sinon variables d'env,
 * sinon invite interactive masquée.
 * =======================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import readline from 'node:readline';

(() => {
  try {
    const envPath = join(homedir(), '.sbi', 'prof.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^(SBI_PROF_EMAIL|SBI_PROF_PASSWORD)\s*=\s*(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch (_) { /* silencieux : on retombera sur l'invite */ }
})();

export const PROJECT_ID = 'sbi-web-4f6b4';
export const API_KEY = 'AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY'; // clé WEB publique (public/js/firebase-init.js)
export const STORAGE_BUCKET = 'sbi-web-4f6b4.firebasestorage.app';
export const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export const FN_BASE = `https://europe-west1-${PROJECT_ID}.cloudfunctions.net`;

/* --------------------------- Auth interactive -------------------------- */

export function ask(question, { hidden = false } = {}) {
  return new Promise((resolvePrompt) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (!hidden) {
      rl.question(question, (answer) => { rl.close(); resolvePrompt(answer.trim()); });
      return;
    }
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

export async function signIn() {
  const email = process.env.SBI_PROF_EMAIL || await ask('Email du compte PROFESSEUR : ');
  const password = process.env.SBI_PROF_PASSWORD || await ask('Mot de passe (saisie masquée) : ', { hidden: true });
  if (!email || !password) { console.error('Identifiants requis.'); process.exit(1); }
  // Clé API restreinte par référent HTTP → présenter le référent du site.
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: `https://${PROJECT_ID}.web.app/`,
      Origin: `https://${PROJECT_ID}.web.app`
    },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) { console.error(`✗ Connexion refusée : ${data?.error?.message || res.status}`); process.exit(1); }
  return { idToken: data.idToken, uid: data.localId };
}

/* ------------------- Sérialisation JSON ↔ Firestore REST ---------------- */

export function toFsValue(value) {
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

export function toFsFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[key] = toFsValue(val);
  }
  return fields;
}

export function fromFsValue(v) {
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

export function fromFsDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromFsValue(v);
  return out;
}

/* ------------------------------ Firestore ------------------------------ */

export async function fsRequest(path, { method = 'GET', body, idToken, query = '' } = {}) {
  const res = await fetch(`${FS_BASE}${path}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firestore ${method} ${path} → ${res.status} : ${data?.error?.message || 'erreur'}`);
  return data;
}

export async function callFunction(name, payload, idToken) {
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

export async function uploadFile(idToken, uid, objectName, filePath, contentTypeOverride = '') {
  const fileName = basename(filePath);
  const contentType = contentTypeOverride
    || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  const fileBuffer = readFileSync(filePath);
  const boundary = `sbi${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: objectName, contentType, metadata: { uploadedBy: uid } });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), fileBuffer, Buffer.from(tail, 'utf8')]);
  // Gotcha confirmé : sans X-Goog-Upload-Protocol: multipart, l'API v0 ne parse
  // pas la métadonnée uploadedBy → 403 des règles Storage.
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?name=${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'X-Goog-Upload-Protocol': 'multipart',
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Upload ${fileName} → ${res.status} : ${data?.error?.message || 'refusé'}`);
  return { storagePath: objectName, fileName, contentType, size: fileBuffer.length };
}

/* ----------------------- Profil + formation du prof ---------------------- */

export async function loadTeacherProfile(idToken, uid) {
  const profileDoc = await fsRequest(`/users/${uid}`, { idToken });
  const profile = fromFsDoc(profileDoc);
  const authorName = `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.email || '';
  if (!['teacher', 'prof', 'professeur', 'enseignant'].includes(String(profile.role || '').toLowerCase())) {
    console.error('✗ Ce compte n’est pas un compte professeur — opération refusée.');
    process.exit(1);
  }
  return { profile, authorName };
}

// Gotcha : pas de runQuery sur formations (règle list avec get() rejetée par
// l'analyseur) → ids depuis users.formationIds puis get doc-par-doc.
export async function resolveFormation(idToken, profile, formationTitle) {
  const profFormationIds = Array.isArray(profile.formationIds) ? profile.formationIds.filter(Boolean) : [];
  const formations = [];
  for (const fid of profFormationIds.slice(0, 25)) {
    try {
      const fdoc = await fsRequest(`/formations/${fid}`, { idToken });
      formations.push({ id: fid, ...fromFsDoc(fdoc) });
    } catch (error) {
      console.warn(`⚠ Formation ${fid} illisible : ${error.message}`);
    }
  }
  if (!formations.length) {
    console.error('✗ Aucune formation lisible depuis le profil du prof (users.formationIds).');
    process.exit(1);
  }
  const wanted = String(formationTitle || '').toLowerCase().replace(/^formation\s+/i, '');
  const formation = formations.find((f) => String(f.titre || f.title || '').toLowerCase().includes(wanted))
    || (formations.length === 1 ? formations[0] : null);
  if (!formation) {
    console.error(`✗ Formation « ${formationTitle} » introuvable. Formations du prof :`);
    formations.forEach((f) => console.error(`   - ${f.titre || f.title} (${f.id})`));
    process.exit(1);
  }
  return formation;
}

/* ------------------- Clés de script de live (= front) -------------------- */
// DOIT rester identique à normalizeText + slugifyScriptKey de
// public/js/live/live-scheduler-v2-page.js (id déterministe partagé).

export function normalizeTitleKey(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function slugifyScriptKey(value = '') {
  return normalizeTitleKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'live';
}
