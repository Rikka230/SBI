/**
 * =======================================================================
 * PROFILE CORE - Orchestrateur profil SBI
 * =======================================================================
 *
 * 6.9 : découpe du moteur monolithique en modules lisibles.
 * 8.0D : export mountProfileCore() pour montage PJAX avec cleanup.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { waitForSbiComponents } from '/js/profile/profile-utils.js';
import { hydrateLoggedInTopbar } from '/js/profile/profile-topbar.js';
import { renderProfileShell } from '/js/profile/profile-render.js';
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

function resetContext() {
  context.currentProfileId = null;
  context.currentProfileData = null;
  context.loggedInUserId = null;
  context.loggedInUserData = null;
  context.isOwner = false;
  context.isAdmin = false;
  context.isEditMode = false;
}

function getCurrentProfileUrl() {
  return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function resolveTargetProfileId(loggedInUserId) {
  const urlParams = getCurrentProfileUrl().searchParams;
  return urlParams.get('id') || loggedInUserId;
}

async function loadLoggedInUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return {};
  return snap.data();
}

async function loadProfileData(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
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
      reloadProfile: loadProfileData
    });

    await renderUserFormations({ uid, context });

    if (document.getElementById('prof-tracking-list')) {
      await renderLearningTracking({
        db,
        uid,
        context,
        reloadProfile: loadProfileData
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

async function bootstrapProfile(user) {
  context.loggedInUserId = user.uid;

  await waitForSbiTopbar();
  await waitForSbiComponents();

  context.loggedInUserData = await loadLoggedInUserData(context.loggedInUserId);
  context.isAdmin = context.loggedInUserData?.role === 'admin' || context.loggedInUserData?.isGod === true;

  hydrateLoggedInTopbar(context.loggedInUserData);

  context.currentProfileId = resolveTargetProfileId(context.loggedInUserId);
  context.isOwner = context.currentProfileId === context.loggedInUserId;

  await loadProfileData(context.currentProfileId);
  startProfilePresenceListener(db, context.currentProfileId);
  setupSecurityAndEditMode({ context });
  setupSaveButtons({ db, context, reloadProfile: loadProfileData });
  initProfileAvatarCropper({ context, reloadProfile: loadProfileData });
  bindProfileShortcuts();
}

export function mountProfileCore() {
  activeCleanup?.({ reason: 'remount' });
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
      await bootstrapProfile(user);
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
