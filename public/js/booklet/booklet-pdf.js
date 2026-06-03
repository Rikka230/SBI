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

import { LABELS, PERIOD_FIELDS, STATUS_META, ROLE_TEXTS, periodGuide, escapeHtml as esc, formatDate as fmtDate, buildBookletPdf } from '/js/booklet/booklet-data.js';
import { renderPlanningHtml } from '/js/formation-documents/planning-render.js?v=8.0P.167.302';

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
    const justif = a.justified === true || a.justifie === true
      ? (a.justificatifUrl ? `<a href="${esc(a.justificatifUrl)}">justifiée</a>` : 'justifiée')
      : '<span class="empty">non justifiée</span>';
    const validated = a.validatedBy || a.validatedAt
      ? esc(String(a.validatedBy || 'validée'))
      : '<span class="empty">—</span>';
    return `<tr><td>${period}</td><td>${reason}</td><td>${justif}</td><td>${validated}</td></tr>`;
  }).join('');
  return `<p class="sub">${esc(title)}</p>
    <table class="grid"><thead><tr><th>Période</th><th>Motif</th><th>Justificatif</th><th>Validation</th></tr></thead><tbody>${trs}</tbody></table>`;
}

function renderPlanningAlternance(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    return `<p class="sub"><span class="empty">Aucun planning d'alternance renseigné.</span></p>`;
  }
  const trs = items.map((p) => {
    const start = fmtDate(p.startDate || p.start);
    const end = fmtDate(p.endDate || p.end);
    const dates = end && end !== start ? `${start} → ${end}` : (start || '—');
    const typeLabel = p.type === 'centre' ? 'Centre de formation' : (p.type === 'entreprise' ? 'Structure / entreprise' : esc(String(p.type || '—')));
    return `<tr><td>${esc(String(p.label || '—'))}</td><td>${typeLabel}</td><td>${dates}</td></tr>`;
  }).join('');
  return `<table class="grid"><thead><tr><th>Intitulé</th><th>Lieu</th><th>Période</th></tr></thead><tbody>${trs}</tbody></table>`;
}

// `tocTitle` (optionnel) : pose data-toc="<titre>" sur la section pour le
// sommaire serveur (buildBookletBodyHtml). Sans effet pour l'impression navigateur.
function renderPeriod(period = {}, index = 0, tocTitle = '') {
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

  const guide = periodGuide(index);
  const guideHtml = guide
    ? `<div class="guide"><strong>${esc(guide.title)}</strong><ul>${guide.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>`
    : '';

  const tocAttr = tocTitle ? ` data-toc="${esc(tocTitle)}"` : '';
  return `<section class="period"${tocAttr}>
    <h2>${label}${dates ? ` <span class="sub-inline">${esc(dates)}</span>` : ''} ${statusBadge}</h2>
    ${guideHtml}
    <h3>${esc(LABELS.roles.student)} — ${esc(LABELS.sections.project)}</h3>
    ${studentFields}
    <h3>${esc(LABELS.roles.tutor)}</h3>
    ${tutorFields}
    ${sigs}
  </section>`;
}

// Section « Planning de l'alternance » : priorité au planning réel issu de
// « Documents de formation » (options.planningModel / planningUploadedUrl),
// repli sur la liste manuelle booklet.planningAlternance.
function renderBookletPlanningSection(booklet = {}, options = {}) {
  // Dans le livret on allège : on masque les placeholders « Cours futur ».
  const planningMeta = {
    title: options.planningTitle || '',
    promotionName: options.planningPromotionName || '',
    hidePlaceholders: true
  };
  if (options.planningModel && Array.isArray(options.planningModel.rows) && options.planningModel.rows.length) {
    return renderPlanningHtml(options.planningModel, planningMeta);
  }
  if (options.planningUploadedUrl) {
    const label = esc(options.planningTitle || 'Planning de l\'alternance');
    return `<p class="sub">${label} : <a href="${esc(options.planningUploadedUrl)}">Voir le planning (PDF)</a></p>`;
  }
  // Modèle fourni mais vide (cursus sans éléments planifiés) : message explicite.
  if (options.planningModel) {
    return renderPlanningHtml(options.planningModel, planningMeta);
  }
  return renderPlanningAlternance(booklet.planningAlternance);
}

