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

// Chaque entrée : { id, label, href, icon, match:[fragments de path], primary }
// `match` : l'entrée est active si le path courant contient l'un des fragments.
export const NAV_BY_ROLE = {
  student: [
    { id: 'hub',      label: 'Mon Hub',        href: '/student/dashboard.html',   icon: ICONS.dashboard,  match: ['/student/dashboard'],                  primary: true },
    { id: 'cours',    label: 'Mes Cours',      href: '/student/mes-cours.html',   icon: ICONS.formations, match: ['/student/mes-cours'],                   primary: true },
    { id: 'devoirs',  label: 'Mes Devoirs',    href: '/student/assignments.html', icon: ICON_DEVOIRS,     match: ['/student/assignments'],                primary: true },
    { id: 'lives',    label: 'Lives',          href: '/student/lives.html',       icon: ICONS.live,       match: ['/student/lives'],                      primary: true },
    { id: 'profil',   label: 'Mon Profil & XP', href: '/student/mon-profil.html', icon: ICONS.profile,    match: ['/student/mon-profil'],                 primary: false }
  ],
  teacher: [
    { id: 'espace',   label: 'Mon Espace',         href: '/teacher/dashboard.html',   icon: ICONS.dashboard,  match: ['/teacher/dashboard', 'teacherindex'], primary: true },
    { id: 'cours',    label: 'Formations & Cours', href: '/teacher/mes-cours.html',   icon: ICONS.formations, match: ['/teacher/mes-cours'],                 primary: true },
    { id: 'devoirs',  label: 'Devoirs & Évals',    href: '/teacher/assignments.html', icon: ICON_DEVOIRS,     match: ['/teacher/assignments'],               primary: true },
    { id: 'lives',    label: 'Lives',              href: '/teacher/lives.html',       icon: ICONS.live,       match: ['/teacher/lives'],                     primary: true },
    { id: 'profil',   label: 'Mon Profil Public',  href: '/teacher/mon-profil.html',  icon: ICONS.profile,    match: ['/teacher/mon-profil'],                primary: false },
    { id: 'livrets',  label: 'Livrets',            href: '/teacher/livrets.html',     icon: ICON_LIVRET,      match: ['/teacher/livrets'],                   primary: false },
    { id: 'documents', label: 'Documents',         href: '/teacher/documents.html',   icon: ICON_DOCUMENTS,   match: ['/teacher/documents'],                 primary: false }
  ],
  tutor: [
    { id: 'dashboard', label: 'Tableau de bord', href: '/tutor/dashboard.html', icon: ICONS.dashboard,  match: ['/tutor/dashboard', '/tutor/livret'], primary: true },
    { id: 'documents', label: 'Documents',       href: '/tutor/documents.html', icon: ICONS.formations, match: ['/tutor/documents'],                  primary: true }
  ]
};

// Résolveur pur : l'entrée est-elle active pour ce path ?
export function isActive(route = '', entry = {}) {
  const path = String(route || '').toLowerCase();
  const fragments = Array.isArray(entry.match) ? entry.match : [];
  return fragments.some((fragment) => path.includes(String(fragment).toLowerCase()));
}

// Onglets directs de la bottom-nav (les `primary`, max 4) pour un rôle donné.
export function primaryNav(role) {
  return (NAV_BY_ROLE[role] || []).filter((entry) => entry.primary).slice(0, 4);
}

// Onglets renvoyés dans la feuille « Plus » (les non-`primary`).
export function overflowNav(role) {
  return (NAV_BY_ROLE[role] || []).filter((entry) => !entry.primary);
}
