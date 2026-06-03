/**
 * =======================================================================
 * SBI — Livret d'apprentissage (Animateur E-Sport) : export PDF
 * -----------------------------------------------------------------------
 * Ouvre une fenêtre d'impression et y écrit un HTML complet du livret
 * (identité, formation/contrat, employeur, tuteur, planning/absences, les
 * 6 périodes avec tous leurs champs + signatures + validation, annexe
 * « Référentiel Animateur E-Sport »), puis déclenche l'auto-print.
 *
 * Reproduit EXACTEMENT le pattern de planning-render.js (downloadPlanningPdf) :
 * window.open('', name, ...) → placeholder → réécriture du HTML complet avec
 * <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>.
 * Aucune dépendance externe. Vocabulaire SBI / E-Sport (LABELS).
 * =======================================================================
 */

import { LABELS, PERIOD_FIELDS, STATUS_META, escapeHtml as esc, formatDate as fmtDate } from '/js/booklet/booklet-data.js';

// Champs "tuteur" d'une période (rendus à part, après le bloc apprenti).
const TUTOR_PERIOD_FIELDS = [
  'objectivesEvaluation',
  'tutorPositivePoints',
  'tutorImprovementAxes',
  'tutorReport'
];

function periodLabel(key) {
  return LABELS.period[key] || key;
}

function val(v) {
  const s = String(v ?? '').trim();
  return s ? esc(s).replace(/\n/g, '<br>') : '<span class="empty">—</span>';
}

function fieldBlock(label, value) {
  return `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${val(value)}</div></div>`;
}

function row(label, value) {
  return `<tr><th>${esc(label)}</th><td>${value ? esc(value) : '<span class="empty">—</span>'}</td></tr>`;
}

function renderAbsences(list, title) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    return `<p class="sub">${esc(title)} : <span class="empty">aucune</span></p>`;
  }
  const trs = items.map((a) => {
    const start = fmtDate(a.startDate || a.start || a.date);
    const end = fmtDate(a.endDate || a.end);
    const period = end && end !== start ? `${start} → ${end}` : (start || '—');
    const reason = esc(String(a.reason || a.motif || a.label || '').trim()) || '—';
    return `<tr><td>${period}</td><td>${reason}</td></tr>`;
  }).join('');
  return `<p class="sub">${esc(title)}</p>
    <table class="grid"><thead><tr><th>Période</th><th>Motif</th></tr></thead><tbody>${trs}</tbody></table>`;
}

function renderPeriod(period = {}, index = 0) {
  const label = esc(period.label || `Période ${index + 1}`);
  const dates = [fmtDate(period.startDate), fmtDate(period.endDate)].filter(Boolean).join(' → ');
  const st = STATUS_META[period.status] || null;
  const statusBadge = st
    ? `<span class="badge" style="background:${st.color};">${esc(st.label)}</span>`
    : '';

  // Bloc apprenti : tous les champs période hors champs tuteur.
  const studentFields = PERIOD_FIELDS
    .filter((k) => !TUTOR_PERIOD_FIELDS.includes(k))
    .map((k) => fieldBlock(periodLabel(k), period[k]))
    .join('');

  const tutorFields = TUTOR_PERIOD_FIELDS
    .map((k) => fieldBlock(periodLabel(k), period[k]))
    .join('');

  const sigs = `<table class="grid sigs">
    <tr>
      <th>${esc(periodLabel('studentSignedAt'))}</th>
      <th>${esc(periodLabel('tutorSignedAt'))}</th>
      <th>${esc(periodLabel('sbiValidatedAt'))}</th>
    </tr>
    <tr>
      <td>${period.studentSignedAt ? esc(fmtDate(period.studentSignedAt)) : '<span class="empty">Non signé</span>'}</td>
      <td>${period.tutorSignedAt ? esc(fmtDate(period.tutorSignedAt)) : '<span class="empty">Non signé</span>'}</td>
      <td>${period.sbiValidatedAt ? esc(fmtDate(period.sbiValidatedAt)) : '<span class="empty">Non validé</span>'}</td>
    </tr>
  </table>`;

  return `<section class="period">
    <h2>${label}${dates ? ` <span class="sub-inline">${esc(dates)}</span>` : ''} ${statusBadge}</h2>
    <h3>${esc(LABELS.roles.student)} — ${esc(LABELS.sections.project)}</h3>
    ${studentFields}
    <h3>${esc(LABELS.roles.tutor)}</h3>
    ${tutorFields}
    ${sigs}
  </section>`;
}

