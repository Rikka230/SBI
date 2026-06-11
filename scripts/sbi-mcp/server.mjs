#!/usr/bin/env node
/**
 * =======================================================================
 * SBI MCP — accès admin direct au projet Firebase sbi-web-4f6b4
 * -----------------------------------------------------------------------
 * Serveur MCP (stdio) exposant Firestore / Auth / Storage via l'Admin SDK
 * (CONTOURNE les règles de sécurité — réservé au poste de l'admin).
 *
 * AUTHENTIFICATION (jamais committée, hors dépôt) :
 *   1. Clé de compte de service : C:\Users\<user>\.sbi\sbi-admin-sa.json
 *      (Console Firebase → Paramètres → Comptes de service → Générer une clé)
 *   2. À défaut : Application Default Credentials
 *      (`gcloud auth application-default login`)
 *
 * SÉCURITÉ :
 *   - outils d'ÉCRITURE et de SUPPRESSION séparés et explicites ;
 *   - fs_delete refuse les collections (un document à la fois) ;
 *   - les très longues chaînes sont tronquées par défaut (full=true sinon).
 * =======================================================================
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import admin from 'firebase-admin';

const PROJECT_ID = 'sbi-web-4f6b4';
const STORAGE_BUCKET = 'sbi-web-4f6b4.firebasestorage.app';
const SA_KEY_PATH = join(homedir(), '.sbi', 'sbi-admin-sa.json');

let credentialMode = 'adc';
if (existsSync(SA_KEY_PATH)) {
  const serviceAccount = JSON.parse(readFileSync(SA_KEY_PATH, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
  });
  credentialMode = 'service-account';
} else {
  admin.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

/* ----------------------------- Helpers ---------------------------------- */

const MAX_STRING = 1600;

function serialize(value, { full = false, depth = 0 } = {}) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return `⏱ ${value.toDate().toISOString()}`;
  if (value instanceof admin.firestore.GeoPoint) return { lat: value.latitude, lng: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return `→ ${value.path}`;
  if (Buffer.isBuffer(value)) return `<bytes ${value.length}>`;
  if (Array.isArray(value)) return value.map((item) => serialize(item, { full, depth: depth + 1 }));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v, { full, depth: depth + 1 });
    return out;
  }
  if (typeof value === 'string' && !full && value.length > MAX_STRING) {
    return `${value.slice(0, MAX_STRING)}… <tronqué, ${value.length} car. — full=true pour tout>`;
  }
  return value;
}

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(error) {
  return { isError: true, content: [{ type: 'text', text: `Erreur : ${error?.message || error}` }] };
}

/* ------------------- Garde-fou : comptes admin isGod --------------------- */
// RÈGLE ABSOLUE (demande utilisateur 2026-06-11) : interdiction totale de
// toucher aux comptes isGod via ce MCP — aucune écriture/suppression sur leur
// doc users/{uid} (et sous-collections), aucun fichier Storage users/{uid}/**,
// et le champ isGod lui-même n'est JAMAIS modifiable (ni accordé ni retiré).

const godUidCache = new Map(); // uid → boolean (résolu à la demande)

async function isGodUid(uid) {
  if (!uid) return false;
  if (godUidCache.has(uid)) return godUidCache.get(uid);
  let god = false;
  try {
    const snap = await db.doc(`users/${uid}`).get();
    god = snap.exists && snap.data().isGod === true;
  } catch (_) {
    god = true; // doute = interdit
  }
  godUidCache.set(uid, god);
  return god;
}

async function assertNotGodTarget(path, data = null) {
  const segments = String(path || '').split('/').filter(Boolean);
  if (segments[0] === 'users' && segments[1] && await isGodUid(segments[1])) {
    throw new Error('INTERDIT : ce document appartient à un compte admin isGod — toute écriture/suppression via le MCP est bloquée (règle absolue).');
  }
  if (data) {
    const scan = (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'isGod') throw new Error('INTERDIT : le champ isGod ne peut être ni accordé ni retiré via le MCP (règle absolue).');
        if (v && typeof v === 'object' && !Array.isArray(v)) scan(v);
      }
    };
    scan(data);
  }
}

