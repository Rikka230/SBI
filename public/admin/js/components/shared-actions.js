export async function signOutToLogin() {
  const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js');
  const auth = getAuth();
  await signOut(auth);
  window.location.href = '/login.html';
}

export function clearCacheAndReload() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}

export function goTo(url) {
  window.location.href = url;
}
