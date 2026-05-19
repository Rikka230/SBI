/**
 * SBI 8.0P.167.111
 * Cursus - cadrage Qualiopi.
 *
 * Périmètre :
 * - pré-audit pédagogique au clic ;
 * - aucune écriture Firestore ;
 * - aucun impact DnD / verrou / semaines / trimestres ;
 * - aucun MutationObserver global.
 */

let installed = false;

function getRoot() {
  return document.getElementById('view-cursus');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-qualiopi-audit-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-qualiopi-audit-style';
  style.textContent = `
    .sbi-cursus-qualiopi-panel {
      margin: 0 1.2rem 1rem;
      padding: 1rem;
      border: 1px solid rgba(117, 242, 154, .2);
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(5, 9, 20, .82), rgba(9, 18, 34, .78));
      box-shadow: 0 18px 40px rgba(0, 0, 0, .24), inset 0 0 0 1px rgba(255, 255, 255, .025);
    }

    .sbi-cursus-qualiopi-panel[hidden] {
      display: none !important;
    }

    .sbi-cursus-qualiopi-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .9rem;
    }

    .sbi-cursus-qualiopi-head h3 {
      margin: 0;
      color: #ffffff;
      font-size: 1rem;
    }

    .sbi-cursus-qualiopi-head p {
      margin: .25rem 0 0;
      color: #9fb0cf;
      font-size: .82rem;
      line-height: 1.45;
    }

    .sbi-cursus-qualiopi-close {
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 999px;
      background: rgba(255, 255, 255, .06);
      color: #ffffff;
      width: 2rem;
      height: 2rem;
      cursor: pointer;
    }

    .sbi-cursus-qualiopi-score {
      display: grid;
      grid-template-columns: minmax(180px, .8fr) 1.2fr;
      gap: .9rem;
      margin-bottom: .9rem;
    }

    .sbi-cursus-qualiopi-score-card,
    .sbi-cursus-qualiopi-summary {
      border: 1px solid rgba(255, 255, 255, .1);
      border-radius: 16px;
      background: rgba(255, 255, 255, .045);
      padding: .85rem;
    }

    .sbi-cursus-qualiopi-score-card strong {
      display: block;
      color: #ffffff;
      font-size: 1.8rem;
      line-height: 1;
    }

    .sbi-cursus-qualiopi-score-card span,
    .sbi-cursus-qualiopi-summary span {
      display: block;
      margin-top: .35rem;
      color: #9fb0cf;
      font-size: .78rem;
      line-height: 1.4;
    }

    .sbi-cursus-qualiopi-summary ul {
      display: grid;
      gap: .25rem;
      margin: .4rem 0 0;
      padding: 0 0 0 1rem;
      color: #dfe7ff;
      font-size: .8rem;
      line-height: 1.35;
    }

    .sbi-cursus-qualiopi-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .65rem;
    }

    .sbi-cursus-qualiopi-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: .7rem;
      align-items: flex-start;
      padding: .75rem;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, .09);
      background: rgba(255, 255, 255, .035);
    }

    .sbi-cursus-qualiopi-dot {
      width: .72rem;
      height: .72rem;
      margin-top: .22rem;
      border-radius: 999px;
      background: #75f29a;
      box-shadow: 0 0 18px rgba(117, 242, 154, .45);
    }

    .sbi-cursus-qualiopi-card.is-warning .sbi-cursus-qualiopi-dot {
      background: #ffd166;
      box-shadow: 0 0 18px rgba(255, 209, 102, .35);
    }

    .sbi-cursus-qualiopi-card.is-danger .sbi-cursus-qualiopi-dot {
      background: #ff8fa3;
      box-shadow: 0 0 18px rgba(255, 143, 163, .35);
    }

    .sbi-cursus-qualiopi-card b {
      display: block;
      color: #ffffff;
      font-size: .86rem;
      margin-bottom: .18rem;
    }

    .sbi-cursus-qualiopi-card p {
      margin: 0;
      color: #dfe7ff;
      font-size: .8rem;
      line-height: 1.4;
    }

    .sbi-cursus-qualiopi-foot {
      margin: .9rem 0 0;
      color: #9fb0cf;
      font-size: .76rem;
      line-height: 1.45;
    }

    @media (max-width: 980px) {
      .sbi-cursus-qualiopi-score,
      .sbi-cursus-qualiopi-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function getSelectText(selector) {
  const select = document.querySelector(selector);
  if (!select) return '';
  const option = select.options?.[select.selectedIndex];
  return (option?.textContent || '').trim();
}

function getText(selector) {
  return (document.querySelector(selector)?.textContent || '').trim();
}

function parseWeeksFromPeriod(value = '') {
  const match = String(value).match(/S\d+\s*[→-]\s*S(\d+)/);
  return Number(match?.[1] || 0);
}

function getBadges(block) {
  return Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'))
    .map((badge) => badge.textContent.trim())
    .filter(Boolean);
}

function getBlockTitle(block) {
  return block.querySelector('.sbi-cursus-block-title strong')?.textContent?.trim() || 'Élément sans titre';
}

function collectQualiopiData() {
  const root = getRoot();
  const blocks = Array.from(root?.querySelectorAll('.sbi-cursus-block[data-id]') || []);
  const courseBlocks = blocks.filter((block) => block.classList.contains('type-course') || block.classList.contains('type-placeholder_course'));
  const realCourses = blocks.filter((block) => block.classList.contains('type-course'));
  const placeholders = blocks.filter((block) => block.classList.contains('type-placeholder_course'));
  const assignments = blocks.filter((block) => block.classList.contains('type-assignment'));
  const exams = blocks.filter((block) => block.classList.contains('type-exam') || block.classList.contains('type-evaluation'));
  const lives = blocks.filter((block) => block.classList.contains('type-live_session') || block.classList.contains('type-workshop'));
  const margins = blocks.filter((block) => block.classList.contains('type-buffer_period') || block.classList.contains('type-revision_period') || block.classList.contains('type-catchup_period'));
  const required = blocks.filter((block) => getBadges(block).includes('O'));
  const blocking = blocks.filter((block) => getBadges(block).includes('B'));
  const locked = blocks.filter((block) => getBadges(block).includes('L') || block.dataset.sbiLocked === 'true');
  const shared = blocks.filter((block) => getBadges(block).includes('↗'));
  const period = getText('#cursus-stat-period');
  const duration = getText('#cursus-stat-duration');
  const coherenceTitle = getText('#cursus-coherence-title');
  const coherenceDetail = getText('#cursus-coherence-detail');

  return {
    formation: getSelectText('#cursus-formation-select'),
    template: getSelectText('#cursus-template-select'),
    title: document.getElementById('cursus-title-input')?.value?.trim() || '',
    status: getText('#cursus-active-status'),
    blocks,
    courseBlocks,
    realCourses,
    placeholders,
    assignments,
    exams,
    lives,
    margins,
    required,
    blocking,
    locked,
    shared,
    period,
    duration,
    displayWeeks: parseWeeksFromPeriod(period),
    coherenceTitle,
    coherenceDetail,
    placeholderTitles: placeholders.map(getBlockTitle).slice(0, 5)
  };
}

function makeCheck(level, title, detail, weight = 1) {
  return { level, title, detail, weight };
}

function buildQualiopiChecks(data) {
  const checks = [];
  const hasAssessment = data.assignments.length || data.exams.length;

  checks.push(makeCheck(
    data.formation && data.title ? 'ok' : data.formation || data.title ? 'warning' : 'danger',
    'Identification du cursus',
    data.formation && data.title
      ? `Formation et nom renseignés : ${data.formation} · ${data.title}.`
      : 'Renseigner une formation et un nom de cursus clair avant usage final.',
    2
  ));

  checks.push(makeCheck(
    data.courseBlocks.length ? 'ok' : 'danger',
    'Progression pédagogique',
    data.courseBlocks.length
      ? `${data.courseBlocks.length} bloc(s) cours/cours futur structurent le parcours.`
      : 'Aucun bloc cours détecté : le parcours n’est pas encore exploitable.',
    2
  ));

  checks.push(makeCheck(
    data.realCourses.length ? 'ok' : 'warning',
    'Cours réels reliés',
    data.realCourses.length
      ? `${data.realCourses.length} cours réel(s) relié(s) à la timeline.`
      : 'Aucun cours réel relié : remplacer les cours futurs avant diffusion.',
    2
  ));

  checks.push(makeCheck(
    data.placeholders.length ? 'warning' : 'ok',
    'Cours futurs',
    data.placeholders.length
      ? `${data.placeholders.length} cours futur(s) restent à remplacer : ${data.placeholderTitles.join(', ')}${data.placeholders.length > data.placeholderTitles.length ? '…' : ''}.`
      : 'Aucun cours futur restant.',
    1
  ));

  checks.push(makeCheck(
    hasAssessment ? 'ok' : 'warning',
    'Évaluations / livrables',
    hasAssessment
      ? `${data.assignments.length} devoir(s) et ${data.exams.length} examen(s)/évaluation(s) détectés.`
      : 'Ajouter au moins un devoir, examen ou point d’évaluation pour tracer la validation pédagogique.',
    2
  ));

  checks.push(makeCheck(
    data.lives.length || data.margins.length ? 'ok' : 'warning',
    'Accompagnement / respiration pédagogique',
    data.lives.length || data.margins.length
      ? `${data.lives.length} live(s)/atelier(s) et ${data.margins.length} marge(s)/révision(s) détectés.`
      : 'Aucun live, atelier, marge ou révision détecté. À vérifier selon la pédagogie prévue.',
    1
  ));

  checks.push(makeCheck(
    data.required.length ? 'ok' : 'warning',
    'Obligatoire / optionnel',
    data.required.length
      ? `${data.required.length} élément(s) obligatoire(s) identifiés. Les optionnels restent visibles via le filtre dédié.`
      : 'Aucun élément obligatoire détecté visuellement. Vérifier les champs obligatoire/optionnel.',
    1
  ));

  checks.push(makeCheck(
    data.blocking.length ? 'ok' : 'warning',
    'Éléments bloquants / prérequis',
    data.blocking.length
      ? `${data.blocking.length} élément(s) bloquant(s) ou prérequis détectés.`
      : 'Aucun élément bloquant ou prérequis détecté. Ce n’est pas obligatoire, mais utile pour le suivi.',
    1
  ));

  checks.push(makeCheck(
    data.displayWeeks && data.duration && data.duration !== '0 j' ? 'ok' : 'warning',
    'Durée et période lisibles',
    data.displayWeeks && data.duration
      ? `Période affichée : ${data.period}. Durée effective : ${data.duration}.`
      : 'Période ou durée effective non lisible.',
    2
  ));

  checks.push(makeCheck(
    data.coherenceTitle === 'Planning cohérent' ? 'ok' : 'warning',
    'Cohérence interne',
    data.coherenceDetail || data.coherenceTitle || 'Diagnostic de cohérence non disponible.',
    2
  ));

  checks.push(makeCheck(
    data.locked.length ? 'ok' : 'warning',
    'Verrouillage des points sensibles',
    data.locked.length
      ? `${data.locked.length} élément(s) verrouillé(s). Utile pour figer des jalons sensibles.`
      : 'Aucun élément verrouillé. À vérifier si certains jalons doivent rester fixes.',
    1
  ));

  checks.push(makeCheck(
    'warning',
    'Preuves Qualiopi finales',
    'Ce pré-audit cadre les points pédagogiques. L’export PDF ou registre probant final reste à définir avant audit réel.',
    1
  ));

  return checks;
}

function computeScore(checks) {
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = checks.reduce((sum, check) => {
    if (check.level === 'ok') return sum + check.weight;
    if (check.level === 'warning') return sum + check.weight * 0.45;
    return sum;
  }, 0);
  return Math.max(0, Math.min(100, Math.round((score / Math.max(1, total)) * 100)));
}

function renderQualiopiPanel() {
  const root = getRoot();
  const panel = document.getElementById('cursus-qualiopi-panel');
  if (!root || !panel) return;

  const data = collectQualiopiData();
  const checks = buildQualiopiChecks(data);
  const score = computeScore(checks);
  const warnings = checks.filter((check) => check.level === 'warning').length;
  const dangers = checks.filter((check) => check.level === 'danger').length;

  panel.hidden = false;
  panel.innerHTML = `
    <div class="sbi-cursus-qualiopi-head">
      <div>
        <h3>Pré-audit Qualiopi du cursus</h3>
        <p>Cadrage pédagogique interne avant application aux promotions. Ce panneau ne modifie aucune donnée et ne remplace pas un export probant final.</p>
      </div>
      <button type="button" class="sbi-cursus-qualiopi-close" data-cursus-qualiopi-close aria-label="Fermer">×</button>
    </div>

    <div class="sbi-cursus-qualiopi-score">
      <div class="sbi-cursus-qualiopi-score-card">
        <strong>${score}%</strong>
        <span>Indice de préparation pédagogique interne · ${dangers} alerte(s) forte(s), ${warnings} point(s) à compléter.</span>
      </div>
      <div class="sbi-cursus-qualiopi-summary">
        <span>Résumé du cursus</span>
        <ul>
          <li>${escapeHtml(data.formation || 'Formation non renseignée')} · ${escapeHtml(data.title || 'Nom non renseigné')}</li>
          <li>${data.blocks.length} élément(s), ${data.realCourses.length} cours réel(s), ${data.placeholders.length} cours futur(s)</li>
          <li>${escapeHtml(data.period || 'Période non lisible')} · ${escapeHtml(data.duration || 'Durée non lisible')}</li>
        </ul>
      </div>
    </div>

    <div class="sbi-cursus-qualiopi-grid">
      ${checks.map((check) => `
        <article class="sbi-cursus-qualiopi-card ${check.level === 'danger' ? 'is-danger' : check.level === 'warning' ? 'is-warning' : ''}">
          <span class="sbi-cursus-qualiopi-dot"></span>
          <div>
            <b>${escapeHtml(check.title)}</b>
            <p>${escapeHtml(check.detail)}</p>
          </div>
        </article>
      `).join('')}
    </div>

    <p class="sbi-cursus-qualiopi-foot">
      Prochaine étape produit : définir ce que doit générer une preuve finale, par exemple un export PDF du parcours, un registre d’éléments probants ou une fiche de synthèse pédagogique par promotion.
    </p>
  `;

  panel.querySelector('[data-cursus-qualiopi-close]')?.addEventListener('click', () => {
    panel.hidden = true;
  }, { once: true });

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function bindButton() {
  const button = document.getElementById('cursus-qualiopi-btn');
  if (!button || button.dataset.sbiQualiopiBound === 'true') return;

  button.dataset.sbiQualiopiBound = 'true';
  button.addEventListener('click', renderQualiopiPanel);
}

export function initAdminCursusQualiopiAudit() {
  if (installed) {
    bindButton();
    return;
  }

  installed = true;
  ensureStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindButton, { once: true });
  } else {
    bindButton();
  }

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(bindButton, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(bindButton, 80));
}

initAdminCursusQualiopiAudit();
