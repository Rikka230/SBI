/**
 * =======================================================================
 * VIEWER - Mode focus, verrouillage linéaire et QCM intelligent + XP
 * =======================================================================
 *
 * 8.0M.1 : le viewer devient montable/démontable.
 * IMPORTANT : les routes viewer restent encore protégées en reload classique.
 * =======================================================================
 */

import { app, db, auth, storage } from '/js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDownloadURL, ref as storageRef } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { getUserLearningProgress, validateChapterProgress, startCourseProgress } from '/js/course-engine.js';

let currentUid = null;
let isAdminOrTeacher = false;
let currentUserRole = 'student';
let currentUserIsGod = false;
let currentUserCourseTimerBypass = false;
let isPreviewMode = false;
let courseData = null;
let currentChapterIndex = -1;
let userProgress = { courses: {} };
let timerInterval = null;
let activeViewerCleanup = null;

const SECONDS_PER_MINUTE = 60;

// Banque de SVGs
const SVG_DONE = `<svg width="16" height="16" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
const SVG_QUIZ = `<svg width="16" height="16" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`;
const SVG_FILL_BLANK = `<svg width="16" height="16" fill="var(--accent-blue)" viewBox="0 0 24 24"><path d="M4 5h16v2H4V5zm0 6h8v2H4v-2zm10 0h6v2h-6v-2zM4 17h4v2H4v-2zm6 0h10v2H10v-2z"/></svg>`;
const SVG_READ = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`;
const SVG_LOCK = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`;
const SVG_TIME = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 8px;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;
const SVG_NEXT = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`;
const SVG_DOWNLOAD = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>`;
const PEDAGOGIC_CHAPTER_TYPES = new Set(['resource', 'assignment', 'checkpoint', 'case_study']);
const OBJECTIVES_CHAPTER_ID = 'course-objectives';
const functionsInstance = getFunctions(app, 'europe-west1');
const resolveCourseResourceDownload = httpsCallable(functionsInstance, 'resolveCourseResourceDownload');

function getEffectiveViewerUrl() {
    return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function resetViewerState() {
    clearViewerTimer();
    currentUid = null;
    isAdminOrTeacher = false;
    currentUserRole = 'student';
    currentUserIsGod = false;
    currentUserCourseTimerBypass = false;
    isPreviewMode = false;
    courseData = null;
    currentChapterIndex = -1;
    userProgress = { courses: {} };

    document.querySelectorAll('.sbi-preview-banner[data-sbi-viewer-banner="true"]').forEach((banner) => banner.remove());
}

function clearViewerTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function showViewerError(message = 'Erreur de connexion. Veuillez recharger.') {
    const main = document.getElementById('viewer-main-content');
    if (main) {
        main.innerHTML = `<p style="color:var(--accent-red); padding:2rem;">${message}</p>`;
    }
}

export function mountCourseViewer({ source = 'standard' } = {}) {
    activeViewerCleanup?.({ reason: 'remount' });
    resetViewerState();

    let disposed = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (disposed) return;

        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        currentUid = user.uid;

        try {
            const snap = await getDoc(doc(db, "users", currentUid));
            if (disposed) return;

            if (snap.exists()) {
                const uData = snap.data();
                currentUserRole = uData.role || 'student';
                currentUserIsGod = uData.isGod === true;
                currentUserCourseTimerBypass = uData.courseTimerBypass === true || uData.trainingTimerBypass === true;
                isAdminOrTeacher = (currentUserRole === 'admin' || currentUserRole === 'teacher' || currentUserIsGod);
            }

            await initViewer();

            if (!disposed) {
                window.dispatchEvent(new CustomEvent('sbi:course-viewer-mounted', {
                    detail: { source, uid: currentUid, role: currentUserRole, preview: isPreviewMode }
                }));
            }
        } catch (error) {
            if (disposed) return;
            console.error("Erreur critique :", error);
            showViewerError();
        }
    });

    const cleanup = () => {
        disposed = true;
        clearViewerTimer();
        unsubscribeAuth?.();

        const backButton = document.getElementById('btn-back-dynamic');
        if (backButton) backButton.onclick = null;

        if (activeViewerCleanup === cleanup) {
            activeViewerCleanup = null;
        }
    };

    activeViewerCleanup = cleanup;
    return cleanup;
}

function autoMountCourseViewer() {
    if (window.__SBI_APP_SHELL_MOUNTING_COURSE_VIEWER) return;
    if (!document.getElementById('viewer-main-content')) return;
    mountCourseViewer({ source: 'auto' });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountCourseViewer, { once: true });
} else {
    autoMountCourseViewer();
}

function isTeacherViewerPage() {
    return getEffectiveViewerUrl().pathname.startsWith('/teacher/');
}

function getDefaultBackUrl(formId = '') {
    if (isTeacherViewerPage()) {
        return '/teacher/mes-cours.html';
    }

    if (currentUserRole === 'admin' || currentUserIsGod) {
        return '/admin/formations-cours.html';
    }

    const query = formId ? `?formId=${encodeURIComponent(formId)}` : '';
    return `/student/mes-cours.html${query}`;
}

function getSafeReferrerUrl() {
    if (!document.referrer) return '';

    try {
        const referrerUrl = new URL(document.referrer);

        if (referrerUrl.origin !== window.location.origin) return '';
        if (referrerUrl.pathname.endsWith('/cours-viewer.html')) return '';

        return `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;
    } catch (error) {
        return '';
    }
}

