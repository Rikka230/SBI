// SBI 8.0P.167.306 — Bottom-nav flottante (présentation mobile/tablette des espaces de rôle).
//
// Deuxième présentation du chrome de navigation, derrière le même *manifeste* que les
// panneaux PC (nav-manifest.js). S'auto-injecte dans <body> sur student/teacher/tutor
// (jamais admin), s'affiche en ≤1024px (CSS), et resynchronise l'onglet actif sur les
// navigations PJAX. Les `primary` (≤4) sont les onglets directs ; le reste va dans « Plus ».
//
// Style : public/admin/css/sbi-bottom-nav.css (injecté ici via <link>).

import { ICONS, defineOnce } from './shared-icons.js';
import { signOutToLogin } from './shared-actions.js';
import { NAV_BY_ROLE, isActive, primaryNav, overflowNav } from './nav-manifest.js?v=8.0P.167.306';

const BOTTOM_NAV_CSS = '/admin/css/sbi-bottom-nav.css?v=8.0P.167.315';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

function effectivePath() {
  try {
    return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin).pathname.toLowerCase();
  } catch (_) {
    return String(window.location.pathname || '').toLowerCase();
  }
}

function currentRole() {
  const p = effectivePath();
  if (p.startsWith('/student/')) return 'student';
  if (p.startsWith('/teacher/')) return 'teacher';
  if (p.startsWith('/tutor/')) return 'tutor';
  return null;
}