function buildBookletPrintHtml(booklet = {}) {
  const st = STATUS_META[booklet.status] || STATUS_META.draft;
  const isLocked = booklet.status === 'locked';
  const title = "Livret d'apprentissage";
  const sub = [booklet.studentName, booklet.formationTitle, booklet.promotionLabel].filter(Boolean).map(esc).join(' — ');

  // En-tête : identité / formation / contrat
  const identity = booklet.identity || {};
  const headTable = `<table class="grid">
    ${row(LABELS.fields.studentName, booklet.studentName || identity.fullName || identity.name)}
    ${row(LABELS.fields.formationTitle, booklet.formationTitle)}
    ${row(LABELS.fields.promotionLabel, booklet.promotionLabel)}
    ${row(LABELS.fields.contractStart, fmtDate(booklet.contractStart))}
    ${row(LABELS.fields.contractEnd, fmtDate(booklet.contractEnd))}
  </table>`;

  const employer = booklet.employer || {};
  const employerTable = `<table class="grid">
    ${row(LABELS.fields.employerName, booklet.employerName || employer.name)}
    ${row('Adresse', employer.address)}
    ${row('Contact', employer.contact || employer.email || employer.phone)}
  </table>`;

  const tutor = booklet.tutor || {};
  const tutorTable = `<table class="grid">
    ${row(LABELS.fields.tutorName, booklet.tutorName || tutor.name || tutor.fullName)}
    ${row('Fonction', tutor.role || tutor.fonction)}
    ${row('Contact', tutor.email || tutor.contact || tutor.phone)}
  </table>`;

  const absences = booklet.absences || {};
  const absencesBlock = `${renderAbsences(absences.cfmfs, LABELS.sections.absencesCfmfs)}
    ${renderAbsences(absences.entreprise, LABELS.sections.absencesEntreprise)}`;

  const periods = Array.isArray(booklet.periods) ? booklet.periods : [];
  const periodsHtml = periods.length
    ? periods.map((p, i) => renderPeriod(p, i)).join('')
    : `<p class="empty">Aucune période enregistrée.</p>`;

  // Signatures / validation globales
  const sg = booklet.signatures || {};
  const signaturesBlock = `<table class="grid">
    ${row(LABELS.roles.student, sg.studentSignedAt ? fmtDate(sg.studentSignedAt) : '')}
    ${row(LABELS.roles.tutor, sg.tutorSignedAt ? fmtDate(sg.tutorSignedAt) : '')}
    ${row(LABELS.roles.sbi, sg.sbiValidatedAt ? fmtDate(sg.sbiValidatedAt) : '')}
  </table>`;

  const watermark = !isLocked
    ? `<div class="watermark">DOCUMENT PROVISOIRE</div>`
    : '';

  const annex = `<section class="annex">
    <h2>${esc(LABELS.annexTitle)}</h2>
    <p class="sub">Le livret d'apprentissage accompagne le parcours de l'apprenti Animateur E-Sport :
    structuration des objectifs pédagogiques, suivi des situations d'animation et des projets,
    bilans croisés de l'apprenti et du maître d'apprentissage, et validation par le responsable
    pédagogique SBI à chacune des périodes.</p>
  </section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(title)}</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1f2937;padding:32px;position:relative;}
    h1{font-size:22px;margin:0 0 4px;}
    .sub{color:#6b7280;font-size:13px;margin:0 0 14px;}
    .sub-inline{color:#6b7280;font-size:13px;font-weight:400;}
    .status-line{margin:0 0 20px;font-size:12px;}
    .badge{display:inline-block;color:#fff;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;vertical-align:middle;}
    section{margin:0 0 22px;break-inside:avoid;}
    h2{font-size:16px;margin:18px 0 8px;border-bottom:2px solid #e5e7eb;padding-bottom:4px;}
    h3{font-size:13px;margin:14px 0 6px;color:#374151;text-transform:uppercase;letter-spacing:.03em;}
    table.grid{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;}
    table.grid th,table.grid td{text-align:left;padding:6px 9px;border:1px solid #e5e7eb;vertical-align:top;}
    table.grid th{background:#f3f4f6;color:#374151;font-weight:600;width:32%;}
    table.grid.sigs th{width:33%;text-align:center;}
    table.grid.sigs td{text-align:center;}
    .field{margin:0 0 9px;}
    .field-label{font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.02em;margin-bottom:2px;}
    .field-value{font-size:12px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 9px;background:#fafafa;min-height:18px;line-height:1.5;}
    .empty{color:#9ca3af;font-style:italic;}
    .period{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:18px;}
    .annex .sub{font-size:12px;line-height:1.6;}
    .foot{margin-top:22px;color:#9ca3af;font-size:11px;}
    .watermark{
      position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
      font-size:74px;font-weight:800;color:rgba(220,38,38,.12);
      letter-spacing:.05em;pointer-events:none;z-index:0;white-space:nowrap;
    }
    @media print{body{padding:0;} @page{margin:16mm;} .watermark{position:fixed;}}
  </style></head><body>
    ${watermark}
    <h1>${esc(title)}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    <p class="status-line">Statut : <span class="badge" style="background:${st.color};">${esc(st.label)}</span></p>

    <section><h2>${esc(LABELS.sections.identity)}</h2>${headTable}</section>
    <section><h2>${esc(LABELS.sections.employer)}</h2>${employerTable}</section>
    <section><h2>${esc(LABELS.sections.tutor)}</h2>${tutorTable}</section>
    <section><h2>${esc(LABELS.sections.absencesCfmfs)} / ${esc(LABELS.sections.absencesEntreprise)}</h2>${absencesBlock}</section>

    <h2>${esc(LABELS.sections.periods)}</h2>
    ${periodsHtml}

    <section><h2>${esc(LABELS.sections.signatures)}</h2>${signaturesBlock}</section>
    ${annex}

    <p class="foot">Livret d'apprentissage SBI — Animateur E-Sport — édité le ${esc(fmtDate(new Date()))}</p>
    <script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
  </body></html>`;
}

/**
 * Ouvre une fenêtre d'impression et y écrit le livret complet, puis auto-print.
 * @param {object} booklet  document apprenticeshipBooklets
 */
export function downloadBookletPdf(booklet = {}) {
  const id = (booklet && (booklet.id || booklet.studentId)) || 'sbi';
  const win = window.open('', `livret-${id}`, 'width=960,height=720,menubar=yes,toolbar=yes');
  if (!win) {
    alert("La fenêtre du livret a été bloquée par le navigateur. Autorise les pop-ups pour ce site, puis réessaie.");
    return;
  }
  win.document.write('<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Livret…</title></head><body style="font-family:system-ui,sans-serif;padding:40px;color:#3a4459;">Génération du livret d\'apprentissage… un instant.</body></html>');
  win.document.close();
  const html = buildBookletPrintHtml(booklet);
  win.document.open();
  win.document.write(html);
  win.document.close();
}