function leaveViewer(formId = '') {
    const fallbackUrl = getSafeReferrerUrl() || getDefaultBackUrl(formId);

    if (isPreviewMode && window.opener && !window.opener.closed) {
        window.close();

        setTimeout(() => {
            if (!window.closed) {
                window.location.href = fallbackUrl;
            }
        }, 150);

        return;
    }

    window.location.href = fallbackUrl;
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

// 8.0P.167.248 (audit S5) : le contenu HTML riche des chapitres (Quill) est stocké en
// base et peut contenir du HTML arbitraire. On l'assainit via DOMPurify avant injection
// dans innerHTML pour bloquer le XSS stocké. Fallback sûr (échappement) si DOMPurify
// n'a pas chargé.
function sanitizeRichHtml(value = '') {
    const html = String(value == null ? '' : value);
    if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    return escapeHtml(html);
}

function normalizeAnswerText(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[\u2019\u2018`]/g, "'")
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function splitAcceptedAnswers(blank = {}) {
    const answers = Array.isArray(blank.answers)
        ? blank.answers
        : String(blank.answers || blank.token || '').split(';');

    return answers
        .map((answer) => String(answer || '').trim())
        .filter(Boolean);
}

function extractFillBlankTokens(prompt = '') {
    return [...String(prompt).matchAll(/\[\[([^\]]+)\]\]/g)]
        .map((match) => String(match[1] || '').trim())
        .filter(Boolean);
}

function normalizeFillBlankRows(chapter = {}) {
    const existingBlanks = Array.isArray(chapter.blanks) ? chapter.blanks : [];
    const promptTokens = extractFillBlankTokens(chapter.prompt || '');

    if (promptTokens.length) {
        return promptTokens.map((token, index) => {
            const blank = existingBlanks.find((item) => normalizeAnswerText(item?.token) === normalizeAnswerText(token))
                || existingBlanks[index]
                || {};

            return {
                id: blank.id || `blank-${index}`,
                token,
                answers: blank.answers || blank.token || token,
                points: Number(blank.points || 1)
            };
        });
    }

    if (existingBlanks.length) {
        return existingBlanks.map((blank, index) => ({
            id: blank.id || `blank-${index}`,
            token: blank.token || '',
            answers: blank.answers || blank.token || '',
            points: Number(blank.points || 1)
        }));
    }

    return [];
}

function getFillBlankTotalPoints(chapter = {}) {
    return normalizeFillBlankRows(chapter).reduce((total, blank) => total + Number(blank.points || 0), 0);
}

function getChapterMaxScore(chapter = {}) {
    const type = chapter.type || chapter.activityType;
    if (type === 'quiz') {
        return (Array.isArray(chapter.questions) ? chapter.questions : []).reduce((total, question) => {
            const points = Number(question?.points);
            return total + (Number.isFinite(points) && points > 0 ? points : 1);
        }, 0);
    }
    if (isFillBlankChapter(chapter)) return getFillBlankTotalPoints(chapter);
    if (type === 'checkpoint') {
        const score = Number(chapter.checkpointScore ?? chapter.xpReward ?? chapter.maxScore ?? chapter.score ?? 10);
        return Number.isFinite(score) && score > 0 ? score : 10;
    }
    const score = Number(chapter.maxScore ?? chapter.score ?? 0);
    return Number.isFinite(score) && score > 0 ? score : 0;
}

function getChapterWaitSeconds(chapter = {}) {
    const minutes = Number(chapter.durationMinutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.ceil(minutes * SECONDS_PER_MINUTE);
}

function formatWaitSeconds(seconds = 0) {
    const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const rest = safeSeconds % 60;
    if (minutes <= 0) return `${rest}s`;
    if (rest <= 0) return `${minutes} min`;
    return `${minutes} min ${rest}s`;
}

function isFillBlankChapter(chapter = {}) {
    return chapter.type === 'fill_blank'
        || chapter.activityType === 'fill_blank'
        || (Array.isArray(chapter.blanks) && typeof chapter.prompt === 'string');
}

function getChapterIcon(chapter = {}) {
    if (chapter.type === 'quiz') return SVG_QUIZ;
    if (isFillBlankChapter(chapter)) return SVG_FILL_BLANK;
    return SVG_READ;
}

function isPedagogicChapter(chapter = {}) {
    return PEDAGOGIC_CHAPTER_TYPES.has(chapter.type || chapter.activityType);
}

function isCheckpointChapter(chapter = {}) {
    return (chapter.type || chapter.activityType) === 'checkpoint';
}

function isObjectivesChapter(chapter = {}) {
    return chapter.type === 'objectives';
}

function normalizeLegacyFillBlankContent(chapter = {}) {
    if (typeof document === 'undefined' || !chapter.contenu || !String(chapter.contenu).includes('<mark')) {
        return null;
    }

    const template = document.createElement('template');
    template.innerHTML = String(chapter.contenu);
    const marks = Array.from(template.content.querySelectorAll('mark'));
    if (!marks.length) return null;

    const blanks = marks.map((mark, index) => {
        const token = mark.textContent.trim();
        mark.replaceWith(document.createTextNode(`[[${token}]]`));
        return {
            id: `legacy-blank-${index}`,
            token,
            answers: token,
            points: 1
        };
    });

    const promptNode = template.content.querySelector('div:last-child') || template.content;

    return {
        ...chapter,
        type: 'fill_blank',
        activityType: 'fill_blank',
        instructions: chapter.instructions || template.content.querySelector('p')?.textContent?.trim() || '',
        prompt: chapter.prompt || promptNode.textContent.trim(),
        blanks
    };
}

function convertBlockToViewerChapter(block = {}, index = 0) {
    if (block.type === 'quiz') {
        return {
            id: block.id || `quiz-${index}`,
            type: 'quiz',
            titre: block.title || block.titre || `QCM ${index + 1}`,
            durationMinutes: Number(block.durationMinutes || 5),
            questions: Array.isArray(block.questions) ? block.questions.map((question) => ({
                ...question,
                options: Array.isArray(question.options) ? question.options : [],
                correctIndices: Array.isArray(question.correctIndices) ? question.correctIndices : []
            })) : []
        };
    }

    if (block.type === 'fill_blank') {
        return {
            id: block.id || `fill-blank-${index}`,
            type: 'fill_blank',
            activityType: 'fill_blank',
            titre: block.title || block.titre || `Texte à trous ${index + 1}`,
            instructions: block.instructions || '',
            prompt: block.prompt || '',
            blanks: normalizeFillBlankRows(block),
            scoringMode: block.scoringMode || 'per_blank',
            maxAttempts: Number(block.maxAttempts || 2),
            showAnswersAtEnd: block.showAnswersAtEnd !== false,
            feedbackCorrect: block.feedbackCorrect || '',
            feedbackIncorrect: block.feedbackIncorrect || '',
            durationMinutes: Number(block.durationMinutes || 8)
        };
    }

    if (PEDAGOGIC_CHAPTER_TYPES.has(block.type)) {
        return {
            ...block,
            id: block.id || `${block.type}-${index}`,
            type: block.type,
            activityType: block.type,
            titre: block.title || block.titre || getPedagogicChapterLabel(block.type),
            durationMinutes: Number(block.durationMinutes || 10),
            correctionMode: block.type === 'assignment' || block.type === 'case_study' ? 'self' : block.correctionMode,
            manualValidation: block.type === 'assignment' ? false : block.manualValidation,
            teacherSubmissionPlanned: block.type === 'assignment' || block.type === 'case_study' ? true : block.teacherSubmissionPlanned,
            maxScore: Number(block.maxScore || block.score || (block.type === 'checkpoint' ? 10 : 0)),
            checkpointScore: Number(block.checkpointScore || block.xpReward || (block.type === 'checkpoint' ? 10 : 0)),
            xpReward: Number(block.xpReward || block.checkpointScore || (block.type === 'checkpoint' ? 10 : 0))
        };
    }

    return {
        id: block.id || `lesson-${index}`,
        type: 'text',
        titre: block.title || block.titre || `Leçon ${index + 1}`,
        contenu: block.content || block.contenu || block.instructions || '',
        mediaType: block.mediaType || 'image',
        mediaImage: block.mediaImage || block.imageUrl || '',
        mediaVideo: block.mediaVideo || block.videoUrl || '',
        durationMinutes: Number(block.durationMinutes || 15)
    };
}

function buildObjectivesChapter(course = {}) {
    return {
        id: OBJECTIVES_CHAPTER_ID,
        type: 'objectives',
        activityType: 'objectives',
        titre: 'Objectifs du cours',
        courseTitle: course.titre || course.title || '',
        objectives: course.objectives || '',
        competency: course.competency || '',
        qualiopiEvidence: course.qualiopiEvidence || '',
        estimatedDurationMinutes: Number(course.estimatedDurationMinutes || 0),
        durationMinutes: 0
    };
}

function getViewerChapters(course = {}) {
    const objectivesChapter = buildObjectivesChapter(course);

    if (Array.isArray(course.learningBlocks) && course.learningBlocks.length) {
        const chapters = course.learningBlocks
            .filter((block) => block.visibleInProgram !== false)
            .map(convertBlockToViewerChapter);
        return [objectivesChapter, ...chapters];
    }

    const chapters = (Array.isArray(course.chapitres) ? course.chapitres : [])
        .filter((chapter) => chapter.visibleInProgram !== false)
        .map((chapter) => normalizeLegacyFillBlankContent(chapter) || chapter);
    return [objectivesChapter, ...chapters];
}

function getPedagogicChapterLabel(type = '') {
    if (type === 'resource') return 'Ressource';
    if (type === 'assignment') return 'Devoir';
    if (type === 'checkpoint') return 'Checkpoint';
    if (type === 'case_study') return 'Étude de cas';
    return 'Activité';
}

function formatViewerBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${value} o`;
    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} Ko`;
    return `${(kb / 1024).toFixed(2)} Mo`;
}

function renderObjectivesChapter(chapter = {}) {
    return `
        <div class="text-container sbi-viewer-objectives-card">
            <div class="sbi-viewer-activity-label">${SVG_READ}<span>Objectifs</span></div>
            <div class="sbi-objectives-grid">
                ${renderViewerText('Cours', chapter.courseTitle)}
                ${renderViewerText('Objectifs pedagogiques', chapter.objectives || 'Les objectifs seront precises par le professeur.')}
                ${renderViewerLine('Competence principale', chapter.competency)}
                ${renderViewerLine('Duree estimee', chapter.estimatedDurationMinutes ? `${chapter.estimatedDurationMinutes} min` : '')}
                ${renderViewerLine('Preuve Qualiopi', chapter.qualiopiEvidence)}
            </div>
        </div>`;
}

function getFallbackCheckpointItems() {
    return courseData.chapitres
        .slice(0, Math.max(0, currentChapterIndex))
        .filter((chapter) => !isObjectivesChapter(chapter) && !isCheckpointChapter(chapter))
        .map((chapter, index) => ({
            id: chapter.id || `step-${index}`,
            title: chapter.titre || `Etape ${index + 1}`,
            type: chapter.type || chapter.activityType || 'lesson'
        }));
}

function getCheckpointItems(chapter = {}) {
    if (Array.isArray(chapter.checkpointItems) && chapter.checkpointItems.length) {
        return chapter.checkpointItems;
    }
    return getFallbackCheckpointItems();
}

function renderCheckpointChecklist(chapter = {}) {
    const items = getCheckpointItems(chapter);
    if (!items.length) {
        return '<p class="sbi-viewer-instructions">Aucune etape precedente a confirmer.</p>';
    }

    return `
        <div class="sbi-viewer-checkpoint-list">
            ${items.map((item, index) => `
                <label>
                    <input type="checkbox" class="sbi-checkpoint-acquis" data-checkpoint-item="${escapeHtml(item.id || `step-${index}`)}">
                    <span>${index + 1}. ${escapeHtml(item.title || `Etape ${index + 1}`)}</span>
                </label>
            `).join('')}
        </div>`;
}

function renderViewerLine(label, value) {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) return '';
    return `<div class="sbi-viewer-line"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(cleanValue)}</span></div>`;
}

function renderViewerText(label, value) {
    const cleanValue = cleanViewerText(value);
    if (!cleanValue) return '';
    return `<section class="sbi-viewer-section"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(cleanValue).replace(/\n/g, '<br>')}</p></section>`;
}

function sanitizeDownloadFileName(value = '') {
    return String(value || '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

function firstCleanString(values = []) {
    return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function normalizeViewerStoragePath(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('gs://')) {
        return raw.replace(/^gs:\/\/[^/]+\//, '');
    }
    return raw;
}

function getResourceDownloadUrl(chapter = {}) {
    return firstCleanString([
        chapter.resourceUrl,
        chapter.resourceDownloadUrl,
        chapter.downloadUrl,
        chapter.downloadURL,
        chapter.fileUrl,
        chapter.fileURL,
        chapter.url,
        chapter.storageUrl,
        chapter.resourceFile?.url,
        chapter.file?.url
    ]);
}

function getResourceDirectUrl(chapter = {}) {
    const url = getResourceDownloadUrl(chapter);
    return url.startsWith('gs://') ? '' : url;
}

function getResourceStoragePath(chapter = {}) {
    const explicitPath = firstCleanString([
        chapter.resourceStoragePath,
        chapter.storagePath,
        chapter.fileStoragePath,
        chapter.resourceFile?.storagePath,
        chapter.file?.storagePath
    ]);
    if (explicitPath) return normalizeViewerStoragePath(explicitPath);

    const url = getResourceDownloadUrl(chapter);
    return url.startsWith('gs://') ? normalizeViewerStoragePath(url) : '';
}

function renderResourceDownloadLink(chapter = {}) {
    const resourceUrl = getResourceDirectUrl(chapter);
    const storagePath = getResourceStoragePath(chapter);
    const fileName = sanitizeDownloadFileName(chapter.resourceFileName || '');
    const label = fileName || 'la ressource';
    if (!resourceUrl && !storagePath && !fileName) return '';

    const downloadAttr = fileName ? ` download="${escapeHtml(fileName)}"` : ' download';

    return `
        <a class="sbi-viewer-resource-link sbi-viewer-resource-download"
           href="${escapeHtml(resourceUrl || '#')}"
           target="_blank"
           rel="noopener noreferrer"
           data-viewer-resource-download="true"
           data-resource-url="${escapeHtml(resourceUrl)}"
           data-resource-storage-path="${escapeHtml(storagePath)}"
           data-resource-filename="${escapeHtml(fileName)}"
           data-resource-chapter-id="${escapeHtml(chapter.id || '')}"
           ${downloadAttr}
           aria-label="Telecharger ${escapeHtml(label)}">
            ${SVG_DOWNLOAD}
            <span>Telecharger ${escapeHtml(label)}</span>
        </a>
    `;
}

function triggerViewerDownload(url = '', fileName = '') {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;

    const anchor = document.createElement('a');
    anchor.href = safeUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    if (fileName) anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

async function resolveViewerResourceViaServer({ chapterId = '', fileName = '', storagePath = '' } = {}) {
    const result = await resolveCourseResourceDownload({
        courseId: courseData?.id || '',
        chapterId,
        fileName,
        storagePath
    });
    return String(result?.data?.url || '').trim();
}

function bindResourceDownloadControls(root = document) {
    root.querySelectorAll('[data-viewer-resource-download]').forEach((link) => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const control = event.currentTarget;
            const fileName = sanitizeDownloadFileName(control.dataset.resourceFilename || '');
            let url = String(control.dataset.resourceUrl || '').trim();
            const storagePath = normalizeViewerStoragePath(control.dataset.resourceStoragePath || '');
            const chapterId = String(control.dataset.resourceChapterId || '').trim();

            control.classList.add('is-loading');
            try {
                if (!url && storagePath) {
                    try {
                        url = await getDownloadURL(storageRef(storage, storagePath));
                    } catch (storageError) {
                        console.warn('[SBI Viewer] Resolution Storage directe impossible, fallback serveur :', storageError);
                    }
                }
                if (!url) {
                    url = await resolveViewerResourceViaServer({ chapterId, fileName, storagePath });
                }
                if (url) {
                    control.dataset.resourceUrl = url;
                    control.href = url;
                }
                if (!url) throw new Error('Lien de telechargement introuvable.');
                triggerViewerDownload(url, fileName);
            } catch (error) {
                console.error('[SBI Viewer] Telechargement ressource impossible :', error);
                alert(error?.message || 'Telechargement impossible. Recharge la page puis reessaie.');
            } finally {
                control.classList.remove('is-loading');
            }
        });
    });
}

function cleanViewerText(value = '') {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    if (/<[a-z][\s\S]*>/i.test(rawValue) && typeof document !== 'undefined') {
        const template = document.createElement('template');
        template.innerHTML = rawValue;
        const plainText = template.content.textContent?.replace(/\s+/g, ' ').trim();
        return plainText || rawValue;
    }

    return rawValue;
}

function renderSelfAssessmentBlock({ correction = '', type = 'assignment' } = {}) {
    const correctionText = cleanViewerText(correction) || 'Aucune correction n’a encore été renseignée pour ce bloc.';
    const targetId = `self-assess-${type}-${currentChapterIndex}`;

    return `
        <div class="sbi-viewer-self-assessment">
            <p>Travaille sur une feuille ou dans ton propre document, puis compare ton travail avec la correction quand tu es prêt.</p>
            <button class="sbi-viewer-self-assessment-btn" type="button" data-self-assess-target="${escapeHtml(targetId)}">M’auto-évaluer</button>
            <section id="${escapeHtml(targetId)}" class="sbi-viewer-self-assessment-correction" hidden>
                <h3>Correction / auto-evaluation</h3>
                <p>${escapeHtml(correctionText).replace(/\n/g, '<br>')}</p>
            </section>
        </div>
    `;
}

function bindAutonomousEvaluationControls(root = document) {
    root.querySelectorAll('[data-self-assess-target]').forEach((button) => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.selfAssessTarget || '');
            if (!target) return;
            target.hidden = false;
            button.hidden = true;
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });
}


function renderPedagogicChapter(chapter = {}) {
    const type = chapter.type || chapter.activityType;
    const label = getPedagogicChapterLabel(type);
    const instructions = chapter.instructions
        ? `<p class="sbi-viewer-instructions">${escapeHtml(chapter.instructions)}</p>`
        : '';
    let body = '';

    if (type === 'resource') {
        const link = renderResourceDownloadLink(chapter);
        const resourceUrl = getResourceDirectUrl(chapter);
        const fileMeta = [
            chapter.resourceFileName || '',
            formatViewerBytes(chapter.resourceSize),
            chapter.resourceCompressed ? 'image compressee' : ''
        ].filter(Boolean).join(' - ');
        const imagePreview = resourceUrl && (chapter.resourceType === 'image' || String(chapter.resourceMimeType || '').startsWith('image/'))
            ? `<img class="sbi-viewer-resource-image" src="${escapeHtml(resourceUrl)}" alt="${escapeHtml(chapter.resourceFileName || 'Ressource')}">`
            : '';
        body = `
            ${renderViewerLine('Type de ressource', chapter.resourceType || 'link')}
            ${renderViewerLine('Fichier', fileMeta)}
            ${imagePreview}
            ${link}
            ${renderViewerText('Description', chapter.resourceDescription || chapter.contenu)}
            ${renderViewerText('A observer / retenir', chapter.consultationInstruction)}
        `;
    } else if (type === 'assignment') {
        body = `
            ${renderViewerText('Travail demande', chapter.assignmentPrompt || chapter.contenu)}
            ${renderViewerText('Criteres evaluation', chapter.evaluationCriteria)}
            ${renderSelfAssessmentBlock({ correction: chapter.assignmentCorrection || chapter.evaluationCriteria, type })}
        `;
    } else if (type === 'checkpoint') {
        body = `
            ${renderViewerLine('Bonus validation', `+${getChapterMaxScore(chapter)} XP`)}
            ${renderViewerText('Objectif', chapter.checkpointGoal || chapter.contenu)}
            ${renderCheckpointChecklist(chapter)}
            ${renderViewerText('Resultat attendu', chapter.expectedResult)}
        `;
    } else if (type === 'case_study') {
        body = `
            ${renderViewerText('Contexte', chapter.caseContext)}
            ${renderViewerText('Scenario', chapter.scenario || chapter.contenu)}
            ${renderViewerText('Elements a analyser', chapter.analysisMaterials)}
            ${renderViewerText('Questions guidees', chapter.guidedQuestions)}
            ${renderSelfAssessmentBlock({ correction: chapter.expectedAnswer, type })}
        `;
    }

    return `
        <div class="text-container sbi-viewer-activity-card" data-activity-type="${escapeHtml(type)}">
            <div class="sbi-viewer-activity-label">${SVG_READ}<span>${escapeHtml(label)}</span></div>
            ${instructions}
            <div class="sbi-viewer-activity-body">${body || '<p class="sbi-viewer-instructions">Activite a completer.</p>'}</div>
        </div>`;
}

function renderFillBlankPrompt(prompt = '', blanks = []) {
    const source = String(prompt || '');
    if (!source.trim()) {
        return '<span class="fib-viewer-empty">Aucun texte à compléter.</span>';
    }

    let html = '';
    let cursor = 0;
    let blankIndex = 0;
    const regex = /\[\[([^\]]+)\]\]/g;
    let match = regex.exec(source);

    while (match) {
        html += escapeHtml(source.slice(cursor, match.index));
        const blank = blanks[blankIndex] || { id: `blank-${blankIndex}`, points: 1 };
        html += `
            <span class="fib-viewer-blank" data-fib-wrapper="${blankIndex}">
                <input
                    id="fib_input_${blankIndex}"
                    class="fib-viewer-input"
                    data-fib-index="${blankIndex}"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="Réponse ${blankIndex + 1}">
            </span>`;
        cursor = match.index + match[0].length;
        blankIndex += 1;
        match = regex.exec(source);
    }

    html += escapeHtml(source.slice(cursor));
    return html;
}

function renderFillBlankChapter(chapter = {}) {
    const blanks = normalizeFillBlankRows(chapter);
    const instructions = chapter.instructions
        ? `<p class="fib-viewer-instructions">${escapeHtml(chapter.instructions)}</p>`
        : '';

    return `
        <div class="text-container fib-viewer-card">
            <div class="fib-viewer-label">${SVG_FILL_BLANK}<span>Texte à trous</span></div>
            ${instructions}
            <div id="fib-form" class="fib-viewer-prompt">${renderFillBlankPrompt(chapter.prompt, blanks)}</div>
            <div class="fib-viewer-meta">${blanks.length} blanc(s) · ${getFillBlankTotalPoints(chapter)} point(s)</div>
            <div id="fib-result-box" class="quiz-result-box fib-result-box"></div>
        </div>`;
}

async function initViewer() {
    const urlParams = getEffectiveViewerUrl().searchParams;
    const courseId = urlParams.get('id');

    isPreviewMode = urlParams.get('preview') === 'true';

    if (isPreviewMode && !document.querySelector('.sbi-preview-banner[data-sbi-viewer-banner="true"]')) {
        document.body.insertAdjacentHTML('afterbegin', `<div class="sbi-preview-banner" data-sbi-viewer-banner="true">MODE PRÉVISUALISATION - Aucune donnée d'apprentissage ne sera sauvegardée.</div>`);
    }

    if(!courseId) return window.location.replace(getDefaultBackUrl());

    const cSnap = await getDoc(doc(db, "courses", courseId));
    if(!cSnap.exists()) {
        showViewerError('Cours introuvable ou supprimé.');
        return;
    }

    courseData = { id: cSnap.id, ...cSnap.data() };
    courseData.chapitres = getViewerChapters(courseData);

    if (!courseData.chapitres.length) {
        showViewerError('Ce cours ne contient aucun bloc visible.');
        return;
    }

    document.getElementById('viewer-course-title').textContent = courseData.titre;

    const formId = (courseData.formations && courseData.formations.length > 0) ? courseData.formations[0] : '';
    document.getElementById('btn-back-dynamic').onclick = (event) => {
        event.preventDefault();
        leaveViewer(formId);
    };

    if (!isPreviewMode) {
        userProgress = await startCourseProgress(currentUid, courseData.id);
        if (!userProgress) userProgress = await getUserLearningProgress(currentUid);
    }

    if (!userProgress.courses) userProgress.courses = {};
    if (!userProgress.courses[courseData.id]) {
        userProgress.courses[courseData.id] = { status: 'todo', completedChapters: [] };
    }
    if (!userProgress.courses[courseData.id].completedChapters) {
        userProgress.courses[courseData.id].completedChapters = [];
    }

    renderSidebar();

    let nextUnfinishedIndex = courseData.chapitres.findIndex(c => !userProgress.courses[courseData.id].completedChapters.includes(c.id));
    if (nextUnfinishedIndex === -1) nextUnfinishedIndex = 0;

    loadChapter(nextUnfinishedIndex);
}

