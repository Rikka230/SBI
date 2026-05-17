/**
 * =======================================================================
 * PROFILE CORE - Orchestrateur profil SBI
 * =======================================================================
 *
 * 6.9 : découpe du moteur monolithique en modules lisibles.
 * 8.0D : export mountProfileCore() pour montage PJAX avec cleanup.
 * 8.0H.1 : droits profil appliqués plus tôt pour éviter le pop visuel.
 * 8.0P.160 : cache-bust du rendu profil pour journal compte lisible.
 * 8.0P.164 : cache-bust rendu profil pour relance finalisation compte.
 * 8.0P.165 : affichage relances automatiques et escalade.
 * 8.0P.163 : cache-bust du rendu profil pour notes internes persistantes.
 * 8.0P.167.61 : verrouillage de l'URL/UID cible pour éviter le double montage PJAX sans données.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { waitForSbiComponents } from '/js/profile/profile-utils.js?v=8.0P.167.60';
import { hydrateLoggedInTopbar } from '/js/profile/profile-topbar.js';
import { renderProfileShell } from '/js/profile/profile-render.js?v=8.0P.167.60';
import { renderUserFormations } from '/js/profile/profile-formations.js';
import { renderLearningTracking } from '/js/profile/profile-tracking.js';
import { setupSaveButtons, setupSecurityAndEditMode } from '/js/profile/profile-edit.js';
import { initProfileAvatarCropper } from '/js/profile/profile-avatar-cropper.js';
import { startProfilePresenceListener, stopProfilePresenceListener } from '/js/profile/profile-presence.js';

const context = {
  currentProfileId: null,
  currentProfileData: null,
  loggedInUserId: null,
  loggedInUserData: null,
  isOwner: false,
  isAdmin: false,
  isEditMode: false
};

let activeCleanup = null;
let securityPrepared = false;
let saveButtonsPrepared = false;
let avatarCropperPrepared = false;
let activeMountToken = 0;

function resetContext() {
  context.currentProfileId = null;
  context.currentProfileData = null;
  context.loggedInUserId = null;
  context.loggedInUserData = null;
  context.isOwner = false;
  context.isAdmin = false;
  context.isEditMode = false;
  securityPrepared = false;
  saveButtonsPrepared = false;
  avatarCropperPrepared = false;
  document.body.classList.remove('editing');
  document.body.classList.remove('sbi-profile-permissions-ready');
}

function getCurrentProfileUrl() {
  const rawUrl = window.__SBI_PROFILE_TARGET_URL
    || window.SBI_APP_SHELL_CURRENT_URL
    || window.location.href;

  return new URL(rawUrl, window.location.origin);
}

function getRecentPendingAdminProfileUid() {
  try {
    const uid = sessionStorage.getItem('sbiAdminPendingProfileUid') || '';
    const targetUrl = sessionStorage.getItem('sbiAdminPendingProfileUrl') || '';
    const timestamp = Number(sessionStorage.getItem('sbiAdminPendingProfileAt') || 0);

    if (!uid || !targetUrl || !timestamp) return '';
    if (Date.now() - timestamp > 45000) return '';

    const current = getCurrentProfileUrl();
    const target = new URL(targetUrl, window.location.origin);

    if (target.pathname !== '/admin/admin-profile.html') return '';
    if (current.pathname !== '/admin/admin-profile.html') return '';

    return uid;
  } catch {
    return '';
  }
}

function resolveTargetProfileId(loggedInUserId) {
  const urlParams = getCurrentProfileUrl().searchParams;
  const explicitId = urlParams.get('id');
  if (explicitId) return explicitId;

  const runtimeTargetId = window.__SBI_PROFILE_TARGET_ID || '';
  if (runtimeTargetId) return runtimeTargetId;

  const pendingAdminUid = getRecentPendingAdminProfileUid();
  if (pendingAdminUid) return pendingAdminUid;

  return loggedInUserId;
}

function clearConsumedPendingProfileUid(uid) {
  try {
    const pending = sessionStorage.getItem('sbiAdminPendingProfileUid') || '';
    if (!uid || pending !== uid) return;

    sessionStorage.removeItem('sbiAdminPendingProfileUid');
    sessionStorage.removeItem('sbiAdminPendingProfileUrl');
    sessionStorage.removeItem('sbiAdminPendingProfileAt');
  } catch {}
}

async function loadLoggedInUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return {};
  return snap.data();
}

function prepareProfileControlsEarly() {
  if (securityPrepared) return;

  setupSecurityAndEditMode({ context });
  securityPrepared = true;
  document.body.classList.add('sbi-profile-permissions-ready');
}

function prepareProfileActionButtons() {
  if (!saveButtonsPrepared) {
    setupSaveButtons({ db, context, reloadProfile: loadProfileData });
    saveButtonsPrepared = true;
  }

  if (!avatarCropperPrepared) {
    initProfileAvatarCropper({ context, reloadProfile: loadProfileData });
    avatarCropperPrepared = true;
  }
}

async function loadProfileData(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      console.warn('[SBI Profile] Utilisateur introuvable :', uid);
      return false;
    }

    context.currentProfileId = uid;
    context.currentProfileData = snap.data();
    context.isOwner = context.currentProfileId === context.loggedInUserId;

    await renderProfileShell({
      db,
      uid,
      data: context.currentProfileData,
      context,
      reloadProfile: loadProfileData
    });

    clearConsumedPendingProfileUid(uid);

    prepareProfileControlsEarly();
    prepareProfileActionButtons();

    await renderUserFormations({ uid, context });

    if (document.getElementById('prof-tracking-list')) {
      await renderLearningTracking({
        db,
        uid,
        context,
        reloadProfile: loadProfileData
      });
    }

    return true;
  } catch (error) {
    console.error('[SBI Profile] Erreur chargement profil :', error);
    return false;
  } finally {
    document.body.classList.remove('preload');
    document.body.classList.add('sbi-preload-timeout');
  }
}

function bindProfileShortcuts() {
  const myProfileBtn = document.getElementById('btn-my-profile');
  if (!myProfileBtn || myProfileBtn.dataset.bound === 'true') return;

  myProfileBtn.dataset.bound = 'true';
  myProfileBtn.addEventListener('click', () => {
    window.location.href = `/admin/admin-profile.html?id=${context.loggedInUserId}`;
  });
}

async function bootstrapProfile(user, mountToken = activeMountToken) {
  context.loggedInUserId = user.uid;

  await waitForSbiTopbar();
  await waitForSbiComponents();
  if (mountToken !== activeMountToken) return;

  context.loggedInUserData = await loadLoggedInUserData(context.loggedInUserId);
  if (mountToken !== activeMountToken) return;

  context.isAdmin = context.loggedInUserData?.role === 'admin' || context.loggedInUserData?.isGod === true;

  hydrateLoggedInTopbar(context.loggedInUserData);

  context.currentProfileId = resolveTargetProfileId(context.loggedInUserId);
  context.isOwner = context.currentProfileId === context.loggedInUserId;

  /**
   * Avant 8.0H.1, les sections privées étaient révélées après le rendu
   * complet du profil, formations et suivi inclus. En PJAX, cela créait
   * un petit pop visuel sur l'onglet Données Privées.
   *
   * On applique donc les droits dès que le contexte owner/admin est connu.
   */
  prepareProfileControlsEarly();

  const loaded = await loadProfileData(context.currentProfileId);
  if (mountToken !== activeMountToken || !loaded) return;

  startProfilePresenceListener(db, context.currentProfileId);
  bindProfileShortcuts();
}

