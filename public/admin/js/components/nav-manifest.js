// SBI 8.0P.167.306 — Manifeste de navigation des espaces privés.
//
// SOURCE UNIQUE de l'ordre des onglets par rôle, ordonné par importance /
// fréquence d'usage (cf. CONTEXT.md « Ordre par importance »). Le même ordre
// est appliqué aux panneaux PC (*-panels.js). Les `primary:true` (max 4)
// alimentent la bottom-nav flottante mobile ; les autres vont dans « Plus ».
//
// Donnée PURE : pas d'effet de bord, pas de DOM. Consommé par la bottom-nav
// (et, à terme, par le Shell desktop unifié).

import { ICONS } from './shared-icons.js';

// Icônes spécifiques non présentes dans shared-icons (devoirs / livret / documents).
const ICON_DEVOIRS = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2 4 4h-4V4ZM8 13h8v2H8v-2Zm0 4h5v2H8v-2Zm0-8h3v2H8V9Z"/></svg>';
const ICON_LIVRET = '<svg viewBox="0 0 24 24"><path d="M4 4a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 0 2 2h10a1 1 0 0 0 1-1V5h1a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2H6a4 4 0 0 1-4-4V4Zm4 3h6v2H8V7Zm0 4h6v2H8v-2Z"/></svg>';
const ICON_DOCUMENTS = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm2 3v8h14v-8H5Z"/></svg>';
// Icônes admin (reprises de admin-panels.js) : promotions / cursus / élèves en retard.
const ICON_PROMOTIONS = '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v3h-2V5H7v14h3v2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4h4v2h-4V7Zm0 4h5v2h-5v-2Zm6.5 1A4.5 4.5 0 0 1 21 16.5c0 .84-.23 1.63-.63 2.3L22 20.43 20.43 22l-1.63-1.63A4.5 4.5 0 1 1 16.5 12Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>';
const ICON_CURSUS = '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a1 1 0 0 1-1.45.9L12 16.62 5.45 19.9A1 1 0 0 1 4 19V5Zm2 0v11.38l6-3 6 3V5H6Zm2 3h8v2H8V8Zm0 3h6v2H8v-2Z"/></svg>';
const ICON_LATE = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm.75-13h-1.5v6l5.25 3.15.75-1.23-4.5-2.67Z"/></svg>';