/* =====================================================================
 * CSS partagé entre l'impression navigateur et le rendu serveur (paged.js).
 * Extrait pour ne pas dupliquer la charte entre buildBookletPrintHtml et
 * buildBookletBodyHtml.
 * ===================================================================== */
const BOOKLET_PDF_STYLE = `
    /* =========================================================
       Charte SBI (alignée sur le template email) :
       police Arial, accent bleu #0051ff, bandeau sombre #050913.
       ========================================================= */
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{font-family:Arial,Helvetica,sans-serif;color:#253047;background:#f3f5f9;padding:32px;position:relative;}
    h1{font-size:22px;margin:0 0 4px;color:#101828;}
    .sub{color:#667085;font-size:13px;margin:0 0 14px;}
    .sub-inline{color:#667085;font-size:13px;font-weight:400;}
    .status-line{margin:0 0 20px;font-size:12px;color:#344054;}
    .badge{display:inline-block;color:#fff;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;vertical-align:middle;}
    a{color:#0051ff;}
    section{margin:0 0 22px;}
    h2{font-size:16px;margin:18px 0 10px;color:#101828;border-left:4px solid #0051ff;padding:2px 0 2px 10px;}
    h3{font-size:13px;margin:14px 0 6px;color:#344054;text-transform:uppercase;letter-spacing:.03em;}
    table.grid{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;}
    table.grid th,table.grid td{text-align:left;padding:6px 9px;border:1px solid #dce4f2;vertical-align:top;}
    table.grid th{background:#f7f9fd;color:#0051ff;font-weight:700;width:32%;}
    table.grid td{color:#253047;}
    table.grid.sigs th{width:33%;text-align:center;}
    table.grid.sigs td{text-align:center;}
    .field{margin:0 0 9px;}
    .field-label{font-size:11px;font-weight:700;color:#344054;text-transform:uppercase;letter-spacing:.02em;margin-bottom:2px;}
    .field-value{font-size:12px;border:1px solid #dce4f2;border-radius:8px;padding:6px 9px;background:#f7f9fd;min-height:18px;line-height:1.5;color:#253047;}
    .empty{color:#9ca3af;font-style:italic;}
    /* Table de planning (injectée par planning-render) : cellules bordées + padding,
       sinon les colonnes Type/Intitulé se collent (« ExamenÉvaluation »). */
    table.sbi-fdoc-planning-table{width:100%;border-collapse:collapse;font-size:11px;margin:0 0 10px;}
    table.sbi-fdoc-planning-table th,table.sbi-fdoc-planning-table td{text-align:left;padding:5px 8px;border:1px solid #dce4f2;vertical-align:top;}
    table.sbi-fdoc-planning-table th{background:#f7f9fd;color:#0051ff;font-weight:700;}
    .period{border:1px solid #dce4f2;border-radius:14px;padding:12px 16px;margin-bottom:18px;}
    .period h2{margin-top:0;}
    .guide{background:#f7f9fd;border:1px solid #dce4f2;border-left:4px solid #0051ff;border-radius:8px;padding:8px 12px;margin:6px 0 12px;font-size:11.5px;color:#344054;break-inside:avoid;page-break-inside:avoid;}
    .guide strong{color:#101828;}
    .guide ul{margin:4px 0 0;padding-left:18px;}
    .annex .sub{font-size:12px;line-height:1.6;color:#253047;}

    /* Bandeau d'en-tête de page de garde (clone email) */
    .cover{min-height:calc(100vh - 28mm);display:flex;flex-direction:column;page-break-after:always;break-after:page;}
    .cover-header{background:#050913;border-bottom:4px solid #0051ff;border-radius:14px 14px 0 0;padding:24px 30px;display:flex;align-items:center;gap:18px;}
    .cover-header img.logo{height:48px;width:auto;display:block;border:0;}
    .cover-header .brand-block{display:flex;flex-direction:column;}
    .cover-header img.wordmark{width:200px;max-width:200px;height:auto;display:block;border:0;}
    .cover-tagline{font-size:12px;line-height:18px;color:#8a93a6;font-style:italic;margin-top:8px;}
    .cover-tagline .accent{color:#0051ff;}
    .cover-body{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border:1px solid #dce4f2;border-top:none;border-radius:0 0 14px 14px;background:#fff;padding:28px;}
    .cover-title{font-size:30px;margin:0;color:#101828;border:none;padding:0;}
    .cover-sub{color:#667085;font-size:16px;margin:4px 0 28px;}
    .cover-grid{max-width:520px;}

    .roles{page-break-after:always;break-after:page;}
    .page-break{page-break-before:always;break-before:page;}

    .foot{margin-top:22px;padding-top:12px;border-top:1px solid #dce4f2;color:#667085;font-size:11px;line-height:1.6;}
    .foot .accent{color:#0051ff;}

    .watermark{
      position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
      font-size:74px;font-weight:800;color:rgba(0,81,255,.12);
      letter-spacing:.05em;pointer-events:none;z-index:9999;white-space:nowrap;
    }
    @media print{
      /* Forçage des couleurs : sans cela le bandeau sombre, les badges et les
         cartouches colorés disparaissent (les navigateurs n'impriment pas les
         fonds par défaut). */
      *,html,body,.cover-header,.badge,.field-value,table.grid th,.guide{
        -webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;
      }
      body{padding:0;background:#fff;}
      /* Marges propres + pas d'en-tête/pied navigateur géré par l'utilisateur. */
      @page{margin:14mm;}
      .watermark{position:fixed;}
      /* Titres jamais orphelins en bas de page. */
      h2,h3{break-after:avoid;page-break-after:avoid;}
      /* Sous-blocs courts insécables (sans risquer de faire disparaître une période entière). */
      .sigs,.guide,.field,tr{break-inside:avoid;page-break-inside:avoid;}
      .roles{break-inside:avoid;page-break-inside:avoid;}
      /* Chaque période démarre sur une nouvelle page ; les signatures (dans .period)
         restent avec leur période. Si une période dépasse une page, le navigateur
         coupe quand même (break-inside:avoid n'est respecté que si ça tient). */
      .period{page-break-before:always;break-before:page;break-inside:avoid;page-break-inside:avoid;}
    }`;

