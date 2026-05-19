/**
 * SBI 8.0P.167.112
 * Cursus - pont éléments probants Qualiopi.
 *
 * Objectif :
 * - rendre le slider "Preuve Qualiopi" réutilisable plus tard ;
 * - utiliser items[].isQualiopiEvidence comme valeur canonique persistée ;
 * - enrichir le panneau Qualiopi avec les éléments marqués ;
 * - aucune écriture Firestore ;
 * - aucun impact DnD / verrou / semaines / trimestres.
 */

import { db } from '/js/firebase-init.js';
import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let styleReady = false;

const VERSION = '8.0P.167.112';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTemplateId() {
  return document.getElementById('cursus-template-select')?.value || '';
}

function getItemTitle(item = {}) {
  return String(item.title || item.courseTitle || item.label || 'Élément sans titre').trim();
}

function getItemTypeLabel(type = '') {
  const map = {
    course: 'Cours',
    placeholder_course: 'Cours futur',
    buffer_period: 'Marge',
    revision_period: 'Révisions',
    catchup_period: 'Rattrapage',
    assignment: 'Devoir',
    exam: 'Examen',
    evaluation: 'Évaluation',
    live_session: 'Live',
    workshop: 'Atelier'
  };
  return map[type] || type || 'Élément';
}

function getItemWeekLabel(item = {}) {
  const start = Math.max(1, Math.floor(Number(item.startOffsetDays || 0) / 7) + 1);
  const span = Math.max(1, Math.ceil(Number(item.estimatedDurationDays || item.durationDays || 1) / 7));
  const end = start + span - 1;
  return start === end ? `S${start}` : `S${start}–S${end}`;
}

function isQualiopiEvidenceItem(item = {}) {
  return Boolean(
    item.isQualiopiEvidence === true ||
    item.qualiopiEvidence === true ||
    item.isEvidenceForQualiopi === true ||
    item.evidenceScope === 'qualiopi' ||
    (Array.isArray(item.evidenceTags) && item.evidenceTags.includes('qualiopi'))
  );
}

function normalizeEvidenceItem(item = {}, index = 0) {
  return {
    id: item.id || item.itemId || `evidence-${index}`,
    title: getItemTitle(item),
    type: item.type || 'item',
    typeLabel: getItemTypeLabel(item.type),
    weekLabel: getItemWeekLabel(item),
    isBlocking: Boolean(item.isBlocking || item.isBlockingPrerequisite),
    isRequired: item.isRequired !== false,
    raw: item
  };
}

async function getActiveEvidenceSummary() {
  const templateId = getTemplateId();
  if (!templateId) {
    return {
      version: VERSION,
      templateId: '',
      templateTitle: '',
      evidenceItems: [],
      count: 0,
      status: 'missing-template'
    };
  }

  const snap = await getDoc(doc(db, 'curriculumTemplates', templateId));
  if (!snap.exists()) {
    return {
      version: VERSION,
      templateId,
      templateTitle: '',
      evidenceItems: [],
      count: 0,
      status: 'template-not-found'
    };
  }

  const data = snap.data() || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const evidenceItems = items
    .filter(isQualiopiEvidenceItem)
    .map(normalizeEvidenceItem);

  return {
    version: VERSION,
    templateId,
    templateTitle: data.title || '',
    evidenceItems,
    count: evidenceItems.length,
    status: 'ok'
  };
}