export function mountProfileCore(options = {}) {
  activeCleanup?.({ reason: 'remount' });

  activeMountToken += 1;
  const mountToken = activeMountToken;

  if (options && Object.prototype.hasOwnProperty.call(options, 'targetUrl')) {
    window.__SBI_PROFILE_TARGET_URL = options.targetUrl || '';
  } else {
    window.__SBI_PROFILE_TARGET_URL = '';
  }

  if (options && Object.prototype.hasOwnProperty.call(options, 'targetId')) {
    window.__SBI_PROFILE_TARGET_ID = options.targetId || '';
  } else {
    window.__SBI_PROFILE_TARGET_ID = '';
  }

  resetContext();

  let disposed = false;
  let unsubscribeAuth = null;

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (disposed) return;

    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    try {
      await bootstrapProfile(user, mountToken);
    } catch (error) {
      console.error('[SBI Profile] Initialisation impossible :', error);
      document.body.classList.remove('preload');
      document.body.classList.add('sbi-preload-timeout');
    }
  });

  const cleanup = () => {
    disposed = true;
    stopProfilePresenceListener();
    unsubscribeAuth?.();
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  return cleanup;
}

function autoMountProfileCore() {
  if (window.__SBI_APP_SHELL_MOUNTING_PROFILE) return;
  if (!document.getElementById('prof-avatar-img')) return;
  mountProfileCore();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMountProfileCore, { once: true });
} else {
  autoMountProfileCore();
}

window.addEventListener('beforeunload', () => {
  stopProfilePresenceListener();
});