// Chaque entrée : { id, label, href, icon, match:[fragments de path], primary }
// `match` : l'entrée est active si le path courant contient l'un des fragments.
export const NAV_BY_ROLE = {
  student: [
    { id: 'hub',      label: 'Mon Hub',        href: '/student/dashboard.html',   icon: ICONS.dashboard,  match: ['/student/dashboard'],                  primary: true },
    { id: 'cours',    label: 'Mes Cours',      href: '/student/mes-cours.html',   icon: ICONS.formations, match: ['/student/mes-cours'],                   primary: true },
    { id: 'devoirs',  label: 'Mes Devoirs',    href: '/student/assignments.html', icon: ICON_DEVOIRS,     match: ['/student/assignments'],                primary: true },
    { id: 'lives',    label: 'Lives',          href: '/student/lives.html',       icon: ICONS.live,       match: ['/student/lives'],                      primary: true },
    { id: 'messagerie', label: 'Messagerie',   href: '/student/messagerie.html',  icon: ICONS.message,    match: ['/student/messagerie'],                 primary: false },
    { id: 'profil',   label: 'Mon Profil & XP', href: '/student/mon-profil.html', icon: ICONS.profile,    match: ['/student/mon-profil'],                 primary: false }
  ],
  teacher: [
    { id: 'espace',   label: 'Mon Espace',         href: '/teacher/dashboard.html',   icon: ICONS.dashboard,  match: ['/teacher/dashboard', 'teacherindex'], primary: true },
    { id: 'cours',    label: 'Formations & Cours', href: '/teacher/mes-cours.html',   icon: ICONS.formations, match: ['/teacher/mes-cours'],                 primary: true },
    { id: 'devoirs',  label: 'Devoirs & Évals',    href: '/teacher/assignments.html', icon: ICON_DEVOIRS,     match: ['/teacher/assignments'],               primary: true },
    { id: 'lives',    label: 'Lives',              href: '/teacher/lives.html',       icon: ICONS.live,       match: ['/teacher/lives'],                     primary: true },
    { id: 'messagerie', label: 'Messagerie',       href: '/teacher/messagerie.html',  icon: ICONS.message,    match: ['/teacher/messagerie'],                primary: false },
    { id: 'profil',   label: 'Mon Profil Public',  href: '/teacher/mon-profil.html',  icon: ICONS.profile,    match: ['/teacher/mon-profil'],                primary: false },
    { id: 'livrets',  label: 'Livrets',            href: '/teacher/livrets.html',     icon: ICON_LIVRET,      match: ['/teacher/livrets'],                   primary: false },
    { id: 'documents', label: 'Documents',         href: '/teacher/documents.html',   icon: ICON_DOCUMENTS,   match: ['/teacher/documents'],                 primary: false }
  ],
  tutor: [
    { id: 'dashboard', label: 'Tableau de bord', href: '/tutor/dashboard.html', icon: ICONS.dashboard,  match: ['/tutor/dashboard', '/tutor/livret'], primary: true },
    { id: 'documents', label: 'Documents',       href: '/tutor/documents.html', icon: ICONS.formations, match: ['/tutor/documents'],                  primary: true }
  ],
  // Admin (cockpit) : 4 primary directs, le reste + actions cockpit dans « Plus ».
  // Les entrées vers une VUE SPA d'index.html portent `tab` (cf. isActive).
  admin: [
    { id: 'dashboard',  label: 'Tableau de Bord',  href: '/admin/index.html?tab=view-dashboard',  icon: ICONS.dashboard,  tab: 'view-dashboard',  match: ['/admin/index'],                                  primary: true },
    { id: 'comptes',    label: 'Comptes',          href: '/admin/admin-accounts.html',            icon: ICONS.users,      match: ['/admin/admin-accounts', '/admin/admin-profile'], primary: true },
    { id: 'promotions', label: 'Promotions',       href: '/admin/admin-promotions.html',          icon: ICON_PROMOTIONS,  match: ['/admin/admin-promotions'],                       primary: true },
    { id: 'cursus',     label: 'Cursus',           href: '/admin/admin-cursus.html',              icon: ICON_CURSUS,      match: ['/admin/admin-cursus', '/admin/admin-lives'],     primary: true },
    { id: 'formations', label: 'Formations',       href: '/admin/index.html?tab=view-formations', icon: ICONS.formations, tab: 'view-formations', match: ['/admin/formations-cours', '/admin/admin-assignments'], primary: false },
    { id: 'late',       label: 'Élèves en retard', href: '/admin/admin-late-students.html',       icon: ICON_LATE,        match: ['/admin/admin-late-students'],                    primary: false },
    { id: 'annonces',   label: 'Annonces',         href: '/admin/admin-messagerie.html',          icon: ICONS.message,    match: ['/admin/admin-messagerie'],                       primary: false },
    { id: 'journal',    label: 'Journal admin',    href: '/admin/admin-audit-log.html',           icon: ICONS.bell,       match: ['/admin/admin-audit-log'],                        primary: false },
    { id: 'settings',   label: 'Serveur & Vidéos', href: '/admin/index.html?tab=view-settings',   icon: ICONS.settings,   tab: 'view-settings',   match: ['/admin/site-index-settings'],                    primary: false }
  ]
};

// Résolveur pur : l'entrée est-elle active pour cette route (path [+ ?search]) ?
// Les entrées admin vers une vue SPA portent `tab` → on compare le ?tab= courant
// (défaut `view-dashboard` sur /admin/index sans param). Sinon, match de fragments
// de path (rétro-compatible avec les entrées élève/prof/tuteur).
export function isActive(route = '', entry = {}) {
  const r = String(route || '').toLowerCase();
  const path = r.split('?')[0];
  const fragments = Array.isArray(entry.match) ? entry.match : [];
  const fragMatch = fragments.some((fragment) => path.includes(String(fragment).toLowerCase()));

  if (entry.tab) {
    if (path.includes('/admin/index')) {
      const m = r.match(/[?&]tab=([^&]+)/);
      const tab = m ? m[1] : 'view-dashboard';
      return tab === String(entry.tab).toLowerCase();
    }
    return fragMatch; // page dédiée mappée (ex. formations-cours.html)
  }
  return fragMatch;
}

// Onglets directs de la bottom-nav (les `primary`, max 4) pour un rôle donné.
export function primaryNav(role) {
  return (NAV_BY_ROLE[role] || []).filter((entry) => entry.primary).slice(0, 4);
}

// Onglets renvoyés dans la feuille « Plus » (les non-`primary`).
export function overflowNav(role) {
  return (NAV_BY_ROLE[role] || []).filter((entry) => !entry.primary);
}
