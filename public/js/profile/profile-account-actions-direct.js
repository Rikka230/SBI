import { app } from '/js/firebase-init.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminSendFinalizationInviteCallable = httpsCallable(functionsInstance, 'adminSendFinalizationInvite');

const DIRECT_FLAG = 'sbiDirectFinalizationBound';
const BUSY_FLAG = 'sbiDirectFinalizationBusy';

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

  button.dataset[BUSY_FLAG] = busy ? 'true' : 'false';
  button.disabled = busy;
  button.style.opacity = busy ? '0.65' : '';

  if (!button.dataset.sbiOriginalLabel) {
    button.dataset.sbiOriginalLabel = button.textContent || 'Renvoyer finalisation';
  }

  button.textContent = busy ? 'Envoi...' : button.dataset.sbiOriginalLabel;
}

function bumpManualInviteCounter() {
  const panel = document.getElementById('prof-account-actions-panel');
  if (!panel) return;

  const statsNode = Array.from(panel.querySelectorAll('span')).find((node) => (
    String(node.textContent || '').includes('Manuelles :')
  ));

  if (!statsNode) return;

  const text = String(statsNode.textContent || '');
  const match = text.match(/Manuelles\s*:\s*(\d+)/i);
  if (!match) return;

  const nextCount = Number(match[1] || 0) + 1;
  statsNode.textContent = text.replace(/Manuelles\s*:\s*\d+/i, `Manuelles : ${nextCount}`);
}

function markFinalizationPanelAsSent() {
  const panel = document.getElementById('prof-account-actions-panel');
  if (!panel) return;

  const statusCard = Array.from(panel.querySelectorAll('strong')).find((node) => (
    ['Finalisation en attente', 'Lien ancien', 'Contact direct traité'].includes(String(node.textContent || '').trim())
  ));

  if (statusCard) {
    statusCard.textContent = 'Finalisation renvoyée';
    statusCard.style.color = '#2ed573';
  }

  const detailParagraph = Array.from(panel.querySelectorAll('p')).find((node) => (
    String(node.textContent || '').includes('Dernière invitation')
    || String(node.textContent || '').includes('Dernière relance auto')
    || String(node.textContent || '').includes('Aucune relance')
    || String(node.textContent || '').includes('Dernier lien envoyé')
  ));

  if (detailParagraph) {
    detailParagraph.textContent = 'Invitation manuelle envoyée à l’instant. Le mail peut arriver avec un léger délai Brevo.';
  }

  bumpManualInviteCounter();
}

async function sendFinalizationWithoutClientFirestore(button) {
  if (!button || button.disabled || button.dataset[BUSY_FLAG] === 'true') return;

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

    markFinalizationPanelAsSent();
    setActionStatus(`${message} Mail en livraison Brevo, la fiche sera resynchronisée au prochain rafraîchissement.`, 'success');

    window.dispatchEvent(new CustomEvent('sbi:profile-finalization-invite-sent', {
      detail: {
        uid,
        source: 'profile-direct-action-no-firestore-refresh',
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

function bindFinalizationButton(button) {
  if (!button || button.dataset[DIRECT_FLAG] === 'true') return;

  const clonedButton = button.cloneNode(true);
  clonedButton.dataset[DIRECT_FLAG] = 'true';
  clonedButton.dataset.sbiOriginalLabel = clonedButton.textContent || 'Renvoyer finalisation';

  clonedButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    sendFinalizationWithoutClientFirestore(clonedButton);
  });

  button.replaceWith(clonedButton);
}

function bindExistingFinalizationButton() {
  bindFinalizationButton(document.getElementById('prof-send-finalization-btn'));
}

bindExistingFinalizationButton();

const observer = new MutationObserver(() => {
  bindExistingFinalizationButton();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
