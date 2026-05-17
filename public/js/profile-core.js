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
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { waitForSbiComponents } from '/js/profile/profile-utils.js?v=8.0P.167.62';
import { hydrateLoggedInTopbar } from '/js/profile/profile-topbar.js';
import { renderProfileShell } from '/js/profile/profile-render.js?v=8.0P.167.62';
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
  routeTargetUid: null,
  routeTargetUrl: null,
  source: '',
  isOwner: false,
  isAdmin: false,
  isEditMode: false
};

let activeCleanup = null;
let activeMountToken = 0;
let securityPrepared = false;
let saveButtonsPrepared = false;
let avatarCropperPrepared = false;

function resetContext() {
  context.currentProfileId = null;
  context.currentProfileData = null;
  context.loggedInUserId = null;
  context.loggedInUserData = null;
  context.routeTargetUid = null;
  context.routeTargetUrl = null;
  context.source = '';
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
  const lockedUrl = context.routeTargetUrl || window.__SBI_ADMIN_PROFILE_TARGET_URL || '';
  return new URL(lockedUrl || window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function isAdminProfileRoute() {
  try {
    return getCurrentProfileUrl().pathname.toLowerCase().endsWith('/admin/admin-profile.html');
  } catch {
    return window.location.pathname.toLowerCase().endsWith('/admin/admin-profile.html');
  }
}

function consumeLockedTargetUid() {
  if (!isAdminProfileRoute()) return '';

  const currentUrl = getCurrentProfileUrl();
  const urlUid = currentUrl.searchParams.get('id') || '';
  const candidates = [
    context.routeTargetUid,
    window.__SBI_ADMIN_PROFILE_TARGET_UID,
    urlUid
  ];

  try {
    const storedUid = sessionStorage.getItem('sbiAdminProfileTargetUid') || '';
    const storedUrl = sessionStorage.getItem('sbiAdminProfileTargetUrl') || '';
    const storedMatchesCurrentUrl = storedUrl && new URL(storedUrl, window.location.origin).href === currentUrl.href;
    if (storedUid && (urlUid || storedMatchesCurrentUrl)) candidates.push(storedUid);
  } catch {}

  return candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function resolveTargetProfileId(loggedInUserId) {
  return consumeLockedTargetUid() || loggedInUserId;
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

function prepareProfileActionButtons(token = activeMountToken) {
  const reloadProfile = (nextUid = context.currentProfileId) => loadProfileData(nextUid, token);

  if (!saveButtonsPrepared) {
    setupSaveButtons({ db, context, reloadProfile });
    saveButtonsPrepared = true;
  }

  if (!avatarCropperPrepared) {
    initProfileAvatarCropper({ context, reloadProfile });
    avatarCropperPrepared = true;
  }
}

async function loadProfileData(uid, token = activeMountToken) {
  if (token !== activeMountToken) return;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (token !== activeMountToken) return;
    if (!snap.exists()) {
      console.warn('[SBI Profile] Utilisateur introuvable :', uid);
      return;
    }

    context.currentProfileId = uid;
    context.currentProfileData = snap.data();
    context.isOwner = context.currentProfileId === context.loggedInUserId;

    await renderProfileShell({
      db,
      uid,
      data: context.currentProfileData,
      context,
      reloadProfile: (nextUid = uid) => loadProfileData(nextUid, token)
    });

    if (token !== activeMountToken) return;

    prepareProfileControlsEarly();
    prepareProfileActionButtons(token);

    await renderUserFormations({ uid, context });

    if (document.getElementById('prof-tracking-list')) {
      await renderLearningTracking({
        db,
        uid,
        context,
        reloadProfile: (nextUid = uid) => loadProfileData(nextUid, token)
      });
    }
  } catch (error) {
    console.error('[SBI Profile] Erreur chargement profil :', error);
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

async function bootstrapProfile(user, token = activeMountToken) {
  context.loggedInUserId = user.uid;

  await waitForSbiTopbar();
  if (token !== activeMountToken) return;

  await waitForSbiComponents();
  if (token !== activeMountToken) return;

  context.loggedInUserData = await loadLoggedInUserData(context.loggedInUserId);
  if (token !== activeMountToken) return;
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

  await loadProfileData(context.currentProfileId, token);
  startProfilePresenceListener(db, context.currentProfileId);
  bindProfileShortcuts();
}

export function mountProfileCore(options = {}) {
  activeCleanup?.({ reason: 'remount' });
  const token = activeMountToken + 1;
  activeMountToken = token;
  resetContext();

  context.routeTargetUid = String(options?.targetUid || '').trim() || null;
  context.routeTargetUrl = options?.targetUrl || null;
  context.source = options?.source || '';

  if (context.routeTargetUid) {
    try {
      window.__SBI_ADMIN_PROFILE_TARGET_UID = context.routeTargetUid;
      sessionStorage.setItem('sbiAdminProfileTargetUid', context.routeTargetUid);
      if (context.routeTargetUrl) sessionStorage.setItem('sbiAdminProfileTargetUrl', context.routeTargetUrl);
    } catch {}
  }

  let disposed = false;
  let unsubscribeAuth = null;

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (disposed) return;

    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    try {
      await bootstrapProfile(user, token);
    } catch (error) {
      console.error('[SBI Profile] Initialisation impossible :', error);
      document.body.classList.remove('preload');
      document.body.classList.add('sbi-preload-timeout');
    }
  });

  const cleanup = () => {
    disposed = true;
    if (activeMountToken === token) activeMountToken += 1;
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
