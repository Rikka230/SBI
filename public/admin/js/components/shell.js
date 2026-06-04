// SBI 8.0P.167.311 — Shell desktop unifié des espaces de rôle (phase 1b).
//
// Convergence des panneaux PC dupliqués (student-panels.js / teacher-panels.js /
// tutor-panels.js) derrière UN module piloté par :
//   - le MANIFESTE de navigation (nav-manifest.js) = source unique de l'ordre des
//     onglets, déjà consommée par la bottom-nav mobile ;
//   - un PROFIL DE RÔLE (ROLE_PROFILES) = les seules variations entre espaces
//     (label, accent, niveau affiché, mode de recherche, lien profil).
//
// Une seule paire de classes (SbiLeftPanel / SbiTopBar) est enregistrée sous les
// TAGS EXISTANTS (student-left-panel, teacher-top-bar, …) → aucune page HTML à
// éditer, et la *deletion test* des 3 anciens modules valide l'abstraction.
// Le rôle et le nom du composant monté sont déduits du nom de tag (this.localName).
//
// Sortie desktop volontairement IDENTIQUE à l'existant (mêmes classes/ids/styles
// inline) pour ne casser ni la recherche globale, ni la cloche, ni le PJAX, ni le
// collapse du panneau. L'admin (cockpit sombre) reste hors périmètre.

import { ICONS, brand, defineOnce } from './shared-icons.js';
import { dispatchComponentMounted } from './ready.js';
import { signOutToLogin } from './shared-actions.js';
import { SBI_VERSION } from '/js/sbi-version.js';
// Sceau de version (A2) : même V que le reste de la colonne (import dynamique car
// un import statique ne peut pas interpoler la version).
const { NAV_BY_ROLE, isActive } = await import(`./nav-manifest.js?v=${SBI_VERSION.version}`);

// Profil de rôle : la donnée qui décrit le chrome d'un espace. Ajouter un rôle =
// une entrée ici + une entrée dans NAV_BY_ROLE, pas un nouveau composant.
const ROLE_PROFILES = {
  student: {
    label: 'Étudiant',
    accent: 'var(--accent-blue, #2A57FF)',
    levelLabel: 'Niveau -',
    levelColor: 'var(--accent-blue)',
    searchMode: 'global',
    searchPlaceholder: 'Rechercher un cours, une ressource...',
    profileHref: '/student/mon-profil.html'
  },
  teacher: {
    label: 'Prof',
    accent: 'var(--accent-orange, #f97316)',
    levelLabel: 'Coach SBI',
    levelColor: 'var(--accent-orange, #f97316)',
    searchMode: 'global',
    searchPlaceholder: 'Rechercher un cours, un élève...',
    profileHref: '/teacher/mon-profil.html'
  },
  tutor: {
    label: 'Tuteur',
    accent: 'var(--accent-lime, #84cc16)',
    levelLabel: "Maître d'apprentissage",
    levelColor: 'var(--accent-lime, #84cc16)',
    searchMode: 'apprentice',
    searchPlaceholder: 'Rechercher un apprenti...',
    profileHref: '/tutor/dashboard.html'
  }
};

// Rôle déduit du nom de tag : 'student-left-panel' → 'student'.
function roleFromTag(el) {
  const first = String(el.localName || '').split('-')[0];
  return ROLE_PROFILES[first] ? first : null;
}