// ── 8.0P.167.316 — Barre de lecture flottante (mobile ≤1024px) ───────────────
// Plein écran de lecture + capsule « ‹ Préc · ☰ Sommaire · Suiv › ». La feuille
// « Sommaire » réutilise la sidebar (#chapters-nav-list) telle quelle ; les
// onglets gardent leur onclick→loadChapter. Styles : viewer.css.
const VIEWER_BAR_ID = 'sbi-viewer-bar';

function closeViewerSheet() {
    document.body.classList.remove('sbi-viewer-sheet-open');
}

// Le chapitre suivant est-il déverrouillé ? (même règle que renderSidebar)
function isNextChapterUnlocked() {
    if (!courseData || !Array.isArray(courseData.chapitres)) return false;
    const nextIndex = currentChapterIndex + 1;
    if (nextIndex >= courseData.chapitres.length) return false;
    if (isAdminOrTeacher || isPreviewMode) return true;
    const completed = userProgress.courses?.[courseData.id]?.completedChapters || [];
    const current = courseData.chapitres[currentChapterIndex];
    const next = courseData.chapitres[nextIndex];
    return completed.includes(next.id) || (current && completed.includes(current.id));
}

function ensureViewerBar() {
    if (document.getElementById(VIEWER_BAR_ID)) return;

    const ICON_PREV = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    const ICON_NEXT = '<svg viewBox="0 0 24 24"><path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>';
    const ICON_LIST = '<svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>';

    const backdrop = document.createElement('div');
    backdrop.className = 'sbi-viewer-sheet-backdrop';
    backdrop.addEventListener('click', closeViewerSheet);
    document.body.appendChild(backdrop);

    const bar = document.createElement('nav');
    bar.className = 'sbi-viewer-bar';
    bar.id = VIEWER_BAR_ID;
    bar.setAttribute('aria-label', 'Navigation du cours');
    bar.innerHTML = `
        <button class="sbi-viewer-bar__btn" type="button" data-viewer-prev aria-label="Chapitre précédent">${ICON_PREV}<span class="sbi-viewer-bar__label">Préc.</span></button>
        <button class="sbi-viewer-bar__btn sbi-viewer-bar__btn--sommaire" type="button" data-viewer-sommaire aria-label="Sommaire des chapitres">${ICON_LIST}<span class="sbi-viewer-bar__label">Sommaire</span></button>
        <button class="sbi-viewer-bar__btn" type="button" data-viewer-next aria-label="Chapitre suivant">${ICON_NEXT}<span class="sbi-viewer-bar__label">Suiv.</span></button>
    `;
    bar.querySelector('[data-viewer-prev]').addEventListener('click', () => {
        if (currentChapterIndex > 0) loadChapter(currentChapterIndex - 1);
    });
    bar.querySelector('[data-viewer-next]').addEventListener('click', () => {
        if (isNextChapterUnlocked()) loadChapter(currentChapterIndex + 1);
    });
    bar.querySelector('[data-viewer-sommaire]').addEventListener('click', () => {
        document.body.classList.toggle('sbi-viewer-sheet-open');
    });
    document.body.appendChild(bar);
}

