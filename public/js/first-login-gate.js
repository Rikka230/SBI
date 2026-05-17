/**
 * SBI 8.0P.167.42 / P2H.2-H
 * Première connexion : validation obligatoire légère.
 *
 * Objectif :
 * - bloquer l'accès visuel tant que l'utilisateur student/teacher
 *   n'a pas confirmé les cases de première connexion ;
 * - écrire la validation via Cloud Function pour garder l'audit serveur ;
 * - ne pas impacter les admins / isGod.
 */

import { app, auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const CHECKLIST_VERSION = '2026-05-SBI-FIRST-LOGIN-V1';
const MODAL_ID = 'sbi-first-login-gate';
const STYLE_ID = 'sbi-first-login-gate-style';
const SESSION_PREFIX = 'sbi:firstLoginGate:completed:';

const functionsInstance = getFunctions(app, 'europe-west1');
const completeFirstLoginOnboarding = httpsCallable(functionsInstance, 'completeFirstLoginOnboarding');

let currentUid = '';
let currentUserData = null;
let submitInProgress = false;

function getSessionKey(uid) {
  return `${SESSION_PREFIX}${uid}`;
}

function readSessionCompleted(uid) {
  try {
    return sessionStorage.getItem(getSessionKey(uid)) === '1';
  } catch (_) {
    return false;
  }
}

function writeSessionCompleted(uid) {
  try {
    sessionStorage.setItem(getSessionKey(uid), '1');
  } catch (_) {}
}

function isAdminLike(data = {}) {
  return data?.isGod === true || data?.role === 'admin';
}

function isTeacherOrStudent(data = {}) {
  return ['teacher', 'prof', 'professeur', 'enseignant', 'student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(String(data?.role || '').toLowerCase());
}

function hasCompletedFirstLogin(data = {}) {
  return data?.accountStatus?.firstLoginCompleted === true
    || data?.firstLoginCompleted === true;
}

function getDisplayName(data = {}) {
  return `${data.prenom || ''} ${data.nom || ''}`.trim()
    || data.displayName
    || data.email
    || 'ton espace SBI';
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.sbi-first-login-locked {
      overflow: hidden;
    }

    .sbi-first-login-gate {
      position: fixed;
      inset: 0;
      z-index: 5000;
      display: grid;
      place-items: center;
      padding: 1.2rem;
      background:
        radial-gradient(circle at 20% 15%, rgba(42, 87, 255, 0.22), transparent 34%),
        radial-gradient(circle at 80% 20%, rgba(255, 72, 190, 0.14), transparent 30%),
        rgba(3, 6, 14, 0.86);
      backdrop-filter: blur(14px);
    }

    .sbi-first-login-card {
      width: min(640px, 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 24px;
      background:
        linear-gradient(145deg, rgba(12, 18, 34, 0.96), rgba(5, 8, 17, 0.98));
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
      color: #fff;
      overflow: hidden;
    }

    .sbi-first-login-head {
      padding: 1.5rem 1.6rem 1.1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .sbi-first-login-eyebrow {
      display: inline-flex;
      margin-bottom: 0.75rem;
      padding: 0.34rem 0.7rem;
      border-radius: 999px;
      background: rgba(42, 87, 255, 0.14);
      border: 1px solid rgba(42, 87, 255, 0.34);
      color: #cdd9ff;
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .sbi-first-login-head h2 {
      margin: 0;
      font-size: clamp(1.45rem, 3vw, 2rem);
      line-height: 1.12;
    }

    .sbi-first-login-head p {
      margin: 0.75rem 0 0;
      color: #aeb8d4;
      line-height: 1.58;
    }

    .sbi-first-login-body {
      padding: 1.3rem 1.6rem 1.55rem;
    }

    .sbi-first-login-checks {
      display: grid;
      gap: 0.8rem;
      margin: 0 0 1.25rem;
    }

    .sbi-first-login-check {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.95rem 1rem;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }

    .sbi-first-login-check input {
      width: 18px;
      height: 18px;
      margin-top: 0.1rem;
      accent-color: #2A57FF;
    }

    .sbi-first-login-check strong {
      display: block;
      margin-bottom: 0.18rem;
      color: #fff;
      font-size: 0.95rem;
    }

    .sbi-first-login-check span {
      color: #aeb8d4;
      font-size: 0.86rem;
      line-height: 1.45;
    }

    .sbi-first-login-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.85rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }

    .sbi-first-login-status {
      min-height: 1.2rem;
      color: #aeb8d4;
      font-size: 0.84rem;
      line-height: 1.4;
    }

    .sbi-first-login-status.is-error {
      color: #ff9b9b;
    }

    .sbi-first-login-button {
      border: none;
      border-radius: 999px;
      padding: 0.86rem 1.2rem;
      background: linear-gradient(135deg, #2A57FF, #6f8cff);
      color: #fff;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 12px 30px rgba(42, 87, 255, 0.25);
    }

    .sbi-first-login-button:disabled {
      cursor: not-allowed;
      opacity: 0.52;
      box-shadow: none;
    }

    @media (max-width: 640px) {
      .sbi-first-login-card {
        border-radius: 18px;
      }

      .sbi-first-login-head,
      .sbi-first-login-body {
        padding-left: 1.1rem;
        padding-right: 1.1rem;
      }

      .sbi-first-login-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .sbi-first-login-button {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function removeGate() {
  document.body.classList.remove('sbi-first-login-locked');
  document.getElementById(MODAL_ID)?.remove();
}

function getCheckedPayload() {
  const root = document.getElementById(MODAL_ID);
  return {
    termsAccepted: root?.querySelector('[data-first-login-check="terms"]')?.checked === true,
    rulesAccepted: root?.querySelector('[data-first-login-check="rules"]')?.checked === true,
    importantInfoAccepted: root?.querySelector('[data-first-login-check="info"]')?.checked === true,
    emailConfirmed: root?.querySelector('[data-first-login-check="email"]')?.checked === true
  };
}

function allRequiredChecked() {
  const payload = getCheckedPayload();
  return payload.termsAccepted
    && payload.rulesAccepted
    && payload.importantInfoAccepted
    && payload.emailConfirmed;
}

function updateSubmitState() {
  const submit = document.getElementById('sbi-first-login-submit');
  if (!submit) return;
  submit.disabled = submitInProgress || !allRequiredChecked();
}

function setStatus(message = '', state = '') {
  const status = document.getElementById('sbi-first-login-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', state === 'error');
}

async function submitFirstLogin() {
  if (submitInProgress || !allRequiredChecked()) return;

  const submit = document.getElementById('sbi-first-login-submit');
  const payload = getCheckedPayload();

  submitInProgress = true;
  updateSubmitState();
  if (submit) submit.textContent = 'Validation...';
  setStatus('Enregistrement sécurisé de la validation...');

  try {
    await completeFirstLoginOnboarding({
      checklistVersion: CHECKLIST_VERSION,
      ...payload
    });

    if (currentUid) writeSessionCompleted(currentUid);
    setStatus('Validation enregistrée. Ouverture de ton espace...');
    window.setTimeout(removeGate, 450);
  } catch (error) {
    console.error('[SBI First Login] Validation impossible :', error);
    setStatus('Validation impossible pour le moment. Réessaie dans un instant.', 'error');
    submitInProgress = false;
    if (submit) submit.textContent = 'Valider et continuer';
    updateSubmitState();
  }
}

function renderGate(userData = {}) {
  if (document.getElementById(MODAL_ID)) return;

  injectStyle();

  const email = userData.email || auth.currentUser?.email || 'adresse de connexion';
  const displayName = getDisplayName(userData);

  const root = document.createElement('div');
  root.id = MODAL_ID;
  root.className = 'sbi-first-login-gate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="sbi-first-login-card">
      <div class="sbi-first-login-head">
        <span class="sbi-first-login-eyebrow">Première connexion</span>
        <h2>Bienvenue ${escapeHtml(displayName)}</h2>
        <p>Avant d’ouvrir ton espace SBI, confirme ces points. Cette validation est enregistrée dans le suivi du compte.</p>
      </div>
      <div class="sbi-first-login-body">
        <div class="sbi-first-login-checks">
          ${renderCheck('terms', 'J’accepte les conditions d’utilisation SBI.', 'Elles encadrent l’accès à l’espace privé, aux contenus pédagogiques et aux services associés.')}
          ${renderCheck('rules', 'Je confirme avoir pris connaissance des règles de fonctionnement.', 'Assiduité, respect des consignes, accès aux ressources et communication avec l’équipe pédagogique.')}
          ${renderCheck('info', 'Je comprends que les informations importantes seront suivies dans mon espace.', 'Progression, documents, relances, communications pédagogiques et éventuels checkpoints de formation.')}
          ${renderCheck('email', 'Je confirme mon email de connexion.', escapeHtml(email))}
        </div>
        <div class="sbi-first-login-actions">
          <div class="sbi-first-login-status" id="sbi-first-login-status">Coche les 4 cases pour continuer.</div>
          <button type="button" class="sbi-first-login-button" id="sbi-first-login-submit" disabled>Valider et continuer</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  document.body.classList.add('sbi-first-login-locked');

  root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      setStatus(allRequiredChecked() ? 'Prêt à valider.' : 'Coche les 4 cases pour continuer.');
      updateSubmitState();
    });
  });

  root.querySelector('#sbi-first-login-submit')?.addEventListener('click', submitFirstLogin);
  updateSubmitState();
}

function renderCheck(id, title, desc) {
  return `
    <label class="sbi-first-login-check">
      <input type="checkbox" data-first-login-check="${id}">
      <span>
        <strong>${escapeHtml(title)}</strong>
        <span>${desc}</span>
      </span>
    </label>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function checkFirstLoginGate(user) {
  currentUid = user?.uid || '';
  currentUserData = null;
  removeGate();

  if (!currentUid) return;
  if (readSessionCompleted(currentUid)) return;

  try {
    const snap = await getDoc(doc(db, 'users', currentUid));
    if (!snap.exists()) return;

    const data = snap.data() || {};
    currentUserData = data;

    if (data.statut === 'suspendu') return;
    if (isAdminLike(data)) return;
    if (!isTeacherOrStudent(data)) return;

    if (hasCompletedFirstLogin(data)) {
      writeSessionCompleted(currentUid);
      return;
    }

    renderGate(data);
  } catch (error) {
    console.warn('[SBI First Login] Vérification ignorée :', error);
  }
}

onAuthStateChanged(auth, (user) => {
  checkFirstLoginGate(user).catch(() => {});
});