async function assertNotGodStoragePath(path) {
  const match = String(path || '').match(/^users\/([^/]+)\//);
  if (match && await isGodUid(match[1])) {
    throw new Error('INTERDIT : fichier d\'un compte admin isGod — suppression bloquée (règle absolue).');
  }
}

function parseData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('data doit être un objet JSON (champs → valeurs).');
  }
  // Sentinelles pratiques : "__serverTimestamp__" et "__delete__".
  const walk = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v === '__serverTimestamp__') obj[k] = admin.firestore.FieldValue.serverTimestamp();
      else if (v === '__delete__') obj[k] = admin.firestore.FieldValue.delete();
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    }
  };
  walk(data);
  return data;
}

/* ------------------------------ Serveur ---------------------------------- */

const server = new McpServer({ name: 'sbi-admin', version: '1.0.0' });

server.tool(
  'fs_get',
  'Lit un document Firestore (chemin complet, ex. courses/abc123 ou conversations/x/messages/y). Les longues chaînes sont tronquées sauf full=true. fields limite aux champs listés.',
  {
    path: z.string().describe('Chemin du document'),
    full: z.boolean().optional().describe('Ne pas tronquer les longues chaînes'),
    fields: z.array(z.string()).optional().describe('Ne renvoyer que ces champs de premier niveau')
  },
  async ({ path, full = false, fields }) => {
    try {
      const snap = await db.doc(path).get();
      if (!snap.exists) return ok({ path, exists: false });
      let data = snap.data();
      if (fields?.length) {
        data = Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
      }
      return ok({ path, exists: true, data: serialize(data, { full }) });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'fs_query',
  'Requête Firestore sur une collection (ou collection group). where = liste de [champ, opérateur, valeur] (==, !=, <, <=, >, >=, array-contains, array-contains-any, in, not-in). Admin SDK : aucune règle de sécurité ne s\'applique.',
  {
    collection: z.string().describe('Nom/chemin de la collection (ex. courses, promotions, liveScripts)'),
    where: z.array(z.tuple([z.string(), z.string(), z.any()])).optional(),
    orderBy: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    limit: z.number().int().min(1).max(300).optional().describe('Défaut 25'),
    group: z.boolean().optional().describe('true = collection group (sous-collections de ce nom partout)'),
    fields: z.array(z.string()).optional().describe('Ne renvoyer que ces champs par doc'),
    full: z.boolean().optional()
  },
  async ({ collection, where = [], orderBy, direction = 'asc', limit = 25, group = false, fields, full = false }) => {
    try {
      let q = group ? db.collectionGroup(collection) : db.collection(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      if (orderBy) q = q.orderBy(orderBy, direction);
      q = q.limit(limit);
      const snap = await q.get();
      const docs = snap.docs.map((d) => {
        let data = d.data();
        if (fields?.length) data = Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
        return { id: d.id, path: d.ref.path, data: serialize(data, { full }) };
      });
      return ok({ count: docs.length, limit, docs });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'fs_count',
  'Compte les documents d\'une requête (aggregation count, pas de lecture des docs).',
  {
    collection: z.string(),
    where: z.array(z.tuple([z.string(), z.string(), z.any()])).optional(),
    group: z.boolean().optional()
  },
  async ({ collection, where = [], group = false }) => {
    try {
      let q = group ? db.collectionGroup(collection) : db.collection(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      const agg = await q.count().get();
      return ok({ collection, count: agg.data().count });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'fs_collections',
  'Liste les collections racine, ou les sous-collections d\'un document si docPath est fourni.',
  { docPath: z.string().optional() },
  async ({ docPath }) => {
    try {
      const cols = docPath ? await db.doc(docPath).listCollections() : await db.listCollections();
      return ok({ parent: docPath || '(racine)', collections: cols.map((c) => c.id) });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'fs_set',
  'ÉCRITURE Firestore : set avec merge par défaut (merge=false ÉCRASE tout le document). data = objet JSON en chaîne ; valeurs spéciales : "__serverTimestamp__", "__delete__" (supprime le champ).',
  {
    path: z.string().describe('Chemin du document'),
    data: z.string().describe('Objet JSON (en chaîne)'),
    merge: z.boolean().optional().describe('Défaut true')
  },
  async ({ path, data, merge = true }) => {
    try {
      const parsed = parseData(data);
      await assertNotGodTarget(path, parsed);
      await db.doc(path).set(parsed, { merge });
      return ok({ written: path, merge });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'fs_delete',
  'SUPPRESSION d\'UN document Firestore (jamais une collection). Action définitive.',
  { path: z.string() },
  async ({ path }) => {
    try {
      if (!/^([^/]+\/[^/]+)(\/[^/]+\/[^/]+)*$/.test(path)) {
        throw new Error('Chemin de DOCUMENT requis (nombre pair de segments).');
      }
      await assertNotGodTarget(path);
      await db.doc(path).delete();
      return ok({ deleted: path });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'auth_user',
  'Fiche Firebase Auth d\'un utilisateur, par email ou uid (+ doc users/{uid} Firestore).',
  { query: z.string().describe('Email ou uid') },
  async ({ query }) => {
    try {
      const user = query.includes('@')
        ? await admin.auth().getUserByEmail(query)
        : await admin.auth().getUser(query);
      const profileSnap = await db.doc(`users/${user.uid}`).get();
      return ok({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        created: user.metadata.creationTime,
        lastSignIn: user.metadata.lastSignInTime,
        firestoreProfile: profileSnap.exists ? serialize(profileSnap.data()) : null
      });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'auth_list',
  'Liste les comptes Firebase Auth (uid, email, dernière connexion).',
  { limit: z.number().int().min(1).max(500).optional() },
  async ({ limit = 100 }) => {
    try {
      const result = await admin.auth().listUsers(limit);
      return ok({
        count: result.users.length,
        users: result.users.map((u) => ({
          uid: u.uid, email: u.email, displayName: u.displayName || '',
          disabled: u.disabled, lastSignIn: u.metadata.lastSignInTime
        }))
      });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'storage_list',
  'Liste les fichiers Storage sous un préfixe (ex. live-scripts/, courses/abc/).',
  { prefix: z.string(), limit: z.number().int().min(1).max(500).optional() },
  async ({ prefix, limit = 100 }) => {
    try {
      const [files] = await bucket.getFiles({ prefix, maxResults: limit });
      return ok({
        prefix,
        count: files.length,
        files: files.map((f) => ({
          path: f.name,
          size: Number(f.metadata.size || 0),
          contentType: f.metadata.contentType || '',
          updated: f.metadata.updated || ''
        }))
      });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'storage_read',
  'Lit un PETIT fichier Storage (texte renvoyé tel quel, binaire en base64, max 256 Ko).',
  { path: z.string() },
  async ({ path }) => {
    try {
      const file = bucket.file(path);
      const [meta] = await file.getMetadata();
      const size = Number(meta.size || 0);
      if (size > 256 * 1024) throw new Error(`Fichier trop gros (${size} octets > 256 Ko) — utiliser storage_signed_url.`);
      const [buf] = await file.download();
      const isText = /^(text\/|application\/(json|xml|javascript))/.test(meta.contentType || '');
      return ok({ path, contentType: meta.contentType, size, content: isText ? buf.toString('utf8') : buf.toString('base64') });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'storage_signed_url',
  'URL signée de téléchargement (V4) pour un fichier Storage. Nécessite la clé de compte de service (pas l\'ADC).',
  { path: z.string(), minutes: z.number().int().min(1).max(1440).optional() },
  async ({ path, minutes = 15 }) => {
    try {
      const [url] = await bucket.file(path).getSignedUrl({
        version: 'v4', action: 'read', expires: Date.now() + minutes * 60000
      });
      return ok({ path, minutes, url });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'storage_delete',
  'SUPPRESSION d\'un fichier Storage. Action définitive. Les fichiers des comptes isGod sont protégés.',
  { path: z.string() },
  async ({ path }) => {
    try {
      await assertNotGodStoragePath(path);
      await bucket.file(path).delete();
      return ok({ deleted: path });
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'sbi_status',
  'État du serveur MCP SBI : mode d\'authentification, projet, version du site (doc système éventuel).',
  {},
  async () => {
    try {
      const cols = await db.listCollections();
      return ok({
        project: PROJECT_ID,
        bucket: STORAGE_BUCKET,
        credentialMode,
        firestoreOk: true,
        rootCollections: cols.map((c) => c.id)
      });
    } catch (error) {
      return fail(new Error(`Connexion Firestore impossible (${error.message}). Authentification : clé ${SA_KEY_PATH} absente → lancer "gcloud auth application-default login" ou déposer la clé de service.`));
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