// ---- Panneau latéral (aside) -------------------------------------------------
class SbiLeftPanel extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    const role = roleFromTag(this);
    if (!role) return;
    this.dataset.rendered = 'true';

    const profile = ROLE_PROFILES[role];
    const path = window.location.pathname;
    const entries = NAV_BY_ROLE[role] || [];

    const items = entries.map((e) => {
      const active = isActive(path, e) ? ' active' : '';
      return `<li class="nav-item${active}" data-sbi-href="${e.href}" role="link" tabindex="0">${e.icon}<span class="nav-text">${e.label}</span></li>`;
    }).join('');

    this.innerHTML = `
      <aside id="left-panel" class="side-panel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:0 15px; width:100%; box-sizing:border-box;">
          <div class="logo-zone" style="display:flex; align-items:center; overflow:hidden; white-space:nowrap; gap:.42rem;">
            ${brand(profile.label, profile.accent)}
          </div>
          <button id="btn-toggle-panel" type="button" aria-label="Réduire le panneau" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; margin:0; display:flex; align-items:center;">
            ${ICONS.chevron}
          </button>
        </div>
        <ul class="nav-menu">${items}</ul>
        <div style="margin-top:auto; padding:1rem; border-top:1px solid var(--border-color); overflow:hidden;">
          <button id="logout-btn-${role}" class="action-btn danger" style="width:100%; justify-content:center; gap:.5rem;">
            ${ICONS.logout}<span class="nav-text">Déconnexion</span>
          </button>
        </div>
      </aside>
    `;
    this.querySelector(`#logout-btn-${role}`)?.addEventListener('click', signOutToLogin);
    dispatchComponentMounted(this.localName, this);
  }
}