/**
 * Fabrique les fragments HTML communs du livret (cover, rôles, sections,
 * périodes, signatures, annexe). `withToc` ajoute les attributs data-toc et le
 * placeholder de sommaire/intro annexes attendus par la Cloud Function.
 */
function buildBookletFragments(booklet = {}, options = {}, { withToc = false } = {}) {
  const st = STATUS_META[booklet.status] || STATUS_META.draft;
  const isLocked = booklet.status === 'locked';
  const title = "Livret d'apprentissage";
  const sub = [booklet.studentName, booklet.formationTitle, booklet.promotionLabel].filter(Boolean).map(esc).join(' — ');
  // Helper de marquage du sommaire (no-op si withToc=false).
  const toc = (label) => (withToc ? ` data-toc="${esc(label)}"` : '');

  // En-tête : identité détaillée
  const identity = booklet.identity || {};
  const idf = LABELS.identityFields;
  const studentFullName = identity.fullName || identity.name
    || [identity.prenom, identity.nom].filter(Boolean).join(' ') || booklet.studentName;
  const headTable = `<table class="grid">
    ${row(idf.studentName, studentFullName)}
    ${row(idf.birthDate, fmtDate(identity.birthDate) || identity.birthDate)}
    ${row(idf.birthPlace, identity.birthPlace)}
    ${row(idf.email, identity.email || booklet.studentEmail)}
    ${row(idf.phone, identity.phone)}
    ${row(idf.address, [identity.address, [identity.postalCode, identity.city].filter(Boolean).join(' ')].filter(Boolean).join(', '))}
    ${row(idf.legalGuardian, identity.legalGuardian)}
  </table>`;

  // Établissement & formation
  const formation = booklet.formation || {};
  const ff = LABELS.formationFields;
  const formationTable = `<table class="grid">
    ${row(ff.establishmentName, formation.establishmentName)}
    ${row(ff.establishmentAddress, formation.establishmentAddress)}
    ${row(ff.director, formation.director)}
    ${row(ff.pedagogicalManager, formation.pedagogicalManager)}
    ${row(ff.handicapReferent, formation.handicapReferent)}
    ${row(ff.formationTitle, formation.formationTitle || booklet.formationName || booklet.formationTitle)}
    ${row(ff.rncp, formation.rncp)}
    ${row(LABELS.fields.contractStart, fmtDate(booklet.contractStart || (booklet.contract || {}).start))}
    ${row(LABELS.fields.contractEnd, fmtDate(booklet.contractEnd || (booklet.contract || {}).end))}
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

  const planningBlock = renderBookletPlanningSection(booklet, options);

  // Page de garde (1ʳᵉ page) + page « Rôles ».
  const coverPage = `<section class="cover">
    <div class="cover-header">
      <img class="logo" src="https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2FLogo_SBI_Tome.png?alt=media" alt="SBI">
      <div class="brand-block">
        <img class="wordmark" src="https://firebasestorage.googleapis.com/v0/b/sbi-web-4f6b4.firebasestorage.app/o/site%2Findex%2Flogos%2Fsbi_brand.png?alt=media" alt="Sport Business Institute">
        <div class="cover-tagline">Apprendre. Progresser. <span class="accent">Performer.</span></div>
      </div>
    </div>
    <div class="cover-body">
      <h1 class="cover-title">Livret d'apprentissage</h1>
      <p class="cover-sub">Animateur E-Sport</p>
      <table class="grid cover-grid">
        ${row(idf.studentName, studentFullName)}
        ${row(ff.formationTitle, formation.formationTitle || booklet.formationName)}
        ${row(LABELS.fields.promotionLabel, booklet.promotionName || booklet.promotionLabel)}
        ${row(LABELS.fields.employerName, booklet.employerName || (booklet.employer || {}).name)}
        ${row(LABELS.fields.tutorName, booklet.tutorName || (booklet.tutor || {}).name)}
        ${row(LABELS.fields.contractStart, fmtDate(booklet.contractStart || (booklet.contract || {}).start))}
        ${row(LABELS.fields.contractEnd, fmtDate(booklet.contractEnd || (booklet.contract || {}).end))}
      </table>
    </div>
  </section>`;

  const actorsRows = ROLE_TEXTS.actors
    .map((a) => `<tr><th>${esc(a.role)}</th><td>${esc(a.text)}</td></tr>`).join('');
  const rolesPage = `<section class="roles">
    <h2${toc("Rôle du livret")}>Rôle du livret</h2>
    <p class="sub">${esc(ROLE_TEXTS.bookletRole)}</p>
    <h2${toc("Rôle de chacun")}>Rôle de chacun</h2>
    <table class="grid">${actorsRows}</table>
  </section>`;

  const periods = Array.isArray(booklet.periods) ? booklet.periods : [];
  const periodsHtml = periods.length
    ? periods.map((p, i) => {
        // Titre de sommaire : vrai label de période s'il existe, sinon « Période N ».
        const tocTitle = withToc ? (String(p && p.label || '').trim() || `Période ${i + 1}`) : '';
        return renderPeriod(p, i, tocTitle);
      }).join('')
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

  // Fiche référentiel/certification générée proprement depuis les données SBI.
  // Le document officiel France Compétences reste joint en annexe (pièce justificative).
  const refRows = `<table class="grid">
    ${row(ff.formationTitle, formation.formationTitle || booklet.formationName || booklet.formationTitle)}
    ${row(ff.rncp, formation.rncp)}
    ${row(ff.certifier, formation.certifier)}
    ${row(ff.rncpLevel, formation.rncpLevel)}
    ${row(ff.rncpDate, formation.rncpDate)}
  </table>`;
  const annex = `<section class="annex"${toc(LABELS.annexTitle)}>
    <h2>${esc(LABELS.annexTitle)}</h2>
    <p class="sub">Fiche certification — synthèse SBI. Le référentiel officiel complet (France Compétences) est joint en annexe du dossier le cas échéant.</p>
    ${refRows}
    <p class="sub" style="margin-top:10px;">Le livret d'apprentissage accompagne le parcours de l'apprenti Animateur E-Sport :
    structuration des objectifs pédagogiques, suivi des situations d'animation et des projets,
    bilans croisés de l'apprenti et du maître d'apprentissage, et validation par le responsable
    pédagogique SBI à chacune des périodes.</p>
  </section>`;

  // Corps « cœur » : tout ce qui suit la page de garde / placeholder de sommaire.
  // Identique pour l'impression navigateur et le rendu serveur (hors marqueurs toc).
  const bodyCore = `
    <h1${toc("Livret d'apprentissage")}>${esc(title)}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    <p class="status-line">Statut : <span class="badge" style="background:${st.color};">${esc(st.label)}</span></p>

    <section${toc(LABELS.sections.identity)}><h2>${esc(LABELS.sections.identity)}</h2>${headTable}</section>
    <section><h2>${esc(LABELS.sections.formation)}</h2>${formationTable}</section>
    <section><h2>${esc(LABELS.sections.employer)}</h2>${employerTable}</section>
    <section><h2>${esc(LABELS.sections.tutor)}</h2>${tutorTable}</section>
    <section${toc(LABELS.sections.planningAlternance)}><h2>${esc(LABELS.sections.planningAlternance)}</h2>${planningBlock}</section>
    <section${toc(LABELS.sections.absencesCfmfs)}><h2>${esc(LABELS.sections.absencesCfmfs)} / ${esc(LABELS.sections.absencesEntreprise)}</h2>${absencesBlock}</section>

    <h2>${esc(LABELS.sections.periods)}</h2>
    ${periodsHtml}

    <section${toc(LABELS.sections.signatures)}><h2>${esc(LABELS.sections.signatures)}</h2>${signaturesBlock}</section>
    ${annex}`;

  const foot = `<p class="foot">Livret d'apprentissage SBI — Animateur E-Sport — édité le ${esc(fmtDate(new Date()))}<br>
    <span class="accent">Sport Business Institute</span> · contact@sbigroup.fr · 04.92.90.90.25 · www.sbigroup.fr</p>`;

  return { title, watermark, coverPage, rolesPage, bodyCore, foot };
}

/**
 * Document HTML complet pour l'IMPRESSION NAVIGATEUR (avec auto-print).
 * Assemble les fragments + la feuille de style partagée.
 */
function buildBookletPrintHtml(booklet = {}, options = {}) {
  const f = buildBookletFragments(booklet, options, { withToc: false });
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(f.title)}</title>
  <style>${BOOKLET_PDF_STYLE}
  </style></head><body>
    ${f.watermark}
    ${f.coverPage}
    ${f.rolesPage}
    ${f.bodyCore}
    ${f.foot}
    <script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
  </body></html>`;
}

