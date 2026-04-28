export const AVATAR_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const ONLINE_TTL_MS = 90000;

export const SVG_RESET = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
export const SVG_EDIT = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

export function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizeList(items) {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

export function sortByTitle(a, b) {
  return String(a?.titre || '').localeCompare(String(b?.titre || ''), 'fr', { sensitivity: 'base' });
}

export function uniqueById(items) {
  const map = new Map();
  items.forEach((item) => { if (item?.id) map.set(item.id, item); });
  return Array.from(map.values());
}

export function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024 * 1024) return String(Math.max(1, Math.round(size / 1024))) + ' Ko';
  return String(Math.round((size / (1024 * 1024)) * 10) / 10) + ' Mo';
}

export function formatScore(value) {
  const score = Number(value) || 0;
  return Number.isInteger(score) ? String(score) : String(Math.round(score * 100) / 100);
}

export function parseGradeInput(value, maxScoreValue) {
  const raw = String(value || '').trim().replace(',', '.');
  const maxScore = Number(maxScoreValue);
  if (!raw) return null;

  let parsedScore = null;
  if (raw.includes('/')) {
    const parts = raw.split('/').map((part) => part.trim().replace(',', '.'));
    if (parts.length !== 2) return null;
    const numerator = Number(parts[0]);
    const denominator = Number(parts[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
    parsedScore = Number.isFinite(maxScore) && maxScore > 0 ? (numerator / denominator) * maxScore : numerator;
  } else {
    parsedScore = Number(raw);
  }

  if (!Number.isFinite(parsedScore)) return null;
  const roundedScore = Math.round(parsedScore * 100) / 100;
  if (roundedScore < 0) return null;
  if (Number.isFinite(maxScore) && maxScore > 0 && roundedScore > maxScore) return null;
  return roundedScore;
}

export function computeQuizMaxScore(chapter = {}) {
  if (!Array.isArray(chapter.questions) || chapter.questions.length === 0) return 0;
  return chapter.questions.reduce((sum, question) => {
    const points = Number(question?.points);
    return sum + (Number.isFinite(points) && points > 0 ? points : 1);
  }, 0);
}

export function getCourseChapterIds(courseData = {}) {
  if (!Array.isArray(courseData.chapitres)) return [];
  return courseData.chapitres.map((chapter) => chapter?.id).filter(Boolean);
}

export function getDisplayName(data = {}, fallback = 'Utilisateur SBI') {
  return `${data.prenom || ''} ${data.nom || ''}`.trim() || fallback;
}

export function getInitials(name = 'SBI') {
  return String(name || 'SBI').trim().charAt(0).toUpperCase() || 'S';
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForElements(ids, timeoutMs = 1200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ids.every((id) => document.getElementById(id))) return true;
    await sleep(50);
  }
  return false;
}

export async function waitForSbiComponents() {
  if (window.__SBI_COMPONENTS_READY === true) {
    await waitForElements(['top-user-name', 'top-user-avatar'], 1200);
    return;
  }

  if (window.SBI_COMPONENTS_READY && typeof window.SBI_COMPONENTS_READY.then === 'function') {
    await Promise.race([window.SBI_COMPONENTS_READY.catch(() => {}), sleep(1500)]);
  } else {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 1500);
      window.addEventListener('sbi:components-ready', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  await waitForElements(['top-user-name', 'top-user-avatar'], 1200);
}