// ---- Barre supérieure (header) ----------------------------------------------
class SbiTopBar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === 'true') return;
    const role = roleFromTag(this);
    if (!role) return;
    this.dataset.rendered = 'true';

    const profile = ROLE_PROFILES[role];
    document.body.classList.add('no-right-panel');

    // Zone de recherche : globale (élève/prof) OU recherche d'apprenti (tuteur).
    const searchZone = profile.searchMode === 'apprentice'
      ? `<input type="text" class="tutor-apprentice-search" placeholder="${profile.searchPlaceholder}" style="width:100%; box-sizing:border-box; padding:.7rem 1.5rem .7rem 2.8rem; background:#f9fafb; border:1px solid var(--border-color); border-radius:20px; outline:none; font-size:.95rem; color:var(--text-main);">
          <div class="tutor-apprentice-results"></div>`
      : `<input type="text" class="global-search-input" placeholder="${profile.searchPlaceholder}" style="width:100%; box-sizing:border-box; padding:.7rem 1.5rem .7rem 2.8rem; background:#f9fafb; border:1px solid var(--border-color); border-radius:20px; outline:none; font-size:.95rem; color:var(--text-main);">
          <div class="global-search-results"></div>`;

    this.innerHTML = `
      <header class="top-bar" style="border-bottom:1px solid var(--border-color); background-color:rgba(255,255,255,.95); backdrop-filter:blur(10px);">
        <button class="mobile-toggle left-toggle" id="btn-toggle-mobile">${ICONS.dashboard}</button>
        <div class="search-bar-top" style="position:relative; flex-grow:1; max-width:450px; margin-left:2rem;">
          <span style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); width:18px; color:var(--text-muted); display:flex;">${ICONS.search}</span>
          ${searchZone}
        </div>
        <div style="display:flex; align-items:center; gap:1.5rem; margin-left:auto; padding-right:1rem;">
          <div style="position:relative;">
            <div id="notif-bell-btn" style="position:relative; cursor:pointer; padding:5px;">${ICONS.bell}<span class="notif-badge" id="bell-badge" style="display:none;">0</span></div>
            <div id="notifications-section" style="position:absolute; top:calc(100% + 10px); right:-50px; width:320px; background:white; border:1px solid var(--border-color); border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.1); z-index:1000; display:none;">
              <div style="padding:1rem; border-bottom:1px solid var(--border-color); font-weight:bold; color:var(--text-main); font-size:.9rem;" id="notif-panel-title">VOS NOTIFICATIONS</div>
              <div id="notifications-list" style="display:flex; flex-direction:column; max-height:350px; overflow-y:auto;"></div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:1rem; cursor:pointer; border-left:1px solid var(--border-color); padding-left:1.5rem; transition:opacity .2s;" data-sbi-href="${profile.profileHref}" role="link" tabindex="0">
            <div style="text-align:right; display:flex; flex-direction:column; justify-content:center;">
              <p id="top-user-name" style="margin:0; font-weight:bold; font-size:.95rem; line-height:1.2;">Chargement...</p>
              <p id="top-user-level" style="margin:0; color:${profile.levelColor}; font-size:.75rem; font-weight:bold; line-height:1.2; margin-top:2px;">${profile.levelLabel}</p>
            </div>
            <div id="top-user-avatar" style="width:42px; height:42px; border-radius:50%; background:var(--bg-body); border:2px solid var(--border-color); overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-main); flex-shrink:0;"></div>
          </div>
        </div>
      </header>
    `;
    dispatchComponentMounted(this.localName, this);

    if (profile.searchMode === 'apprentice') this.initApprenticeSearch();
  }

  // Recherche tuteur : n'ouvre QUE les livrets des apprentis liés (tutorId ===
  // tuteur courant). Dépendances Firebase + booklet importées à la demande pour
  // ne pas alourdir les espaces élève/prof qui n'en ont pas besoin.
  initApprenticeSearch() {
    const input = this.querySelector('.tutor-apprentice-search');
    const results = this.querySelector('.tutor-apprentice-results');
    if (!input || !results) return;
    results.style.cssText = 'position:absolute; top:calc(100% + 6px); left:0; right:0; background:#fff; border:1px solid var(--border-color,#e5e7eb); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.12); z-index:1100; max-height:320px; overflow-y:auto; display:none;';

    let apprentis = [];
    let loaded = false;
    let escapeHtml = (s) => String(s ?? '');

    const render = (items) => {
      if (!items.length) {
        results.innerHTML = input.value.trim()
          ? '<div style="padding:.6rem .9rem; color:var(--text-muted,#9ca3af); font-size:.85rem;">Aucun apprenti lié.</div>'
          : '';
        results.style.display = input.value.trim() ? 'block' : 'none';
        return;
      }
      results.innerHTML = items.map((a) =>
        `<div data-sbi-href="/tutor/livret.html?id=${encodeURIComponent(a.id)}" role="link" tabindex="0" style="padding:.6rem .9rem; cursor:pointer; border-bottom:1px solid var(--border-color,#f0f0f0); color:var(--text-main,#1f2937); font-size:.9rem;">${escapeHtml(a.name)}</div>`
      ).join('');
      results.style.display = 'block';
    };

    const loadOnce = async (uid) => {
      if (loaded || !uid) return;
      loaded = true;
      try {
        const [{ db }, bookletData] = await Promise.all([
          import('/js/firebase-init.js'),
          import('/js/booklet/booklet-data.js?v=8.0P.167.304')
        ]);
        escapeHtml = bookletData.escapeHtml || escapeHtml;
        const list = await bookletData.loadBookletsForTutor({ db, tutorId: uid });
        apprentis = (list || []).map((b) => ({ id: b.id, name: b.studentName || b.id || 'Apprenti' }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }));
      } catch (_) {
        loaded = false;
      }
    };

    import('/js/firebase-init.js')
      .then(({ auth }) => import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js')
        .then(({ onAuthStateChanged }) => onAuthStateChanged(auth, (u) => { if (u) loadOnce(u.uid); })))
      .catch(() => {});

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { render([]); return; }
      render(apprentis.filter((a) => String(a.name).toLowerCase().includes(q)).slice(0, 8));
    });
    results.addEventListener('click', () => { results.style.display = 'none'; input.value = ''; });
    document.addEventListener('click', (e) => { if (!this.contains(e.target)) results.style.display = 'none'; });
  }
}

// Enregistre la paire de composants sous TOUS les tags de rôle existants.
// NB : `customElements.define` refuse le MÊME constructeur pour deux tags → on
// dérive une sous-classe vide (constructeur distinct) par tag. Le rôle reste lu
// sur this.localName, donc la logique partagée vit dans les classes de base.
export function registerRoleShell() {
  ['student', 'teacher', 'tutor'].forEach((role) => {
    defineOnce(`${role}-left-panel`, class extends SbiLeftPanel {});
    defineOnce(`${role}-top-bar`, class extends SbiTopBar {});
  });
}
