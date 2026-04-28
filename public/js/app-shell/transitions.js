/**
 * SBI 8.0A - App shell transitions
 */

const STYLE_ID = 'sbi-app-shell-style';
const BUSY_CLASS = 'sbi-app-shell-busy';
const READY_CLASS = 'sbi-app-shell-ready';

export function injectAppShellStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html.${READY_CLASS} body:not(.preload) #main-content .content-wrapper {
      transition: opacity 170ms ease, transform 170ms ease, filter 170ms ease;
    }

    body.${BUSY_CLASS} #main-content .content-wrapper {
      opacity: .42;
      transform: translateY(5px) scale(.998);
      filter: saturate(.92);
      pointer-events: none;
    }

    body.${BUSY_CLASS}::before {
      content: 'Navigation';
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      z-index: 8000;
      padding: .72rem 1rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, .86);
      border: 1px solid rgba(148, 163, 184, .28);
      color: #fff;
      font-size: .76rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      box-shadow: 0 16px 40px rgba(15, 23, 42, .22);
      backdrop-filter: blur(14px);
    }

    @media (prefers-reduced-motion: reduce) {
      html.${READY_CLASS} body:not(.preload) #main-content .content-wrapper,
      body.${BUSY_CLASS} #main-content .content-wrapper {
        transition: none;
        transform: none;
        filter: none;
      }
    }
  `;
  document.head.appendChild(style);
}

export function markAppShellReady() {
  document.documentElement.classList.add(READY_CLASS);
}

export function startShellTransition() {
  injectAppShellStyles();
  document.body.classList.add(BUSY_CLASS);
  document.body.setAttribute('aria-busy', 'true');
}

export function endShellTransition() {
  document.body.classList.remove(BUSY_CLASS);
  document.body.removeAttribute('aria-busy');
}
