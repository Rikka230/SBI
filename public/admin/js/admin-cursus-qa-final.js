/**
 * SBI 8.0P.167.110
 * Cursus QA finale légère.
 *
 * Périmètre :
 * - diagnostic manuel au clic ;
 * - aucun MutationObserver ;
 * - aucune modification DnD / verrou / semaines ;
 * - pré-audit lisible avant de passer côté élève.
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
  if (document.getElementById('sbi-cursus-qa-final-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-qa-final-style';
  style.textContent = `
    .sbi-cursus-qa-panel {
      margin: 0 1.2rem 1rem;
      padding: 1rem;
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 18px;
      background: rgba(5, 9, 20, .72);
      box-shadow: 0 18px 40px rgba(0, 0, 0, .22);
    }

    .sbi-cursus-qa-panel[hidden] {
      display: none !important;
    }

    .sbi-cursus-qa-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .9rem;
    }

    .sbi-cursus-qa-head h3 {
      margin: 0;
      color: #ffffff;
      font-size: 1rem;
    }

    .sbi-cursus-qa-head p {
      margin: .25rem 0 0;
      color: #9fb0cf;
      font-size: .82rem;
      line-height: 1.45;
    }

    .sbi-cursus-qa-close {
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 999px;
      background: rgba(255, 255, 255, .06);
      color: #ffffff;
      width: 2rem;
      height: 2rem;
      cursor: pointer;
    }

    .sbi-cursus-qa-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .75rem;
      margin-bottom: .9rem;
    }

    .sbi-cursus-qa-metric {
      border: 1px solid rgba(255, 255, 255, .1);
      border-radius: 14px;
      padding: .75rem;
      background: rgba(255, 255, 255, .045);
    }

    .sbi-cursus-qa-metric strong {
      display: block;
      color: #ffffff;
      font-size: 1.15rem;
      line-height: 1;
    }

    .sbi-cursus-qa-metric span {
      display: block;
      margin-top: .35rem;
      color: #9fb0cf;
      font-size: .75rem;
    }

    .sbi-cursus-qa-list {
      display: grid;
      gap: .5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .sbi-cursus-qa-item {
      display: flex;
      gap: .65rem;
      align-items: flex-start;
      padding: .65rem .75rem;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, .08);
      background: rgba(255, 255, 255, .035);
      color: #dfe7ff;
      font-size: .82rem;
      line-height: 1.35;
    }

    .sbi-cursus-qa-item b {
      color: #ffffff;
    }

    .sbi-cursus-qa-dot {
      flex: 0 0 auto;
      width: .65rem;
      height: .65rem;
      margin-top: .22rem;
      border-radius: 999px;
      background: #75f29a;
      box-shadow: 0 0 18px rgba(117, 242, 154, .45);
    }

    .sbi-cursus-qa-item.is-warning .sbi-cursus-qa-dot {
      background: #ffd166;
      box-shadow: 0 0 18px rgba(255, 209, 102, .35);
    }

    .sbi-cursus-qa-item.is-danger .sbi-cursus-qa-dot {
      background: #ff8fa3;
      box-shadow: 0 0 18px rgba(255, 143, 163, .35);
    }

    .sbi-cursus-qa-foot {
      margin: .9rem 0 0;
      color: #9fb0cf;
      font-size: .76rem;
      line-height: 1.45;
    }

    @media (max-width: 980px) {
      .sbi-cursus-qa-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .sbi-cursus-qa-grid {
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

function isBlockLocked(block) {
  if (!block) return false;
  const badges = Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'));
  return badges.some((badge) => badge.textContent.trim() === 'L') || block.dataset.sbiLocked === 'true';
}

function collectQaData() {
  const root = getRoot();
  const blocks = Array.from(root?.querySelectorAll('.sbi-cursus-block[data-id]') || []);
  const placeholders = blocks.filter((block) => block.classList.contains('type-placeholder_course'));
  const locked = blocks.filter(isBlockLocked);
  const courseBlocks = blocks.filter((block) => block.className.includes('type-course') || block.classList.contains('type-placeholder_course'));
  const assignmentBlocks = blocks.filter((block) => block.classList.contains('type-assignment'));
  const examBlocks = blocks.filter((block) => block.classList.contains('type-exam') || block.classList.contains('type-evaluation'));
  const liveBlocks = blocks.filter((block) => block.classList.contains('type-live_session') || block.classList.contains('type-workshop'));
  const marginBlocks = blocks.filter((block) => block.classList.contains('type-buffer_period') || block.classList.contains('type-revision_period') || block.classList.contains('type-catchup_period'));

  const coherenceTitle = getText('#cursus-coherence-title');
  const coherenceDetail = getText('#cursus-coherence-detail');
  const period = getText('#cursus-stat-period');
  const duration = getText('#cursus-stat-duration');
  const visibleWeeks = Number((period.match(/S\d+\s*[→-]\s*S(\d+)/) || [])[1] || 0);

  return {
    formation: getSelectText('#cursus-formation-select'),
    template: getSelectText('#cursus-template-select'),
    title: document.getElementById('cursus-title-input')?.value?.trim() || '',
    status: getText('#cursus-active-status'),
    blocks,
    placeholders,
    locked,
    courseBlocks,
    assignmentBlocks,
    examBlocks,
    liveBlocks,
    marginBlocks,
    coherenceTitle,
    coherenceDetail,
    period,
    duration,
    visibleWeeks
  };
}

function buildChecks(data) {
  const checks = [];

  checks.push({
    level: data.formation ? 'ok' : 'danger',
    title: 'Formation liée',
    detail: data.formation ? `Formation sélectionnée : ${data.formation}.` : 'Aucune formation sélectionnée.'
  });

  checks.push({
    level: data.title ? 'ok' : 'warning',
    title: 'Nom du cursus',
    detail: data.title ? `Nom renseigné : ${data.title}.` : 'Le nom du cursus est vide ou non explicite.'
  });

  checks.push({
    level: data.blocks.length ? 'ok' : 'danger',
    title: 'Structure pédagogique',
    detail: data.blocks.length
      ? `${data.blocks.length} élément(s) présent(s) sur la timeline.`
      : 'Aucun élément sur la timeline.'
  });

  checks.push({
    level: data.courseBlocks.length ? 'ok' : 'warning',
    title: 'Cours structurants',
    detail: data.courseBlocks.length
      ? `${data.courseBlocks.length} cours ou cours futur dans le cursus.`
      : 'Aucun cours structurant détecté.'
  });

  checks.push({
    level: data.placeholders.length ? 'warning' : 'ok',
    title: 'Cours futurs à remplacer',
    detail: data.placeholders.length
      ? `${data.placeholders.length} bloc(s) "Cours futur" restent à remplacer avant usage final.`
      : 'Aucun bloc "Cours futur" détecté.'
  });

  const hasParallel = data.assignmentBlocks.length || data.examBlocks.length || data.liveBlocks.length;
  checks.push({
    level: hasParallel ? 'ok' : 'warning',
    title: 'Éléments de suivi',
    detail: hasParallel
      ? `${data.assignmentBlocks.length} devoir(s), ${data.examBlocks.length} examen(s), ${data.liveBlocks.length} live(s).`
      : 'Aucun devoir, examen ou live détecté.'
  });

  checks.push({
    level: data.visibleWeeks ? 'ok' : 'warning',
    title: 'Période affichée',
    detail: data.period ? `Timeline affichée : ${data.period}.` : 'Période affichée non lisible.'
  });

  checks.push({
    level: data.duration && data.duration !== '0 j' ? 'ok' : 'warning',
    title: 'Durée effective',
    detail: data.duration ? `Durée effective affichée : ${data.duration}.` : 'Durée effective non lisible.'
  });

  checks.push({
    level: data.coherenceTitle === 'Planning cohérent' ? 'ok' : 'warning',
    title: 'Cohérence interne',
    detail: data.coherenceDetail || data.coherenceTitle || 'Diagnostic de cohérence non disponible.'
  });

  return checks;
}

function renderQaPanel() {
  const root = getRoot();
  const panel = document.getElementById('cursus-qa-panel');
  if (!root || !panel) return;

  const data = collectQaData();
  const checks = buildChecks(data);
  const warnings = checks.filter((check) => check.level === 'warning').length;
  const errors = checks.filter((check) => check.level === 'danger').length;

  panel.hidden = false;
  panel.innerHTML = `
    <div class="sbi-cursus-qa-head">
      <div>
        <h3>Diagnostic Cursus</h3>
        <p>Pré-audit de structure avant application aux promotions et future vérification côté étudiant. Ce panneau ne modifie aucune donnée.</p>
      </div>
      <button type="button" class="sbi-cursus-qa-close" data-cursus-qa-close aria-label="Fermer">×</button>
    </div>

    <div class="sbi-cursus-qa-grid">
      <div class="sbi-cursus-qa-metric"><strong>${data.blocks.length}</strong><span>éléments timeline</span></div>
      <div class="sbi-cursus-qa-metric"><strong>${data.courseBlocks.length}</strong><span>cours / cours futurs</span></div>
      <div class="sbi-cursus-qa-metric"><strong>${data.placeholders.length}</strong><span>cours futurs</span></div>
      <div class="sbi-cursus-qa-metric"><strong>${errors}/${warnings}</strong><span>alertes fortes / points à vérifier</span></div>
    </div>

    <ul class="sbi-cursus-qa-list">
      ${checks.map((check) => `
        <li class="sbi-cursus-qa-item ${check.level === 'danger' ? 'is-danger' : check.level === 'warning' ? 'is-warning' : ''}">
          <span class="sbi-cursus-qa-dot"></span>
          <span><b>${escapeHtml(check.title)}</b><br>${escapeHtml(check.detail)}</span>
        </li>
      `).join('')}
    </ul>

    <p class="sbi-cursus-qa-foot">
      Qualiopi : ce diagnostic est un cadrage de structure. Il ne remplace pas encore un export probant PDF ou un registre d’audit final.
    </p>
  `;

  panel.querySelector('[data-cursus-qa-close]')?.addEventListener('click', () => {
    panel.hidden = true;
  }, { once: true });

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function bindButton() {
  const button = document.getElementById('cursus-qa-btn');
  if (!button || button.dataset.sbiQaBound === 'true') return;

  button.dataset.sbiQaBound = 'true';
  button.addEventListener('click', renderQaPanel);
}

export function initAdminCursusQaFinal() {
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

initAdminCursusQaFinal();