function ensureStyles() {
  if (styleReady || document.getElementById('sbi-cursus-qualiopi-evidence-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-qualiopi-evidence-style';
  style.textContent = `
    .sbi-cursus-evidence-summary {
      margin-top: .9rem;
      padding: .85rem;
      border: 1px solid rgba(117, 242, 154, .18);
      border-radius: 14px;
      background: rgba(117, 242, 154, .055);
    }

    .sbi-cursus-evidence-summary h4 {
      margin: 0;
      color: #ffffff;
      font-size: .9rem;
    }

    .sbi-cursus-evidence-summary p {
      margin: .35rem 0 0;
      color: #9fb0cf;
      font-size: .78rem;
      line-height: 1.45;
    }

    .sbi-cursus-evidence-list {
      display: grid;
      gap: .4rem;
      margin: .65rem 0 0;
      padding: 0;
      list-style: none;
    }

    .sbi-cursus-evidence-list li {
      padding: .55rem .65rem;
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 11px;
      background: rgba(255, 255, 255, .04);
      color: #dfe7ff;
      font-size: .78rem;
      line-height: 1.35;
    }

    .sbi-cursus-evidence-list b {
      color: #ffffff;
    }
  `;
  document.head.appendChild(style);
  styleReady = true;
}

function renderEvidenceSummary(summary) {
  if (summary.status === 'missing-template') {
    return `
      <div id="sbi-cursus-qualiopi-evidence-summary" class="sbi-cursus-evidence-summary">
        <h4>Éléments probants Qualiopi</h4>
        <p>Le slider <strong>Preuve Qualiopi</strong> est branché sur la valeur <code>items[].isQualiopiEvidence</code>. Sauvegardez le cursus pour exploiter cette valeur dans un futur export ou registre qualité.</p>
      </div>
    `;
  }

  if (summary.status !== 'ok') {
    return `
      <div id="sbi-cursus-qualiopi-evidence-summary" class="sbi-cursus-evidence-summary">
        <h4>Éléments probants Qualiopi</h4>
        <p>Impossible de relire le cursus sauvegardé pour l’instant. La valeur attendue reste <code>items[].isQualiopiEvidence</code>.</p>
      </div>
    `;
  }

  if (!summary.count) {
    return `
      <div id="sbi-cursus-qualiopi-evidence-summary" class="sbi-cursus-evidence-summary">
        <h4>Éléments probants Qualiopi</h4>
        <p>Aucun bloc marqué pour l’instant. Cochez <strong>Preuve Qualiopi</strong> sur les devoirs, examens, jalons ou suivis qui devront ressortir dans le futur dossier qualité.</p>
        <p>Valeur persistée prévue : <code>items[].isQualiopiEvidence</code>.</p>
      </div>
    `;
  }

  return `
    <div id="sbi-cursus-qualiopi-evidence-summary" class="sbi-cursus-evidence-summary">
      <h4>Éléments probants Qualiopi · ${summary.count}</h4>
      <p>Ces blocs sont récupérables plus tard via <code>items[].isQualiopiEvidence</code> pour générer un registre, une synthèse ou un export qualité.</p>
      <ul class="sbi-cursus-evidence-list">
        ${summary.evidenceItems.slice(0, 8).map((item) => `
          <li><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.typeLabel)} · ${escapeHtml(item.weekLabel)}${item.isRequired ? ' · obligatoire' : ' · optionnel'}${item.isBlocking ? ' · bloquant' : ''}</li>
        `).join('')}
      </ul>
      ${summary.count > 8 ? `<p>${summary.count - 8} autre(s) élément(s) probant(s) non affiché(s) dans cet aperçu.</p>` : ''}
    </div>
  `;
}

async function enrichQualiopiPanel() {
  const panel = document.getElementById('cursus-qualiopi-panel');
  if (!panel || panel.hidden) return;

  ensureStyles();

  const previous = document.getElementById('sbi-cursus-qualiopi-evidence-summary');
  if (previous) previous.remove();

  try {
    const summary = await getActiveEvidenceSummary();
    panel.insertAdjacentHTML('beforeend', renderEvidenceSummary(summary));
  } catch (error) {
    console.warn('[SBI Cursus Qualiopi Evidence] Lecture impossible :', error);
    panel.insertAdjacentHTML('beforeend', renderEvidenceSummary({ status: 'error', count: 0, evidenceItems: [] }));
  }
}

function bindButton() {
  const button = document.getElementById('cursus-qualiopi-btn');
  if (!button || button.dataset.sbiQualiopiEvidenceBound === 'true') return;

  button.dataset.sbiQualiopiEvidenceBound = 'true';
  button.addEventListener('click', () => window.setTimeout(enrichQualiopiPanel, 260));
}

export function initAdminCursusQualiopiEvidenceBridge() {
  window.SBI_CURSUS_QUALIOPI_EVIDENCE = {
    version: VERSION,
    getActiveEvidenceSummary
  };

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

initAdminCursusQualiopiEvidenceBridge();