/**
 * SBI 8.0P.167.302 — Document HTML COMPLET du CORPS du livret destiné au rendu
 * serveur (Cloud Function buildApprenticeshipBookletPdf, Puppeteer + paged.js).
 *
 * Identique en charte/contenu à buildBookletPrintHtml, MAIS :
 *  · pas de <script> d'auto-impression ;
 *  · <div data-sbi-toc-placeholder></div> juste après la page de garde (la
 *    fonction y injecte le sommaire à pages réelles) ;
 *  · attributs data-toc="<titre exact>" sur chaque section listée au sommaire ;
 *  · <div data-sbi-annex-intro></div> juste avant </body> (intro des annexes).
 *
 * @param {object} booklet  document apprenticeshipBooklets
 * @param {object} [options] Planning réel : { planningModel, planningTitle,
 *   planningPromotionName, planningUploadedUrl }.
 * @returns {string} document HTML complet (<!doctype html>…</html>).
 */
export function buildBookletBodyHtml(booklet = {}, options = {}) {
  const f = buildBookletFragments(booklet, options, { withToc: true });
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(f.title)}</title>
  <style>${BOOKLET_PDF_STYLE}
  </style></head><body>
    ${f.watermark}
    ${f.coverPage}
    <div data-sbi-toc-placeholder></div>
    ${f.rolesPage}
    ${f.bodyCore}
    ${f.foot}
    <div data-sbi-annex-intro></div>
  </body></html>`;
}

/**
 * Ouvre une fenêtre d'impression et y écrit le livret complet, puis auto-print.
 * @param {object} booklet  document apprenticeshipBooklets
 * @param {object} [options] Planning réel (Documents de formation) :
 *   { planningModel, planningTitle, planningPromotionName, planningUploadedUrl }.
 *   Si absent, repli sur booklet.planningAlternance (rétrocompatible).
 */
export function downloadBookletPdf(booklet = {}, options = {}) {
  const id = (booklet && (booklet.id || booklet.studentId)) || 'sbi';
  const win = window.open('', `livret-${id}`, 'width=960,height=720,menubar=yes,toolbar=yes');
  if (!win) {
    alert("La fenêtre du livret a été bloquée par le navigateur. Autorise les pop-ups pour ce site, puis réessaie.");
    return;
  }
  win.document.write('<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Livret…</title></head><body style="font-family:Arial,Helvetica,sans-serif;padding:40px;color:#253047;">Génération du livret d\'apprentissage… un instant.</body></html>');
  win.document.close();
  const html = buildBookletPrintHtml(booklet, options || {});
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * SBI 8.0P.167.302 — Demande au serveur le DOSSIER PDF complet : corps du livret
 * rendu en PDF (sommaire à pages réelles) PUIS fusion des annexes PDF autorisées
 * de la formation. Ouvre l'URL signée renvoyée dans un nouvel onglet.
 *
 * Robuste : en cas d'erreur (function indisponible / timeout / cold start), on
 * retombe sur l'impression navigateur (downloadBookletPdf) pour que l'utilisateur
 * obtienne quand même son livret.
 *
 * @param {object} booklet  document apprenticeshipBooklets
 * @param {object} [options] { withAnnexes=true, planningModel, planningTitle,
 *   planningPromotionName, planningUploadedUrl }.
 * @returns {Promise<{ ok:boolean, fallback?:boolean, missing?:string[] }>}
 */
export async function requestMergedBookletPdf(booklet = {}, options = {}) {
  const withAnnexes = options.withAnnexes !== false;
  const bookletId = booklet.id || booklet.studentId;
  try {
    const bodyHtml = buildBookletBodyHtml(booklet, options);
    const result = await buildBookletPdf({ bookletId, withAnnexes, bodyHtml });
    const data = (result && result.data) || {};
    if (!data.url) throw new Error('Réponse serveur sans URL de PDF.');

    window.open(data.url, '_blank');

    const missing = Array.isArray(data.missing) ? data.missing : [];
    if (missing.length) {
      console.warn('[SBI Livret] Documents non joints au dossier PDF :', missing);
    }
    return { ok: true, missing };
  } catch (error) {
    // Repli impression navigateur : l'utilisateur a quand même le livret (sans
    // les annexes fusionnées, qui exigent le serveur).
    console.warn('[SBI Livret] Génération serveur du dossier PDF indisponible, repli sur l\'impression navigateur :', error?.message || error);
    downloadBookletPdf(booklet, options || {});
    return { ok: false, fallback: true };
  }
}