// Met à jour l'état Préc/Suiv et ferme la feuille à chaque changement de chapitre.
function updateViewerBar() {
    const bar = document.getElementById(VIEWER_BAR_ID);
    if (bar) {
        const prevBtn = bar.querySelector('[data-viewer-prev]');
        const nextBtn = bar.querySelector('[data-viewer-next]');
        if (prevBtn) prevBtn.disabled = currentChapterIndex <= 0;
        if (nextBtn) nextBtn.disabled = !isNextChapterUnlocked();
    }
    closeViewerSheet();
}

function renderSidebar() {
    const navList = document.getElementById('chapters-nav-list');
    navList.innerHTML = '';

    courseData.chapitres.forEach((chap, index) => {
        const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);
        const prevDone = index === 0 || userProgress.courses[courseData.id].completedChapters.includes(courseData.chapitres[index-1].id);
        const isUnlocked = isAdminOrTeacher || isPreviewMode || isDone || prevDone;

        const icon = isDone ? SVG_DONE : (isUnlocked ? getChapterIcon(chap) : SVG_LOCK);

        const tab = document.createElement('div');
        tab.className = `chapter-tab ${isDone ? 'done' : ''} ${!isUnlocked ? 'locked' : ''}`;
        tab.id = `tab-chap-${index}`;
        tab.innerHTML = `
            <span class="tab-title">${index + 1}. ${escapeHtml(chap.titre || `Chapitre ${index + 1}`)}</span>
            <span style="font-size:1.2rem; display:flex;">${icon}</span>
        `;

        // 8.0P.167.248 (audit a11y) : navigation chapitres accessible au clavier.
        tab.setAttribute('role', 'button');
        if (isUnlocked) {
            tab.setAttribute('tabindex', '0');
            tab.onclick = () => loadChapter(index);
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    loadChapter(index);
                }
            });
        } else {
            tab.setAttribute('tabindex', '-1');
            tab.setAttribute('aria-disabled', 'true');
        }

        navList.appendChild(tab);
    });

    ensureViewerBar();
}

