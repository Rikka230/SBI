import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { app } from '/js/firebase-init.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminSetStudentTimerBypassCallable = httpsCallable(functionsInstance, 'adminSetStudentTimerBypass');

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStudentName(data = {}) {
  return `${data.prenom || ''} ${data.nom || ''}`.trim() || data.email || 'cet eleve';
}

export function renderGodTimerBypassPanel({ uid, data = {}, context = {}, reloadProfile } = {}) {
  const loggedIn = context.loggedInUserData || {};
  if (loggedIn.isGod !== true) return;
  if (!uid || !document.getElementById('prof-student-followup-panel')) return;

  const body = document.querySelector('#prof-student-followup-panel .sbi-profile-accordion-body')
    || document.getElementById('prof-student-followup-panel');
  if (!body) return;

  body.querySelector('#sbi-god-timer-bypass-panel')?.remove();

  const enabled = data.courseTimerBypass === true || data.trainingTimerBypass === true;
  const panel = document.createElement('div');
  panel.id = 'sbi-god-timer-bypass-panel';
  panel.className = 'sbi-student-followup sbi-god-timer-bypass';
  panel.innerHTML = `
    <div class="sbi-student-followup__header">
      <div>
        <span class="sbi-student-followup__pill" data-priority="urgent">Admin God</span>
        <h4>Passe-droit timer cours</h4>
        <p>Option cachee aux autres admins. Elle permet a ${escapeHtml(getStudentName(data))} d'avancer sans attendre les timers minimums.</p>
      </div>
    </div>
    <label class="sbi-god-timer-bypass__row">
      <input id="sbi-god-timer-bypass-input" type="checkbox" ${enabled ? 'checked' : ''}>
      <span>Ne pas bloquer la progression par les timers de cours</span>
    </label>
    <div class="sbi-student-followup__footer">
      <span id="sbi-god-timer-bypass-status">Etat actuel : ${enabled ? 'actif' : 'inactif'}</span>
    </div>
  `;

  body.appendChild(panel);

  const input = panel.querySelector('#sbi-god-timer-bypass-input');
  const status = panel.querySelector('#sbi-god-timer-bypass-status');
  input?.addEventListener('change', async () => {
    const nextEnabled = input.checked === true;
    input.disabled = true;
    if (status) status.textContent = 'Sauvegarde...';

    try {
      await adminSetStudentTimerBypassCallable({ uid, enabled: nextEnabled });
      if (status) status.textContent = `Etat actuel : ${nextEnabled ? 'actif' : 'inactif'}`;
      if (typeof reloadProfile === 'function') await reloadProfile(uid);
    } catch (error) {
      input.checked = !nextEnabled;
      if (status) status.textContent = error?.message || 'Sauvegarde impossible.';
    } finally {
      input.disabled = false;
    }
  });
}
