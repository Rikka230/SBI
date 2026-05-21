/** SBI 8.0P.167.141 - Retour viewer prioritaire via returnTo. */
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
function rememberReturnUrl(returnUrl) {
  if (!returnUrl) return;
  try { sessionStorage.setItem('sbi:viewer:returnTo', returnUrl); } catch {}
}
function installReturnBridge() {
  const returnUrl = getSafeReturnUrl();
  if (!returnUrl) return;
  rememberReturnUrl(returnUrl);
  const button = document.getElementById('btn-back-dynamic');
  if (!button) return;
  button.onclick = (event) => {
    event.preventDefault();
    window.location.href = returnUrl;
  };
}
window.addEventListener('sbi:course-viewer-mounted', installReturnBridge);
window.setTimeout(installReturnBridge, 80);
window.setTimeout(installReturnBridge, 300);
window.setTimeout(installReturnBridge, 900);