function loadChapter(index, forceReload = false) {
    if (index < 0 || index >= courseData.chapitres.length) return;
    if (index === currentChapterIndex && !forceReload) return;

    clearViewerTimer();
    currentChapterIndex = index;
    const chap = courseData.chapitres[index];
    const isDone = userProgress.courses[courseData.id].completedChapters.includes(chap.id);

    document.querySelectorAll('.chapter-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`tab-chap-${index}`);
    if(activeTab) activeTab.classList.add('active');

    updateViewerBar();

    const main = document.getElementById('viewer-main-content');

    let contentHtml = `<h1 style="margin-top:0; font-size: 2.8rem; margin-bottom: 2rem; color: var(--text-main); font-weight: 800;">${escapeHtml(chap.titre || `Chapitre ${index + 1}`)}</h1>`;

    if (isObjectivesChapter(chap)) {
        contentHtml += renderObjectivesChapter(chap);
    } else if (isFillBlankChapter(chap)) {
        contentHtml += renderFillBlankChapter(chap);
    } else if (isPedagogicChapter(chap)) {
        contentHtml += renderPedagogicChapter(chap);
    } else if (chap.type === 'text') {
        if (chap.mediaType === 'video' && chap.mediaVideo) {
            contentHtml += `
                <div class="media-container">
                    <video src="${escapeHtml(chap.mediaVideo)}" controls controlsList="nodownload" oncontextmenu="return false;"></video>
                </div>`;
        } else if (chap.mediaType === 'image' && chap.mediaImage) {
            contentHtml += `
                <div class="media-container">
                    <img src="${escapeHtml(chap.mediaImage)}" alt="${escapeHtml(chap.titre || '')}" oncontextmenu="return false;">
                </div>`;
        }
        contentHtml += `<div class="text-container ql-editor">${sanitizeRichHtml(chap.contenu)}</div>`;
    } else {
        contentHtml += `<div class="text-container">
            <div style="color:var(--accent-yellow); font-weight: bold; font-size: 1.2rem; border-bottom: 2px solid var(--border-color); padding-bottom: 1rem; display:flex; align-items:center; gap:10px;">
                ${SVG_QUIZ} Examen de passage
            </div>
            <div id="quiz-form" style="margin-top: 2rem;">`;

        if (chap.questions) {
            chap.questions.forEach((q, qIndex) => {
                contentHtml += `
                <div class="quiz-question" style="margin-bottom: 2.5rem;">
                    <h3 style="font-size:1.1rem; color:var(--text-main); margin-top:0;">${qIndex+1}. ${escapeHtml(q.question || '')}</h3>
                    <div style="display:flex; flex-direction:column; gap:0.8rem; margin-top:1rem;">`;

                q.options.forEach((opt, oIndex) => {
                    contentHtml += `
                        <label id="label_q_${qIndex}_o_${oIndex}" class="quiz-option">
                            <input type="checkbox" name="q_${qIndex}" value="${oIndex}" style="width:20px; height:20px; accent-color: var(--accent-green); flex-shrink:0;">
                            <span style="font-size:1rem; color:var(--text-main);">${escapeHtml(opt || '')}</span>
                        </label>`;
                });

                contentHtml += `</div></div>`;
            });
        }
        contentHtml += `</div>
            <div id="quiz-result-box" class="quiz-result-box"></div>
        </div>`;
    }

    contentHtml += `
        <div class="action-bar" id="viewer-action-bar">
            <button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>
        </div>
    `;

    main.innerHTML = contentHtml;
    main.scrollTop = 0;

    bindAutonomousEvaluationControls(main);
    bindResourceDownloadControls(main);
    startSecurityTimer(isDone);
}

function goToNextChapter(isLast) {
    if (isLast) {
        document.getElementById('btn-back-dynamic')?.click();
    } else {
        loadChapter(currentChapterIndex + 1);
    }
}

async function markCurrentChapterCompleted(scoreEarned = 0) {
    const chapter = courseData.chapitres[currentChapterIndex];
    const chapId = chapter?.id;
    if (!chapId) return null;

    if (isPreviewMode) {
        if (!userProgress.courses[courseData.id].completedChapters.includes(chapId)) {
            userProgress.courses[courseData.id].completedChapters.push(chapId);
        }
        renderSidebar();
        return userProgress;
    }

    const updatedProgress = await validateChapterProgress(currentUid, courseData.id, chapId, courseData.chapitres.length, scoreEarned);
    if (updatedProgress) {
        userProgress = updatedProgress;
        renderSidebar();
    }
    return updatedProgress;
}

function enableCompletedStepButton(btn, isLast, label = '') {
    const nextText = label || (isLast ? "Terminer le cours" : "Passer a la suite");
    btn.disabled = false;
    btn.innerHTML = `${nextText} ${SVG_NEXT}`;
    btn.onclick = () => goToNextChapter(isLast);
}

async function completeTimerValidatedChapter(btn, isLast, chapterId) {
    btn.disabled = true;
    btn.innerHTML = `${SVG_DONE} Validation de la page...`;

    const currentId = courseData.chapitres[currentChapterIndex]?.id;
    if (currentId !== chapterId) return;

    const progress = await markCurrentChapterCompleted(0);
    if (!progress && !isPreviewMode) {
        btn.disabled = false;
        btn.innerHTML = "Erreur de validation, recommencer";
        btn.onclick = () => completeTimerValidatedChapter(btn, isLast, chapterId);
        return;
    }

    enableCompletedStepButton(btn, isLast);
}

function startSecurityTimer(isAlreadyDone) {
    const actionBar = document.getElementById('viewer-action-bar');
    actionBar.innerHTML = `<button id="btn-next-chapter" class="btn-validate" disabled>Préparation...</button>`;
    const btn = document.getElementById('btn-next-chapter');

    const isLast = currentChapterIndex === courseData.chapitres.length - 1;
    const chapter = courseData.chapitres[currentChapterIndex];

    if (chapter.type === 'quiz') {
        btn.disabled = false;
        btn.innerHTML = `${SVG_DONE} Soumettre mes réponses`;
        btn.onclick = () => submitQuizAnswers(isLast);
        return;
    }

    if (isFillBlankChapter(chapter)) {
        btn.disabled = false;
        btn.innerHTML = `${SVG_DONE} Valider mes reponses`;
        btn.onclick = () => submitFillBlankAnswers(isLast);
        return;
    }

    if (isCheckpointChapter(chapter)) {
        setupCheckpointValidation(isLast, isAlreadyDone);
        return;
    }

    if (!isAdminOrTeacher && currentUserCourseTimerBypass && !isAlreadyDone) {
        void completeTimerValidatedChapter(btn, isLast, chapter.id);
        return;
    }

    if (isAdminOrTeacher || isAlreadyDone) {
        enableCompletedStepButton(btn, isLast, isLast ? "Terminer le cours" : "Continuer");
        return;
    }

    const waitSeconds = getChapterWaitSeconds(chapter);
    if (waitSeconds <= 0) {
        void completeTimerValidatedChapter(btn, isLast, chapter.id);
        return;
    }

    let timeLeft = waitSeconds;
    btn.innerHTML = `${SVG_TIME} Temps minimum : ${formatWaitSeconds(timeLeft)}`;

    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearViewerTimer();
            void completeTimerValidatedChapter(btn, isLast, chapter.id);
        } else {
            btn.innerHTML = `${SVG_TIME} Temps minimum : ${formatWaitSeconds(timeLeft)}`;
        }
    }, 1000);
}

