import { escapeHTML } from './profile-utils.js';
import { loadAssignedFormationsForUser, roleOf } from '/js/learning-access.js';

export async function getVisibleFormationsForProfile({ uid, targetUserData = {}, loggedInUserId, loggedInUserData = {}, isOwner = false, isAdmin = false }) {
  const targetRole = roleOf(targetUserData, targetUserData.role || 'student');
  const targetFormations = await loadAssignedFormationsForUser({
    uid,
    userData: targetUserData,
    role: targetRole
  });

  if (isOwner || isAdmin) return sortFormations(targetFormations);

  const viewerRole = roleOf(loggedInUserData || {}, loggedInUserData?.role || 'student');
  const viewerFormations = await loadAssignedFormationsForUser({
    uid: loggedInUserId,
    userData: loggedInUserData || {},
    role: viewerRole
  });

  const viewerKeys = new Set(getFormationLookupKeys(viewerFormations));
  return sortFormations(targetFormations.filter((formation) => {
    const keys = getFormationLookupKeys([formation]);
    return keys.some((key) => viewerKeys.has(key));
  }));
}

function getFormationLookupKeys(formations = []) {
  const keys = [];
  formations.forEach((formation) => {
    if (formation?.id) keys.push(String(formation.id).trim());
    if (formation?.titre) keys.push(String(formation.titre).trim());
  });
  return Array.from(new Set(keys.filter(Boolean)));
}

function sortFormations(formations = []) {
  return [...formations].sort((a, b) => String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' }));
}

export async function renderUserFormations({ uid, context }) {
  const list = document.getElementById('prof-formations-list');
  if (!list) return [];

  list.innerHTML = 'Recherche...';

  try {
    const formations = await getVisibleFormationsForProfile({
      uid,
      targetUserData: context.currentProfileData || {},
      loggedInUserId: context.loggedInUserId,
      loggedInUserData: context.loggedInUserData || {},
      isOwner: context.isOwner,
      isAdmin: context.isAdmin
    });

    if (formations.length === 0) {
      list.innerHTML = 'Aucune formation assignée.';
      return formations;
    }

    const path = window.location.pathname;
    if (path.includes('admin')) {
      list.innerHTML = formations.map((formation) => `
        <span style="color: white; display:flex; align-items:center; gap:8px; margin-bottom:5px; cursor:pointer;" onclick="window.location.href='/admin/index.html?tab=view-formations'">
          <span style="width:8px; height:8px; background:var(--accent-blue); transform:rotate(45deg); flex-shrink:0;"></span>
          ${escapeHTML(formation.titre || 'Formation')}
        </span>
      `).join('');
    } else if (path.includes('teacher')) {
      list.innerHTML = formations.map((formation) => `
        <span style="display:flex; align-items:center; gap:8px; margin-bottom:5px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.color='var(--accent-orange)'" onmouseout="this.style.color='inherit'" onclick="window.location.href='/teacher/mes-cours.html'">
          <span style="width:8px; height:8px; background:var(--accent-orange); border-radius:50%; flex-shrink:0;"></span>
          ${escapeHTML(formation.titre || 'Formation')}
        </span>
      `).join('');
    } else {
      list.innerHTML = formations.map((formation) => `
        <span style="display:flex; align-items:center; gap:8px; margin-bottom:5px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='inherit'" onclick="window.location.href='/student/mes-cours.html'">
          <span style="width:8px; height:8px; background:var(--accent-blue); border-radius:50%; flex-shrink:0;"></span>
          ${escapeHTML(formation.titre || 'Formation')}
        </span>
      `).join('');
    }

    return formations;
  } catch (error) {
    console.error('Erreur chargement formations profil', error);
    list.innerHTML = 'Aucune formation affichable pour le moment.';
    return [];
  }
}
