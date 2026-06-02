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
  if (!id) return { title: '', items: [] };
  const snap = await getDoc(doc(db, 'curriculumTemplates', id));
  if (!snap.exists()) return { title: '', items: [] };
  const data = snap.data() || {};
  return { title: data.titre || data.title || data.name || id, items: Array.isArray(data.items) ? data.items : [] };
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
    return `<div class="sbi-fdoc-empty">Aucun élément de planning à afficher.</div>`;
  }
  const periodHead = model.dated ? 'Période' : 'Semaine';
  const body = rows.map((r) => {
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
    </div>`;
}

// ── Export PDF (fenêtre d'impression, pattern registre Qualiopi) ─────────
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
    return `<tr><td>${period || '—'}</td><td>${esc(r.typeLabel)}</td><td>${esc(r.title)}${r.block ? ` · ${esc(r.block)}` : ''}</td><td>${due || '—'}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;} body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1f2937;padding:32px;}
    h1{font-size:20px;margin:0 0 4px;} .sub{color:#6b7280;margin:0 0 18px;font-size:13px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top;}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#374151;}
    .foot{margin-top:20px;color:#9ca3af;font-size:11px;}
    @media print{body{padding:0;} @page{margin:16mm;}}
  </style></head><body>
    <h1>${title}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    <table><thead><tr><th>${periodHead}</th><th>Type</th><th>Intitulé</th><th>Échéance</th></tr></thead><tbody>${trs}</tbody></table>
    <p class="foot">Planning généré depuis le cursus SBI — ${esc(fmtDate(new Date()))}</p>
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
