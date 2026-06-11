/**
 * SBI 8.0P.167.273 — Formulaire de création/édition de devoir & évaluation.
 * Mutualisé entre l'espace admin et l'espace professeur.
 */

import {
  escapeHtml,
  kindMeta,
  loadPromotionsForFormation,
  loadCursusAssignmentItems,
  suggestedDueAtForCursusItem,
  cursusItemOptionLabel,
  assignmentCallable,
  getCallableMessage
// 8.0P.167.359 : jeton sur l'import relatif (sans lui, une version en cache
// sans les nouveaux exports casse tout le formulaire).
} from './assignment-data.js?v=8.0P.167.360';

function optionTag(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

export function buildAssignmentFormHtml({ assignment = null, formations = [], isAdmin = false } = {}) {
  const a = assignment || {};
  const kind = a.kind === 'evaluation' ? 'evaluation' : 'devoir';
  const mode = a.submissionMode || { file: true, text: false };
  const gradeMax = Number(a.gradeMax) > 0 ? Number(a.gradeMax) : 20;
  const formationOptions = [optionTag('', '— Choisir une formation —', !a.formationId)]
    .concat(formations.map((f) => optionTag(f.id, f.titre, a.formationId === f.id)))
    .join('');

  return `
    <form class="sbi-asg-form" novalidate>
      <div class="sbi-asg-form__row">
        <label class="sbi-asg-radio ${kind === 'devoir' ? 'is-on' : ''}">
          <input type="radio" name="asg-kind" value="devoir" ${kind === 'devoir' ? 'checked' : ''}>
          <span>📝 Devoir<small>Retour qualitatif</small></span>
        </label>
        <label class="sbi-asg-radio ${kind === 'evaluation' ? 'is-on' : ''}">
          <input type="radio" name="asg-kind" value="evaluation" ${kind === 'evaluation' ? 'checked' : ''}>
          <span>🎯 Évaluation<small>Notée / barème</small></span>
        </label>
      </div>

      <div class="sbi-asg-field">
        <label for="asg-title">Titre <span class="sbi-asg-req">*</span></label>
        <input id="asg-title" class="sbi-asg-input" type="text" maxlength="200" value="${escapeHtml(a.title || '')}" placeholder="Ex : Étude de cas — sponsoring d'un club">
      </div>

      <div class="sbi-asg-field">
        <label for="asg-consigne">Consigne</label>
        <textarea id="asg-consigne" class="sbi-asg-textarea" rows="6" maxlength="8000" placeholder="Décris le travail attendu, les critères, les ressources…">${escapeHtml(a.consigne || '')}</textarea>
      </div>

      <div class="sbi-asg-form__grid">
        <div class="sbi-asg-field">
          <label for="asg-formation">Formation <span class="sbi-asg-req">*</span></label>
          <select id="asg-formation" class="sbi-asg-input">${formationOptions}</select>
        </div>
        <div class="sbi-asg-field">
          <label for="asg-promotion">Promotion ciblée <span class="sbi-asg-muted">(optionnel)</span></label>
          <select id="asg-promotion" class="sbi-asg-input" disabled>
            <option value="">Toute la formation</option>
          </select>
        </div>
        <div class="sbi-asg-field">
          <label for="asg-cursus-item">Item du cursus <span class="sbi-asg-muted">(optionnel)</span></label>
          <select id="asg-cursus-item" class="sbi-asg-input" disabled>
            <option value="">Aucun lien cursus</option>
          </select>
        </div>
        <div class="sbi-asg-field">
          <label for="asg-due">Date limite</label>
          <input id="asg-due" class="sbi-asg-input" type="date" value="${escapeHtml(a.dueAt || '')}">
          <small class="sbi-asg-muted" data-asg-due-hint hidden></small>
        </div>
        <div class="sbi-asg-field sbi-asg-grade" ${kind === 'evaluation' ? '' : 'hidden'}>
          <label for="asg-grade-max">Barème (note sur)</label>
          <input id="asg-grade-max" class="sbi-asg-input" type="number" min="1" max="1000" step="1" value="${gradeMax}">
        </div>
      </div>

      <div class="sbi-asg-field">
        <span class="sbi-asg-legend">Mode de dépôt élève</span>
        <div class="sbi-asg-checks">
          <label class="sbi-asg-check"><input type="checkbox" id="asg-mode-file" ${mode.file !== false ? 'checked' : ''}> Fichier (PDF, image, doc…)</label>
          <label class="sbi-asg-check"><input type="checkbox" id="asg-mode-text" ${mode.text === true ? 'checked' : ''}> Réponse texte en ligne</label>
        </div>
      </div>

      <div class="sbi-asg-field">
        <label class="sbi-asg-check"><input type="checkbox" id="asg-qualiopi" ${a.isQualiopiEvidence ? 'checked' : ''}> Preuve Qualiopi (à archiver pour le registre qualité)</label>
      </div>

      <p class="sbi-asg-form__status" data-asg-form-status hidden></p>

      <div class="sbi-asg-form__actions">
        <button type="button" class="sbi-asg-btn ghost" data-asg-cancel>Annuler</button>
        <button type="button" class="sbi-asg-btn" data-asg-save="draft">Enregistrer en brouillon</button>
        <button type="button" class="sbi-asg-btn primary" data-asg-save="${isAdmin ? 'published' : 'pending_validation'}">
          ${isAdmin ? 'Publier' : 'Envoyer en validation'}
        </button>
      </div>
    </form>
  `;
}

export function wireAssignmentForm({ root, db, isAdmin = false, assignment = null, onSaved, onCancel }) {
  const form = root.querySelector('.sbi-asg-form');
  if (!form) return () => {};

  const statusEl = form.querySelector('[data-asg-form-status]');
  const formationSelect = form.querySelector('#asg-formation');
  const promotionSelect = form.querySelector('#asg-promotion');
  const cursusSelect = form.querySelector('#asg-cursus-item');
  const dueInput = form.querySelector('#asg-due');
  const dueHint = form.querySelector('[data-asg-due-hint]');
  const gradeField = form.querySelector('.sbi-asg-grade');
  const editingId = assignment?.id || '';
  // 8.0P.167.358 — items devoir/éval du cursus de la formation choisie.
  let cursusItems = [];

  const setStatus = (message, tone = 'muted') => {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.dataset.tone = tone;
  };

  async function refreshPromotions(selectedPromotionId = '') {
    const formationId = formationSelect.value;
    promotionSelect.innerHTML = '<option value="">Toute la formation</option>';
    promotionSelect.disabled = true;
    if (!formationId) return;
    const promotions = await loadPromotionsForFormation({ db, formationId });
    promotions.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.status && p.status !== 'active' ? `${p.nom} (${p.status})` : p.nom;
      if (p.id === selectedPromotionId) opt.selected = true;
      promotionSelect.appendChild(opt);
    });
    promotionSelect.disabled = false;
  }

  // 8.0P.167.358 — sélecteur « Item du cursus » : liste les items devoir /
  // examen / évaluation du cursus de la formation (uniques, ordre du cursus).
  async function refreshCursusItems(selectedItemId = '') {
    const formationId = formationSelect.value;
    cursusSelect.innerHTML = '<option value="">Aucun lien cursus</option>';
    cursusSelect.disabled = true;
    cursusItems = [];
    if (!formationId) { updateDueSuggestion(); return; }
    cursusItems = await loadCursusAssignmentItems({ db, formationId });
    cursusItems.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.itemId;
      opt.textContent = cursusItemOptionLabel(item);
      if (item.itemId === selectedItemId) opt.selected = true;
      cursusSelect.appendChild(opt);
    });
    cursusSelect.disabled = !cursusItems.length;
    if (!cursusItems.length) {
      cursusSelect.innerHTML = '<option value="">Aucun item devoir/éval dans le cursus</option>';
    }
    updateDueSuggestion();
  }

  // Date limite proposée depuis le planning du cursus (promotion ciblée de
  // préférence). Ne remplit le champ que s'il est vide ; sinon, simple indice.
  function updateDueSuggestion() {
    const item = cursusItems.find((c) => c.itemId === cursusSelect.value) || null;
    const suggested = item ? suggestedDueAtForCursusItem(item, promotionSelect.value || '') : '';
    if (dueHint) {
      dueHint.hidden = !suggested;
      dueHint.textContent = suggested ? `Planning du cursus : échéance prévue le ${suggested.split('-').reverse().join('/')}` : '';
    }
    if (suggested && dueInput && !dueInput.value) dueInput.value = suggested;
  }

  function onKindChange(event) {
    const kind = event.target.value;
    form.querySelectorAll('.sbi-asg-radio').forEach((label) => {
      label.classList.toggle('is-on', label.querySelector('input')?.checked);
    });
    if (gradeField) gradeField.hidden = kind !== 'evaluation';
  }

  function collect(status) {
    const kind = form.querySelector('input[name="asg-kind"]:checked')?.value === 'evaluation' ? 'evaluation' : 'devoir';
    const payload = {
      assignmentId: editingId || undefined,
      kind,
      title: form.querySelector('#asg-title').value.trim(),
      consigne: form.querySelector('#asg-consigne').value.trim(),
      formationId: formationSelect.value,
      promotionId: promotionSelect.value || '',
      dueAt: form.querySelector('#asg-due').value || '',
      submissionMode: {
        file: form.querySelector('#asg-mode-file').checked,
        text: form.querySelector('#asg-mode-text').checked
      },
      isQualiopiEvidence: form.querySelector('#asg-qualiopi').checked,
      cursusItemId: cursusSelect?.value || '',
      status
    };
    if (kind === 'evaluation') {
      payload.gradeMax = Number(form.querySelector('#asg-grade-max').value) || 20;
    }
    return payload;
  }

  async function onSave(event) {
    const status = event.currentTarget.dataset.asgSave;
    const payload = collect(status);

    if (!payload.title) { setStatus('Le titre est obligatoire.', 'error'); return; }
    if (!payload.formationId) { setStatus('Choisis une formation.', 'error'); return; }
    if (!payload.submissionMode.file && !payload.submissionMode.text) {
      setStatus('Active au moins un mode de dépôt (fichier ou texte).', 'error');
      return;
    }

    const buttons = form.querySelectorAll('[data-asg-save], [data-asg-cancel]');
    buttons.forEach((b) => { b.disabled = true; });
    setStatus('Enregistrement…', 'muted');

    try {
      const result = await assignmentCallable('createOrUpdateAssignment')(payload);
      setStatus('Enregistré.', 'success');
      onSaved?.(result?.data || {});
    } catch (error) {
      console.error('[SBI Assignments] enregistrement impossible :', error);
      setStatus(getCallableMessage(error, "Enregistrement impossible."), 'error');
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  const kindInputs = Array.from(form.querySelectorAll('input[name="asg-kind"]'));
  kindInputs.forEach((input) => input.addEventListener('change', onKindChange));
  formationSelect.addEventListener('change', () => { refreshPromotions(''); refreshCursusItems(''); });
  promotionSelect.addEventListener('change', updateDueSuggestion);
  cursusSelect?.addEventListener('change', updateDueSuggestion);
  const saveButtons = Array.from(form.querySelectorAll('[data-asg-save]'));
  saveButtons.forEach((b) => b.addEventListener('click', onSave));
  const cancelBtn = form.querySelector('[data-asg-cancel]');
  cancelBtn?.addEventListener('click', () => onCancel?.());

  // Pré-remplissage des promotions + items cursus si on édite un devoir lié.
  if (formationSelect.value) {
    refreshPromotions(assignment?.promotionId || '');
    refreshCursusItems(assignment?.cursusItemId || '');
  }

  return () => {
    kindInputs.forEach((input) => input.removeEventListener('change', onKindChange));
    saveButtons.forEach((b) => b.removeEventListener('click', onSave));
  };
}
