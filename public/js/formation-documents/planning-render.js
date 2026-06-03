/**
 * =======================================================================
 * SBI 8.0P.167.284 — Planning de formation généré depuis un cursus
 * -----------------------------------------------------------------------
 * « Convertit en direct » un cursus (curriculumTemplates) en planning :
 * - priorité au planning DATÉ de la promotion (promotions/{id}.coursePlan,
 *   recommendedStartAt/EndAt) ; à défaut, le cursus template (semaines
 *   relatives calculées sur les durées).
 * Fournit le rendu HTML (vue inline) + l'export PDF via fenêtre d'impression
 * (même pattern que le registre Qualiopi, sans dépendance externe).
 * =======================================================================
 */
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { loadFormationDocumentsForFormations } from '/js/formation-documents/formation-docs-data.js?v=8.0P.167.300';

const STRUCTURAL_TYPES = ['real_course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period', 'workshop'];

export function planningTypeLabel(type = 'real_course') {
  switch (type) {
    case 'placeholder_course': return 'Cours futur';
    case 'buffer_period': return 'Marge';
    case 'revision_period': return 'Révisions';
    case 'catchup_period': return 'Rattrapage';
    case 'assignment': return 'Devoir';
    case 'exam': return 'Examen';
    case 'evaluation': return 'Évaluation';
    case 'live_session': return 'Live';
    case 'workshop': return 'Atelier';
    default: return 'Cours';
  }
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fmtDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
  } catch (_) {
    return '';
  }
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Chargement des sources ──────────────────────────────────────────────
export async function loadCursusOptions({ db, formationId = '' } = {}) {
  const snap = await getDocs(collection(db, 'curriculumTemplates'));
  const all = [];
  snap.forEach((d) => all.push({ id: d.id, ...(d.data() || {}) }));
  const fid = String(formationId || '').trim();
  const matches = fid
    ? all.filter((t) => Array.isArray(t.formations) && t.formations.map((x) => String(x)).includes(fid))
    : [];
  const list = (matches.length ? matches : all).map((t) => ({
    id: t.id,
    title: t.titre || t.title || t.name || t.id,
    itemCount: Array.isArray(t.items) ? t.items.length : Number(t.itemCount || 0)
  }));
  return list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr', { sensitivity: 'base' }));
}

export async function loadCursusItems({ db, cursusId = '' } = {}) {
  const id = String(cursusId || '').trim();
  if (!id) return { title: '', items: [], readable: true };
  // SBI 8.0P.167.300 — La collection curriculumTemplates est en lecture ADMIN
  // uniquement (firestore.rules). Côté élève/prof, le getDoc est refusé : on
  // l'absorbe ici (readable:false) pour que resolvePlanningModel puisse tout de
  // même rendre le plan DATÉ de la promotion (lisible par l'élève/prof concerné)
  // plutôt que de planter et d'afficher « Planning indisponible ».
  try {
    const snap = await getDoc(doc(db, 'curriculumTemplates', id));
    if (!snap.exists()) return { title: '', items: [], readable: true };
    const data = snap.data() || {};
    return {
      title: data.titre || data.title || data.name || id,
      items: Array.isArray(data.items) ? data.items : [],
      readable: true
    };
  } catch (error) {
    console.warn('[SBI Planning] cursus non lisible (lecture admin only) :', error?.message || error);
    return { title: '', items: [], readable: false };
  }
}

