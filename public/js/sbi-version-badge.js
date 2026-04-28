/**
 * SBI 8.0C - Version badge
 *
 * Remplace l'ancien badge CSS figé par un badge piloté depuis sbi-version.js.
 */

import { SBI_VERSION, getSbiVersionLabel } from '/js/sbi-version.js';

const BADGE_ID = 'sbi-version-badge';
const STYLE_ID = 'sbi-version-badge-style';

function shouldShowVersionBadge() {
  const path = window.location.pathname.toLowerCase();
  return path.startsWith('/admin/')
    || path.startsWith('/student/')
    || path.startsWith('/teacher/');
}

function injectVersionBadgeStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.sbi-internal-ui::after {
      content: none !important;
      display: none !important;
    }

    #${BADGE_ID} {
      position: fixed;
      left: 12px;
      bottom: 10px;
      z-index: 2147483000;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: min(360px, calc(100vw - 24px));
      padding: 6px 9px;
      border: 1px solid color-mix(in srgb, var(--space-accent, var(--sbi-blue, #2A57FF)) 46%, transparent);
      background: rgba(5, 8, 18, 0.84);
      color: #ffffff;
      font-size: 10px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      pointer-events: none;
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%);
      box-shadow: 0 0 18px color-mix(in srgb, var(--space-accent, var(--sbi-blue, #2A57FF)) 20%, transparent);
      opacity: 0.92;
      white-space: nowrap;
    }

    #${BADGE_ID}::before {
      content: '';
      width: 6px;
      height: 6px;
      flex: 0 0 auto;
      background: var(--space-accent, var(--sbi-blue, #2A57FF));
      clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
      box-shadow: 0 0 10px color-mix(in srgb, var(--space-accent, var(--sbi-blue, #2A57FF)) 58%, transparent);
    }

    .app-container.left-collapsed ~ #${BADGE_ID},
    body:has(.app-container.left-collapsed) #${BADGE_ID} {
      opacity: 0.82;
    }

    @media (max-width: 768px) {
      #${BADGE_ID} {
        left: 8px;
        bottom: 8px;
        max-width: calc(100vw - 16px);
        font-size: 9px;
      }
    }
  `;

  document.head.appendChild(style);
}

function createOrGetBadge() {
  let badge = document.getElementById(BADGE_ID);

  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);
  }

  return badge;
}

function updateBadge() {
  if (!shouldShowVersionBadge()) return;

  injectVersionBadgeStyles();

  const badge = createOrGetBadge();
  const label = getSbiVersionLabel();

  badge.textContent = label;
  badge.title = `${label} · ${SBI_VERSION.branch}`;
  badge.dataset.sbiVersion = SBI_VERSION.version;
  badge.dataset.sbiBranch = SBI_VERSION.branch;
  badge.dataset.sbiChannel = SBI_VERSION.channel;

  document.body.dataset.sbiVersion = SBI_VERSION.version;
  document.body.dataset.sbiBranch = SBI_VERSION.branch;

  window.SBI_VERSION = SBI_VERSION;
}

export function initSbiVersionBadge() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateBadge, { once: true });
  } else {
    updateBadge();
  }

  window.addEventListener('sbi:app-shell:navigated', updateBadge);
  window.addEventListener('sbi:component-mounted', updateBadge);

  return {
    refresh: updateBadge,
    version: SBI_VERSION
  };
}