function injectStyles() {
  if (document.querySelector('link[data-sbi-bottom-nav]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = BOTTOM_NAV_CSS;
  link.setAttribute('data-sbi-bottom-nav', '1');
  document.head.appendChild(link);
}

class SbiBottomNav extends HTMLElement {
  connectedCallback() {
    this.render();
    this._onNav = () => this.syncActive();
    this._onResize = () => this.positionIndicator();
    window.addEventListener('sbi:app-shell:navigated', this._onNav);
    window.addEventListener('popstate', this._onNav);
    window.addEventListener('sbi:page-loaded', this._onNav);
    window.addEventListener('resize', this._onResize);
  }

  disconnectedCallback() {
    window.removeEventListener('sbi:app-shell:navigated', this._onNav);
    window.removeEventListener('popstate', this._onNav);
    window.removeEventListener('sbi:page-loaded', this._onNav);
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
  }

  render() {
    const role = currentRole();
    if (!role || !NAV_BY_ROLE[role]) { this.innerHTML = ''; this.dataset.role = ''; return; }
    this.dataset.role = role;

    const primary = primaryNav(role);
    const overflow = overflowNav(role);

    const items = primary.map((e) => `
      <a class="sbi-bn-item" data-sbi-href="${e.href}" href="${e.href}" data-id="${e.id}" role="link" aria-label="${e.label}">
        ${e.icon}<span class="sbi-bn-label">${e.label}</span>
      </a>`).join('');

    const sheetLinks = overflow.map((e) => `
      <a class="sbi-bn-sheet-item" data-sbi-href="${e.href}" href="${e.href}" data-id="${e.id}">
        ${e.icon}<span>${e.label}</span>
      </a>`).join('');

    this.innerHTML = `
      <div class="sbi-bn-sheet-backdrop" id="sbi-bn-backdrop"></div>
      <div class="sbi-bn-sheet" id="sbi-bn-sheet" role="dialog" aria-modal="true" aria-label="Plus d'options" aria-hidden="true">
        <div class="sbi-bn-sheet-grip"></div>
        ${sheetLinks}
        <button type="button" class="sbi-bn-sheet-item sbi-bn-sheet-logout" id="sbi-bn-logout">
          ${ICONS.logout}<span>Déconnexion</span>
        </button>
      </div>
      <nav class="sbi-bottom-nav" aria-label="Navigation principale">
        <span class="sbi-bn-indicator" aria-hidden="true"></span>
        ${items}
        <button type="button" class="sbi-bn-item sbi-bn-plus" id="sbi-bn-plus" aria-expanded="false" aria-haspopup="dialog" aria-label="Plus">
          ${PLUS_ICON}<span class="sbi-bn-label">Plus</span>
        </button>
      </nav>`;

    this.querySelector('#sbi-bn-plus')?.addEventListener('click', () => this.toggleSheet());
    this.querySelector('#sbi-bn-backdrop')?.addEventListener('click', () => this.toggleSheet(false));
    this.querySelector('#sbi-bn-logout')?.addEventListener('click', () => { this.toggleSheet(false); signOutToLogin(); });
    this.querySelectorAll('.sbi-bn-sheet-item[data-sbi-href]').forEach((a) => a.addEventListener('click', () => this.toggleSheet(false)));

    // L'indicateur doit être (re)positionné dès que la barre est réellement mise en page :
    // le CSS est chargé en <link> async, donc les offsets au premier rendu sont faux
    // (« étiré tout à droite »). Un ResizeObserver sur la barre corrige au bon moment.
    const nav = this.querySelector('.sbi-bottom-nav');
    if (nav && 'ResizeObserver' in window) {
      this._ro?.disconnect();
      this._ro = new ResizeObserver(() => this.positionIndicator());
      this._ro.observe(nav);
    }

    this.syncActive();
  }

  toggleSheet(force) {
    const sheet = this.querySelector('#sbi-bn-sheet');
    const backdrop = this.querySelector('#sbi-bn-backdrop');
    const plus = this.querySelector('#sbi-bn-plus');
    if (!sheet || !backdrop) return;
    const open = typeof force === 'boolean' ? force : !sheet.classList.contains('is-open');
    sheet.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    sheet.setAttribute('aria-hidden', String(!open));
    plus?.setAttribute('aria-expanded', String(open));
  }

  syncActive() {
    // Changement d'espace pendant une nav PJAX → on reconstruit.
    if (this.dataset.role && currentRole() !== this.dataset.role) { this.render(); return; }
    const role = this.dataset.role;
    if (!role) { this.render(); return; }

    const path = effectivePath();
    const entries = NAV_BY_ROLE[role] || [];
    let activeId = null;
    for (const e of entries) { if (isActive(path, e)) { activeId = e.id; break; } }
    const primaryIds = primaryNav(role).map((e) => e.id);

    this.querySelectorAll('.sbi-bn-item, .sbi-bn-sheet-item').forEach((el) => el.classList.remove('is-active'));

    if (activeId && primaryIds.includes(activeId)) {
      this.querySelector(`.sbi-bn-item[data-id="${activeId}"]`)?.classList.add('is-active');
    } else if (activeId) {
      // Page « overflow » active → on allume « Plus » + l'entrée dans la feuille.
      this.querySelector('#sbi-bn-plus')?.classList.add('is-active');
      this.querySelector(`.sbi-bn-sheet-item[data-id="${activeId}"]`)?.classList.add('is-active');
    }

    this.positionIndicator();
    this.toggleSheet(false);
  }

  positionIndicator() {
    const nav = this.querySelector('.sbi-bottom-nav');
    const ind = this.querySelector('.sbi-bn-indicator');
    if (!nav || !ind) return;
    // Barre non visible (desktop ≥1025px : display:none) → ne rien mesurer.
    if (!nav.offsetParent || nav.offsetWidth === 0) { ind.style.opacity = '0'; return; }
    const active = this.querySelector('.sbi-bn-item.is-active');
    if (!active) { ind.style.opacity = '0'; ind.style.width = '0px'; return; }
    ind.style.opacity = '1';
    ind.style.left = `${active.offsetLeft}px`;
    ind.style.width = `${active.offsetWidth}px`;
  }
}

function ensureMounted(attempt = 0) {
  if (!currentRole()) return;                         // pas un espace de rôle (ex. admin / public)
  if (document.querySelector('sbi-bottom-nav')) return;
  // On exige le chrome standard (skip les pages immersives type cours-viewer sans .app-container).
  if (!document.querySelector('.app-container')) {
    if (attempt < 3 && document.readyState !== 'complete') {
      document.addEventListener('DOMContentLoaded', () => ensureMounted(attempt + 1), { once: true });
    }
    return;
  }
  document.body.classList.add('sbi-bottom-nav-active');
  document.body.appendChild(document.createElement('sbi-bottom-nav'));
}

export function registerBottomNav() {
  if (!currentRole()) return; // jamais sur admin / public
  injectStyles();
  defineOnce('sbi-bottom-nav', SbiBottomNav);
  ensureMounted();
}