// Récupère le coursePlan daté de la première promotion (du jeu fourni) qui en a un.
export async function loadDatedCoursePlan({ db, promotionIds = [] } = {}) {
  const ids = [...new Set((promotionIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  for (const pid of ids) {
    try {
      const snap = await getDoc(doc(db, 'promotions', pid));
      if (!snap.exists()) continue;
      const data = snap.data() || {};
      const plan = Array.isArray(data.coursePlan) ? data.coursePlan
        : (Array.isArray(data.activeCoursePlan) ? data.activeCoursePlan : []);
      if (plan.length) {
        return { promotionId: pid, promotionName: data.nom || data.titre || data.name || pid, plan };
      }
    } catch (_) { /* ignore */ }
  }
  return { promotionId: '', promotionName: '', plan: [] };
}

// ── Construction du modèle de lignes ────────────────────────────────────
// Placeholders génériques posés à la création d'un item de cursus : à ignorer
// au profit du vrai nom saisi (sinon un live affiche « Nouveau live »/« Live »).
const GENERIC_ITEM_TITLES = new Set([
  'Live', 'Cours', 'Devoir', 'Examen', 'Évaluation', 'Marge', 'Révisions', 'Rattrapage', 'Atelier', 'Cours futur',
  'Nouveau live', 'Nouveau devoir', 'Nouvel examen', 'Nouvelle évaluation', 'Nouvel atelier',
  'Marge pédagogique', 'Période de révisions', 'Nouvel élément'
]);

function resolvePlanItemTitle(item = {}, type = 'real_course') {
  const label = planningTypeLabel(type);
  const title = String(item.title || '').trim();
  const courseTitle = String(item.courseTitle || '').trim();
  // Cours : le titre du cours fait foi (courseTitle). Autres types (live, devoir,
  // examen…) : le nom éditable est dans title ; on saute les placeholders génériques.
  if (type === 'real_course') return courseTitle || title || label;
  const extra = [item.liveTitle, item.sessionTitle, item.label, item.name].map((v) => String(v || '').trim());
  const pick = [title, courseTitle, ...extra].find((v) => v && !GENERIC_ITEM_TITLES.has(v));
  return pick || title || courseTitle || label;
}

function isGenericTitle(title = '', type = 'real_course') {
  const t = String(title || '').trim();
  return !t || GENERIC_ITEM_TITLES.has(t) || t === planningTypeLabel(type);
}

// Enrichit les noms manquants/génériques d'un plan DATÉ (promotion) à partir des
// items du cursus (qui portent les vrais noms) : cours matchés par courseId,
// autres types (live, devoir…) par ordre d'apparition du même type.
function enrichRowNamesFromCursus(rows = [], cursusItems = []) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(cursusItems) || !cursusItems.length) return;
  const byCourseId = new Map();
  const byTypeQueue = {};
  cursusItems.forEach((it) => {
    const type = String(it.type || it.activityType || 'real_course');
    const title = resolvePlanItemTitle(it, type);
    if (isGenericTitle(title, type)) return;
    if (it.courseId) byCourseId.set(String(it.courseId), title);
    (byTypeQueue[type] = byTypeQueue[type] || []).push(title);
  });
  const cursor = {};
  rows.forEach((r) => {
    if (!isGenericTitle(r.title, r.type)) return;
    if (r.type === 'real_course' && r.courseId && byCourseId.has(String(r.courseId))) {
      r.title = byCourseId.get(String(r.courseId));
      return;
    }
    const queue = byTypeQueue[r.type] || [];
    const i = cursor[r.type] || 0;
    if (queue[i]) {
      r.title = queue[i];
      cursor[r.type] = i + 1;
    }
  });
}

function rowFromPlanItem(item = {}, index = 0) {
  const type = String(item.type || item.activityType || 'real_course');
  return {
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    type,
    typeLabel: planningTypeLabel(type),
    title: resolvePlanItemTitle(item, type),
    courseId: String(item.courseId || ''),
    block: String(item.blockTitle || ''),
    startAt: item.recommendedStartAt || item.plannedStartAt || item.startAt || '',
    endAt: item.recommendedEndAt || item.plannedEndAt || item.endAt || '',
    dueAt: item.dueAt || item.deadlineAt || '',
    durationDays: Math.max(1, num(item.durationDays || item.estimatedDurationDays, type === 'real_course' ? 7 : 1))
  };
}

// Construit { dated, rows[] } : dated=true si on a des vraies dates (promotion).
export function buildPlanningRows({ coursePlan = [], cursusItems = [] } = {}) {
  const source = (Array.isArray(coursePlan) && coursePlan.length) ? coursePlan : cursusItems;
  const dated = (Array.isArray(coursePlan) && coursePlan.length) ? coursePlan.some((it) => it.recommendedStartAt || it.startAt || it.plannedStartAt) : false;
  const rows = (Array.isArray(source) ? source : [])
    .map(rowFromPlanItem)
    .sort((a, b) => a.order - b.order)
    .map((r, i) => ({ ...r, order: i }));

  if (!dated) {
    // Semaines relatives : on accumule les durées des items structurels.
    let dayCursor = 0;
    rows.forEach((r) => {
      if (STRUCTURAL_TYPES.includes(r.type)) {
        const startWeek = Math.floor(dayCursor / 7) + 1;
        const endWeek = Math.floor((dayCursor + r.durationDays - 1) / 7) + 1;
        r.weekLabel = startWeek === endWeek ? `Semaine ${startWeek}` : `Semaines ${startWeek}–${endWeek}`;
        dayCursor += r.durationDays;
      } else {
        r.weekLabel = '';
      }
    });
  }
  return { dated, rows };
}

export async function resolvePlanningModel({ db, cursusId = '', promotionIds = [] } = {}) {
  const dateInfo = await loadDatedCoursePlan({ db, promotionIds });
  // On charge le cursus dès qu'il est connu : il fournit les VRAIS noms,
  // qu'on fusionne sur le plan daté de la promotion (qui fournit les dates).
  const cursus = cursusId ? await loadCursusItems({ db, cursusId }) : { title: '', items: [] };

  if (dateInfo.plan.length) {
    const model = buildPlanningRows({ coursePlan: dateInfo.plan, cursusItems: [] });
    enrichRowNamesFromCursus(model.rows, cursus.items);
    return { ...model, promotionName: dateInfo.promotionName, cursusTitle: cursus.title };
  }

  // Pas de plan daté : cursus template seul (noms + semaines indicatives).
  const model = buildPlanningRows({ coursePlan: [], cursusItems: cursus.items });
  return { ...model, promotionName: dateInfo.promotionName, cursusTitle: cursus.title };
}

// ── Rendu HTML inline ───────────────────────────────────────────────────
export function renderPlanningHtml(model = { dated: false, rows: [] }, meta = {}) {
  const rows = Array.isArray(model.rows) ? model.rows : [];
  if (!rows.length) {
    // SBI 8.0P.167.288 — message explicite : le planning EST bien défini (entrée
    // enregistrée), mais le cursus choisi n'a pas encore d'éléments datés/planifiés.
    const name = meta.cursusTitle || model.cursusTitle || '';
    return `<div class="sbi-fdoc-empty">Planning défini${name ? ` depuis le cursus « ${esc(name)} »` : ''}, mais ce cursus ne contient pas encore d'éléments planifiés (cours, lives, examens…). Ajoute des éléments au cursus (onglet Cursus) pour qu'ils apparaissent ici.</div>`;
  }
  const periodHead = model.dated ? 'Période' : 'Semaine';
  // meta.hidePlaceholders (livret) : on masque les « Cours futur » (placeholder_course)
  // pour alléger le planning, avec un récap du nombre masqué.
  let viewRows = rows;
  let hiddenPlaceholders = 0;
  if (meta.hidePlaceholders) {
    const before = viewRows.length;
    viewRows = viewRows.filter((r) => r.type !== 'placeholder_course');
    hiddenPlaceholders = before - viewRows.length;
  }
  const body = viewRows.map((r) => {
    const period = model.dated
      ? `${esc(fmtDate(r.startAt))}${r.endAt ? ' → ' + esc(fmtDate(r.endAt)) : ''}`
      : esc(r.weekLabel || '');
    const due = r.dueAt ? esc(fmtDate(r.dueAt)) : '';
    return `<tr>
      <td>${period || '—'}</td>
      <td>${esc(r.typeLabel)}</td>
      <td>${esc(r.title)}${r.block ? ` <span style="opacity:.6;">· ${esc(r.block)}</span>` : ''}</td>
      <td>${due || '—'}</td>
    </tr>`;
  }).join('');
  const hiddenNote = hiddenPlaceholders > 0
    ? `<p class="sbi-fdoc-section__hint" style="margin:.35rem 0 0;">+ ${hiddenPlaceholders} cours à venir non détaillé${hiddenPlaceholders > 1 ? 's' : ''} (planning prévisionnel).</p>`
    : '';
  const caption = meta.title ? `<p class="sbi-fdoc-section__hint" style="margin:0 0 .5rem;">${esc(meta.title)}${model.dated && meta.promotionName ? ` — ${esc(meta.promotionName)}` : (!model.dated ? ' — modèle (semaines indicatives)' : '')}</p>` : '';
  return `${caption}
    <div style="overflow:auto;">
      <table class="sbi-fdoc-planning-table" style="width:100%; border-collapse:collapse; font-size:.85rem;">
        <thead><tr>
          <th style="text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--border-color,#e5e7eb);">${periodHead}</th>
          <th style="text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--border-color,#e5e7eb);">Type</th>
          <th style="text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--border-color,#e5e7eb);">Intitulé</th>
          <th style="text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--border-color,#e5e7eb);">Échéance</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>${hiddenNote}`;
}

// ── Export PDF (fenêtre d'impression, identité SBI alignée sur le livret) ──
function buildPlanningPrintHtml(model, meta = {}) {
  const rows = Array.isArray(model.rows) ? model.rows : [];
  const periodHead = model.dated ? 'Période' : 'Semaine';
  const title = esc(meta.title || 'Planning de formation');
  const sub = [meta.formationName, model.dated ? meta.promotionName : 'Modèle (semaines indicatives)'].filter(Boolean).map(esc).join(' — ');
  const trs = rows.map((r) => {
    const period = model.dated
      ? `${esc(fmtDate(r.startAt))}${r.endAt ? ' → ' + esc(fmtDate(r.endAt)) : ''}`
      : esc(r.weekLabel || '');
    const due = r.dueAt ? esc(fmtDate(r.dueAt)) : '';
    return `<tr><td>${period || '—'}</td><td>${esc(r.typeLabel)}</td><td>${esc(r.title)}${r.block ? ` <span class="block">· ${esc(r.block)}</span>` : ''}</td><td>${due || '—'}</td></tr>`;
  }).join('');
  const tableBlock = rows.length
    ? `<table class="grid"><thead><tr><th>${periodHead}</th><th>Type</th><th>Intitulé</th><th>Échéance</th></tr></thead><tbody>${trs}</tbody></table>`
    : `<p class="sub"><span class="empty">Aucun élément planifié pour ce planning.</span></p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    /* =========================================================
       Charte SBI (alignée sur le livret / le template email) :
       police Arial, accent bleu #0051ff, bandeau sombre #050913.
       Forçage des couleurs à l'impression (les navigateurs n'impriment
       pas les fonds par défaut → header sombre/cartouches conservés).
       ========================================================= */
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{font-family:Arial,Helvetica,sans-serif;color:#253047;background:#f3f5f9;padding:32px;}
    h1{font-size:22px;margin:0 0 4px;color:#101828;border:none;padding:0;}
    .sub{color:#667085;font-size:13px;margin:0 0 14px;}
    .empty{color:#9ca3af;font-style:italic;}
    a{color:#0051ff;}

    /* Bandeau d'en-tête (clone livret/email) */
    .cover-header{background:#050913;border-bottom:4px solid #0051ff;border-radius:14px 14px 0 0;padding:24px 30px;display:flex;align-items:center;gap:18px;}
    .cover-header img.logo{height:48px;width:auto;display:block;border:0;}
    .cover-header .brand-block{display:flex;flex-direction:column;}
    .cover-header img.wordmark{width:200px;max-width:200px;height:auto;display:block;border:0;}
    .cover-tagline{font-size:12px;line-height:18px;color:#8a93a6;font-style:italic;margin-top:8px;}
    .cover-tagline .accent{color:#0051ff;}
    .cover-body{border:1px solid #dce4f2;border-top:none;border-radius:0 0 14px 14px;background:#fff;padding:22px 26px;margin:0 0 22px;}
    .cover-title{font-size:24px;margin:0;color:#101828;}
    .cover-sub{color:#667085;font-size:14px;margin:4px 0 0;}

    table.grid{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;}
    table.grid th,table.grid td{text-align:left;padding:6px 9px;border:1px solid #dce4f2;vertical-align:top;}
    table.grid th{background:#f7f9fd;color:#0051ff;font-weight:700;}
    table.grid td{color:#253047;}
    table.grid td .block{opacity:.6;}

    .foot{margin-top:22px;padding-top:12px;border-top:1px solid #dce4f2;color:#667085;font-size:11px;line-height:1.6;}
    .foot .accent{color:#0051ff;}

    @media print{
      body{padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      @page{margin:14mm;}
      .cover-header{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      table.grid th{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      h1{break-after:avoid;page-break-after:avoid;}
      tr{break-inside:avoid;page-break-inside:avoid;}
    }
  </style></head><body>
    <div class="cover-header">
      <img class="logo" src="https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2FLogo_SBI_Tome.png?alt=media" alt="SBI">
      <div class="brand-block">
        <img class="wordmark" src="https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2Fsbi_brand.png?alt=media" alt="Sport Business Institute">
        <div class="cover-tagline">Apprendre. Progresser. <span class="accent">Performer.</span></div>
      </div>
    </div>
    <div class="cover-body">
      <h1 class="cover-title">${title}</h1>
      ${sub ? `<p class="cover-sub">${sub}</p>` : ''}
    </div>
    ${tableBlock}
    <p class="foot">Planning généré depuis le cursus SBI — édité le ${esc(fmtDate(new Date()))}<br>
    <span class="accent">Sport Business Institute</span> · contact@sbigroup.fr · 04.92.90.90.25 · www.sbigroup.fr</p>
    <script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
  </body></html>`;
}

export function downloadPlanningPdf(model, meta = {}) {
  const win = window.open('', `planning-${(meta.id || 'sbi')}`, 'width=920,height=680,menubar=yes,toolbar=yes');
  if (!win) {
    alert('La fenêtre du planning a été bloquée par le navigateur. Autorise les pop-ups pour ce site, puis réessaie.');
    return;
  }
  win.document.write('<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Planning…</title></head><body style="font-family:system-ui,sans-serif;padding:40px;color:#3a4459;">Génération du planning… un instant.</body></html>');
  win.document.close();
  const html = buildPlanningPrintHtml(model, meta);
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── Planning du LIVRET = même source que « Documents de formation » ───────
// Résout, pour un livret donné, le planning réel de sa formation/promotion :
// on lit les documents planning de la formation, on choisit l'entrée ciblée
// sur la promotion du livret (sinon le planning par défaut formation), puis :
//  - source 'cursus'  → on génère le modèle daté/relatif via resolvePlanningModel ;
//  - PDF uploadé      → on renvoie l'URL pour un simple lien « Voir le planning ».
// Retourne null si rien d'exploitable (try/catch global → null en cas d'échec).
export async function resolveBookletPlanningModel({ db, booklet } = {}) {
  try {
    if (!db || !booklet || !booklet.formationId) return null;
    const formationId = String(booklet.formationId || '').trim();
    const promotionId = String(booklet.promotionId || '').trim();
    if (!formationId) return null;

    const docs = await loadFormationDocumentsForFormations({ db, formationIds: [formationId] });
    const plannings = (Array.isArray(docs) ? docs : [])
      .filter((d) => d && String(d.category || '').trim().toLowerCase() === 'planning');
    if (!plannings.length) return null;

    // Entrée ciblée sur la promotion du livret, sinon entrée par défaut (promotionId vide).
    const targeted = promotionId
      ? plannings.find((d) => String(d.promotionId || '').trim() === promotionId)
      : null;
    const fallback = plannings.find((d) => !String(d.promotionId || '').trim());
    const entry = targeted || fallback || null;
    if (!entry) return null;

    const title = entry.title || "Planning de l'alternance";

    if (entry.source === 'cursus' && entry.cursusId) {
      const model = await resolvePlanningModel({
        db,
        cursusId: entry.cursusId,
        promotionIds: [promotionId].filter(Boolean)
      });
      return { model, title, promotionName: '', uploadedUrl: entry.downloadURL || '' };
    }

    // PDF uploadé (sans cursus) : pas de modèle, on transmet l'URL.
    if (entry.downloadURL) {
      return { model: null, title, promotionName: '', uploadedUrl: entry.downloadURL };
    }

    return null;
  } catch (error) {
    console.warn('[SBI Planning livret] résolution impossible :', error?.message || error);
    return null;
  }
}
