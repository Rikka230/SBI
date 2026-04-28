/**
 * =======================================================================
 * PROFILE CORE - Orchestrateur profil SBI
 * =======================================================================
 *
 * 6.9 : découpe du moteur monolithique en modules lisibles.
 * Ce fichier ne porte plus la logique lourde : il orchestre les modules.
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

function resolveTargetProfileId(loggedInUserId) {
  const urlParams = new URLSearchParams(window.location.search);
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

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
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
});

window.addEventListener('beforeunload', () => {
  stopProfilePresenceListener();
});
