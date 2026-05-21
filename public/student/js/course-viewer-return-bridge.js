function getSafeReturnUrl() {
  const params = new URL(window.location.href).searchParams;
  const raw = params.get('returnTo') || '';
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '';
    if (!url.pathname.startsWith('/student/') && !url.pathname.startsWith('/teacher/')) return '';
    if (url.pathname.endsWith('/cours-viewer.html')) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

function installReturnBridge() {
  const returnUrl = getSafeReturnUrl();
  if (!returnUrl) return;
  const button = document.getElementById('btn-back-dynamic');
  if (!button) return;
  button.onclick = (event) => {
    event.preventDefault();
    window.location.href = returnUrl;
  };
}

window.addEventListener('sbi:course-viewer-mounted', installReturnBridge);
window.setTimeout(installReturnBridge, 120);
window.setTimeout(installReturnBridge, 500);
window.setTimeout(installReturnBridge, 1200);