function setupCheckpointValidation(isLast, isAlreadyDone) {
    const btn = document.getElementById('btn-next-chapter');
    const inputs = Array.from(document.querySelectorAll('.sbi-checkpoint-acquis'));
    const nextText = isLast ? "Terminer le cours" : "Valider les acquis et continuer";
    const chapter = courseData.chapitres[currentChapterIndex];
    const checkpointScore = isAlreadyDone ? 0 : getChapterMaxScore(chapter);

    const refresh = () => {
        const allChecked = inputs.length === 0 || inputs.every((input) => input.checked);
        btn.disabled = !allChecked && !isAlreadyDone;
        btn.innerHTML = allChecked || isAlreadyDone
            ? `${nextText}${checkpointScore > 0 ? ` (+${checkpointScore} XP)` : ''} ${SVG_NEXT}`
            : `${SVG_DONE} Cochez tous les acquis`;
    };

    inputs.forEach((input) => input.addEventListener('change', refresh));
    btn.onclick = () => validateAndNext(isLast, checkpointScore);
    refresh();
}

function submitFillBlankAnswers(isLast) {
    const chap = courseData.chapitres[currentChapterIndex];
    const blanks = normalizeFillBlankRows(chap);
    let score = 0;
    const totalPoints = getFillBlankTotalPoints(chap);
    let allCorrect = true;

    blanks.forEach((blank, index) => {
        const input = document.getElementById(`fib_input_${index}`);
        const wrapper = document.querySelector(`[data-fib-wrapper="${index}"]`);
        const userAnswer = input?.value || '';
        const normalizedUserAnswer = normalizeAnswerText(userAnswer);
        const acceptedAnswers = splitAcceptedAnswers(blank);
        const isCorrect = acceptedAnswers.some((answer) => normalizeAnswerText(answer) === normalizedUserAnswer);

        if (isCorrect) {
            score += Number(blank.points || 0);
        } else {
            allCorrect = false;
        }

        if (input) {
            input.disabled = true;
            input.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
        }

        if (wrapper) {
            wrapper.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
            if (chap.showAnswersAtEnd !== false && acceptedAnswers[0]) {
                wrapper.insertAdjacentHTML('beforeend', `<span class="fib-viewer-answer">${escapeHtml(acceptedAnswers[0])}</span>`);
            }
        }
    });

    if (chap.scoringMode === 'global' && !allCorrect) {
        score = 0;
    }

    const resultBox = document.getElementById('fib-result-box');
    const actionBar = document.getElementById('viewer-action-bar');
    const nextText = isLast ? "Terminer le cours" : "Valider et passer a la suite";
    const feedback = allCorrect
        ? (chap.feedbackCorrect || 'Toutes les reponses attendues sont correctes.')
        : (chap.feedbackIncorrect || 'Certaines reponses sont a revoir. Consultez la correction puis reessayez si besoin.');

    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.style.borderColor = allCorrect ? 'var(--accent-green)' : 'var(--accent-yellow)';
        resultBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:1rem;">
                <svg width="32" height="32" fill="${allCorrect ? 'var(--accent-green)' : 'var(--accent-yellow)'}" viewBox="0 0 24 24"><path d="${allCorrect ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'}"/></svg>
                <h3 style="margin:0; color: var(--text-main); font-size: 1.5rem;">Score : ${score} / ${totalPoints} points</h3>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 0;">${escapeHtml(feedback)}</p>
        `;
    }

    actionBar.innerHTML = `
        <button id="btn-retry-fib" class="btn-validate" style="background: transparent; color: var(--text-main); border: 2px solid var(--border-color); margin-right: 1rem; box-shadow: none;">Refaire l'activite</button>
        <button id="btn-next-chapter" class="btn-validate">${nextText} ${SVG_NEXT}</button>
    `;
    document.getElementById('btn-retry-fib').onclick = () => loadChapter(currentChapterIndex, true);
    document.getElementById('btn-next-chapter').onclick = () => validateAndNext(isLast, score);
}

function submitQuizAnswers(isLast) {
    const chap = courseData.chapitres[currentChapterIndex];
    let score = 0;
    let totalPoints = 0;
    let allCorrect = true;

    chap.questions.forEach((q, qIndex) => {
        const selected = Array.from(document.querySelectorAll(`input[name="q_${qIndex}"]:checked`)).map(cb => parseInt(cb.value));
        const correct = (q.correctIndices || []).map((value) => Number(value));
        const pts = q.points || 1;
        totalPoints += pts;

        const isQCorrect = (selected.length === correct.length && selected.every(val => correct.includes(val)));
        if (isQCorrect) {
            score += pts;
        } else {
            allCorrect = false;
        }

        q.options.forEach((opt, oIndex) => {
            const label = document.getElementById(`label_q_${qIndex}_o_${oIndex}`);
            const checkbox = label.querySelector('input');
            checkbox.disabled = true;
            label.classList.add('locked');

            if (correct.includes(oIndex)) {
                label.classList.add('correct');
            } else if (selected.includes(oIndex) && !correct.includes(oIndex)) {
                label.classList.add('wrong');
            }
        });
    });

    const resultBox = document.getElementById('quiz-result-box');
    const actionBar = document.getElementById('viewer-action-bar');
    resultBox.style.display = 'block';

    const nextText = isLast ? "Terminer le cours" : "Valider et passer à la suite";

    if (allCorrect || isAdminOrTeacher || isPreviewMode) {
        resultBox.style.borderColor = "var(--accent-green)";
        resultBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:1rem;">
                <svg width="32" height="32" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                <h3 style="margin:0; color: var(--text-main); font-size: 1.5rem;">Score : ${score} / ${totalPoints} points !</h3>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 0;">Excellent travail. Si vous avez battu votre record, l'expérience (XP) a été ajoutée à votre profil.</p>
        `;
    } else {
        resultBox.style.borderColor = "var(--accent-yellow)";
        resultBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:1rem;">
                <svg width="32" height="32" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                <h3 style="margin:0; color: var(--text-main); font-size: 1.5rem;">Score : ${score} / ${totalPoints} points.</h3>
            </div>
            <p style="color: var(--text-muted); margin-bottom: 0;">Certaines réponses sont incorrectes. Observez la correction, vous pouvez réessayer ou passer à la suite.</p>
        `;
    }

    actionBar.innerHTML = `
        <button id="btn-retry-quiz" class="btn-validate" style="background: transparent; color: var(--text-main); border: 2px solid var(--border-color); margin-right: 1rem; box-shadow: none;">Refaire le test</button>
        <button id="btn-next-chapter" class="btn-validate">${nextText} ${SVG_NEXT}</button>
    `;
    document.getElementById('btn-retry-quiz').onclick = () => loadChapter(currentChapterIndex, true);
    document.getElementById('btn-next-chapter').onclick = () => validateAndNext(isLast, score);
}

async function validateAndNext(isLast, scoreEarned = 0) {
    const btn = document.getElementById('btn-next-chapter');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Validation...";
    }

    if (isPreviewMode) {
        await markCurrentChapterCompleted(scoreEarned);
        if (isLast) alert("Aperçu du cours terminé ! Vous retournez à la liste des cours.");
        goToNextChapter(isLast);
        return;
    }

    const updatedProgress = await markCurrentChapterCompleted(scoreEarned);

    if (updatedProgress) {
        goToNextChapter(isLast);
    } else {
        alert("Erreur réseau. Veuillez réessayer.");
        if(btn) {
            btn.disabled = false;
            btn.textContent = isLast ? "Terminer le cours" : "Valider l'étape et continuer";
        }
    }
}
