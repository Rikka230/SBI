/**
 * SBI 8.0B - Admin page loader
 *
 * Charge une page admin externe dans le shell sans rechargement complet.
 * Les routes restent explicitement listées dans route-registry.js.
 */

const loadedStyleHrefs = new Set(
  Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map((link) => new URL(link.getAttribute('href'), window.location.href).href)
);

export async function fetchAdminDocument(url) {
  const response = await fetch(url.href, {
    credentials: 'same-origin',
    headers: { 'X-SBI-PJAX': '1' }
  });

  if (!response.ok) {
    throw new Error(`Chargement impossible (${response.status}) : ${url.pathname}`);
  }

  const html = await response.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

export function ensureDocumentStyles(doc, baseUrl = window.location.href) {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));

  links.forEach((link) => {
    const href = new URL(link.getAttribute('href'), baseUrl).href;
    if (loadedStyleHrefs.has(href)) return;

    const nextLink = document.createElement('link');
    nextLink.rel = 'stylesheet';
    nextLink.href = href;
    nextLink.setAttribute('data-sbi-pjax-style', 'true');
    document.head.appendChild(nextLink);
    loadedStyleHrefs.add(href);
  });
}

export function replaceMainFromDocument(doc) {
  const currentMain = document.querySelector('#main-content');
  const incomingMain = doc.querySelector('#main-content');

  if (!currentMain || !incomingMain) {
    throw new Error('Structure #main-content introuvable pour route PJAX.');
  }

  currentMain.replaceChildren(...Array.from(incomingMain.childNodes).map((node) => node.cloneNode(true)));

  window.dispatchEvent(new CustomEvent('sbi:app-shell:main-replaced', {
    detail: { main: currentMain }
  }));

  return currentMain;
}

export function updateAdminChromeFromDocument(doc, fallbackTitle = 'SBI Admin') {
  const incomingTitle = doc.querySelector('title')?.textContent?.trim();
  const incomingPageTitle = doc.querySelector('.top-bar .page-title')?.textContent?.trim();

  if (incomingTitle) {
    document.title = incomingTitle;
  } else {
    document.title = fallbackTitle;
  }

  const pageTitle = document.querySelector('.top-bar .page-title');
  if (pageTitle) {
    pageTitle.textContent = incomingPageTitle || fallbackTitle;
  }
}

export function setLeftNavActive(activeId) {
  const items = document.querySelectorAll('#left-panel .nav-item, #left-panel .admin-return-link');

  items.forEach((item) => {
    const isActive = item.id === activeId;
    item.classList.toggle('active', isActive);

    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  window.dispatchEvent(new CustomEvent('sbi:navigation-mutated'));
}
