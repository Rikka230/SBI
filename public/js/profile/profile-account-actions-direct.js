import { app } from '/js/firebase-init.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminSendFinalizationInviteCallable = httpsCallable(functionsInstance, 'adminSendFinalizationInvite');

function getCurrentProfileUrl() {
  return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function getTargetProfileId() {
  const params = getCurrentProfileUrl().searchParams;
  return String(params.get('id') || '').trim();
}

function getStatusNode() {
  return document.getElementById('prof-account-actions-status');
}

function setActionStatus(message, tone = 'muted') {
  const status = getStatusNode();
  if (!status) return;

  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#2ed573'
    : tone === 'error'
      ? '#ff4a4a'
      : 'var(--text-muted)';
}

function getCallableUiMessage(error, fallback) {
  const raw = error?.message || error?.details?.message || fallback;
  return String(raw).replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || fallback;
}

function setButtonBusy(button, busy) {
  if (!button) return;
  button.dataset.sbiDirectFinalizationBusy = busy ? 'true' : 'false';
  button.disabled = busy;
  button.style.opacity = busy ? '0.65' : '';
}

async function sendFinalizationWithoutClientFirestore(button) {
  if (!button || button.disabled || button.dataset.sbiDirectFinalizationBusy === 'true') return;

  const uid = getTargetProfileId();
  if (!uid) {
    setActionStatus('Compte cible introuvable : ouvrez la fiche depuis la liste des comptes.', 'error');
    return;
  }

  const confirmed = window.confirm('Renvoyer une invitation de finalisation à ce compte ?');
  if (!confirmed) return;

  setButtonBusy(button, true);
  setActionStatus('Envoi serveur de l’invitation de finalisation...', 'muted');

  try {
    const result = await adminSendFinalizationInviteCallable({ uid });
    const message = result?.data?.message || 'Invitation de finalisation envoyée.';

    setActionStatus(`${message} La fiche se resynchronisera dès que Firestore est disponible.`, 'success');

    window.dispatchEvent(new CustomEvent('sbi:profile-finalization-invite-sent', {
      detail: {
        uid,
        source: 'profile-direct-action',
        at: Date.now()
      }
    }));
  } catch (error) {
    console.warn('[SBI Profile] Invitation finalisation directe impossible :', error);
    setActionStatus(getCallableUiMessage(error, 'Envoi impossible.'), 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('#prof-send-finalization-btn');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  sendFinalizationWithoutClientFirestore(button);
}, true);
