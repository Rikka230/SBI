/**
 * =======================================================================
 * COURSE MEDIA STORAGE
 * =======================================================================
 *
 * Gestion dédiée des médias de cours :
 * - preview locale
 * - validation poids/type
 * - compression image
 * - upload Firebase Storage
 * - suppression Storage intelligente
 * - compatibilité anciens médias base64 / nouvelles URLs Storage
 * =======================================================================
 */

import { app, auth } from '/js/firebase-init.js';
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const storage = getStorage(app);

const pendingChapterMedia = new Map();

export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_COURSE_DOCUMENT_BYTES = 850 * 1024;

const IMAGE_UPLOAD_ATTEMPTS = [
    { width: 1600, quality: 0.84 },
    { width: 1400, quality: 0.78 },
    { width: 1200, quality: 0.72 },
    { width: 1000, quality: 0.68 },
    { width: 800, quality: 0.62 }
];

export const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return '0 Ko';

    if (bytes < 1024) return `${bytes} o`;

    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} Ko`;

    return `${(kb / 1024).toFixed(2)} Mo`;
};

const estimateStringBytes = (value) => {
    return new Blob([String(value || '')]).size;
};

const estimateObjectBytes = (value) => {
    try {
        return estimateStringBytes(JSON.stringify(value));
    } catch (error) {
        return Infinity;
    }
};

export const validateCourseDocumentSize = (courseData) => {
    const estimatedBytes = estimateObjectBytes(courseData);

    if (estimatedBytes > MAX_COURSE_DOCUMENT_BYTES) {
        throw new Error(
            `Ce cours est trop lourd pour Firestore : environ ${formatBytes(estimatedBytes)}. ` +
            `Les médias sont bien sortis vers Storage, mais le texte/quiz/données dépassent encore la limite de sécurité.`
        );
    }
};

const sanitizeStorageName = (name) => {
    return String(name || 'media')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
};

const getFileExtension = (file, fallback = 'bin') => {
    const name = file?.name || '';
    const parts = name.split('.');

    if (parts.length > 1) {
        return parts.pop().toLowerCase();
    }

    if (file?.type?.includes('webm')) return 'webm';
    if (file?.type?.includes('mp4')) return 'mp4';
    if (file?.type?.includes('jpeg')) return 'jpg';
    if (file?.type?.includes('png')) return 'png';
    if (file?.type?.includes('webp')) return 'webp';

    return fallback;
};

const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const loadImageFromDataURL = (dataUrl) => {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
};

const canvasToBlob = (canvas, type, quality) => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Compression image impossible."));
                return;
            }

            resolve(blob);
        }, type, quality);
    });
};

const compressImageFileToWebpBlob = async (file) => {
    if (!file) {
        throw new Error("Aucun fichier image sélectionné.");
    }

    if (!file.type.startsWith('image/')) {
        throw new Error("Le fichier sélectionné n'est pas une image.");
    }

    if (file.size > MAX_IMAGE_FILE_BYTES) {
        throw new Error(
            `Image trop lourde : ${formatBytes(file.size)}. ` +
            `Limite actuelle : ${formatBytes(MAX_IMAGE_FILE_BYTES)}.`
        );
    }

    const originalDataUrl = await readFileAsDataURL(file);
    const img = await loadImageFromDataURL(originalDataUrl);

    let lastBlob = null;

    for (const attempt of IMAGE_UPLOAD_ATTEMPTS) {
        const ratio = Math.min(1, attempt.width / img.width);
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await canvasToBlob(canvas, 'image/webp', attempt.quality);
        lastBlob = blob;

        if (blob.size <= 2.5 * 1024 * 1024) {
            return blob;
        }
    }

    return lastBlob;
};

export const validateVideoFileForStorage = (file) => {
    if (!file) {
        throw new Error("Aucun fichier vidéo sélectionné.");
    }

    if (!file.type.startsWith('video/')) {
        throw new Error("Le fichier sélectionné n'est pas une vidéo.");
    }

    if (file.size > MAX_VIDEO_FILE_BYTES) {
        throw new Error(
            `Vidéo trop lourde : ${formatBytes(file.size)}. ` +
            `Limite actuelle : ${formatBytes(MAX_VIDEO_FILE_BYTES)}.`
        );
    }
};

const getPendingMedia = (chapterId) => {
    if (!pendingChapterMedia.has(chapterId)) {
        pendingChapterMedia.set(chapterId, {});
    }

    return pendingChapterMedia.get(chapterId);
};

const isSameFile = (a, b) => {
    if (!a || !b) return false;

    return (
        a.name === b.name &&
        a.size === b.size &&
        a.lastModified === b.lastModified
    );
};

const revokePreviewUrl = (url) => {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
};

export const hasPendingMedia = () => {
    return pendingChapterMedia.size > 0;
};

export const clearAllPendingMedia = () => {
    pendingChapterMedia.forEach((pending) => {
        revokePreviewUrl(pending.imagePreviewUrl);
        revokePreviewUrl(pending.videoPreviewUrl);
    });

    pendingChapterMedia.clear();

    const imageInput = document.getElementById('chapter-image-upload');
    const videoInput = document.getElementById('chapter-video-upload');

    if (imageInput) imageInput.value = '';
    if (videoInput) videoInput.value = '';
};

export const clearPendingMediaForChapter = (chapterId) => {
    const pending = pendingChapterMedia.get(chapterId);

    if (pending) {
        revokePreviewUrl(pending.imagePreviewUrl);
        revokePreviewUrl(pending.videoPreviewUrl);
    }

    pendingChapterMedia.delete(chapterId);
};

export const setPendingImageFile = (chapterId, file) => {
    if (!chapterId || !file) return;

    if (!file.type.startsWith('image/')) {
        throw new Error("Le fichier sélectionné n'est pas une image.");
    }

    if (file.size > MAX_IMAGE_FILE_BYTES) {
        throw new Error(
            `Image trop lourde : ${formatBytes(file.size)}. ` +
            `Limite actuelle : ${formatBytes(MAX_IMAGE_FILE_BYTES)}.`
        );
    }

    const pending = getPendingMedia(chapterId);

    if (!isSameFile(pending.imageFile, file)) {
        revokePreviewUrl(pending.imagePreviewUrl);
        pending.imageFile = file;
        pending.imagePreviewUrl = URL.createObjectURL(file);
    }

    pendingChapterMedia.set(chapterId, pending);
};

export const setPendingVideoFile = (chapterId, file) => {
    if (!chapterId || !file) return;

    validateVideoFileForStorage(file);

    const pending = getPendingMedia(chapterId);

    if (!isSameFile(pending.videoFile, file)) {
        revokePreviewUrl(pending.videoPreviewUrl);
        pending.videoFile = file;
        pending.videoPreviewUrl = URL.createObjectURL(file);
    }

    pendingChapterMedia.set(chapterId, pending);
};

export const captureActiveMediaInputs = (chapterId) => {
    if (!chapterId) return;

    const imageInput = document.getElementById('chapter-image-upload');
    const videoInput = document.getElementById('chapter-video-upload');

    const imageFile = imageInput?.files?.[0];
    const videoFile = videoInput?.files?.[0];

    if (imageFile) {
        setPendingImageFile(chapterId, imageFile);
        imageInput.value = '';
    }

    if (videoFile) {
        setPendingVideoFile(chapterId, videoFile);
        videoInput.value = '';
    }
};

export const restoreCurrentMediaPreview = (chapterId, chapter) => {
    if (!chapterId || !chapter) return;

    const pending = pendingChapterMedia.get(chapterId) || {};

    const imagePreview = document.getElementById('chapter-image-preview');
    const imageHidden = document.getElementById('chapter-image-base64');
    const imageSrc = pending.imagePreviewUrl || chapter.mediaImage || '';

    if (imageHidden) {
        imageHidden.value = chapter.mediaImage || '';
    }

    if (imagePreview) {
        if (imageSrc) {
            imagePreview.src = imageSrc;
            imagePreview.style.display = 'block';
        } else {
            imagePreview.removeAttribute('src');
            imagePreview.style.display = 'none';
        }
    }

    const videoPreview = document.getElementById('chapter-video-preview');
    const videoHidden = document.getElementById('chapter-video-base64');
    const videoSrc = pending.videoPreviewUrl || chapter.mediaVideo || '';

    if (videoHidden) {
        videoHidden.value = chapter.mediaVideo || '';
    }

    if (videoPreview) {
        if (videoSrc) {
            videoPreview.src = videoSrc;
            videoPreview.style.display = 'block';
        } else {
            videoPreview.removeAttribute('src');
            videoPreview.style.display = 'none';
        }
    }
};

export const syncChapterMediaFromDom = (chapter) => {
    if (!chapter?.id) return;

    const pending = pendingChapterMedia.get(chapter.id);

    const imageHidden = document.getElementById('chapter-image-base64');
    const videoHidden = document.getElementById('chapter-video-base64');

    if (imageHidden && !pending?.imageFile) {
        chapter.mediaImage = imageHidden.value || '';
    }

    if (videoHidden && !pending?.videoFile) {
        chapter.mediaVideo = videoHidden.value || '';
    }
};

const uploadImageToStorage = async (courseRefId, chapterId, file) => {
    const compressedBlob = await compressImageFileToWebpBlob(file);

    const cleanName = sanitizeStorageName(file.name.replace(/\.[^.]+$/, ''));
    const fileName = `${Date.now()}_${cleanName || 'image'}.webp`;
    const storagePath = `courses/${courseRefId}/chapters/${chapterId}/${fileName}`;
    const fileRef = ref(storage, storagePath);

    await uploadBytes(fileRef, compressedBlob, {
        contentType: 'image/webp',
        customMetadata: {
            originalName: file.name || '',
            uploadedBy: auth.currentUser?.uid || ''
        }
    });

    return getDownloadURL(fileRef);
};

const uploadVideoToStorage = async (courseRefId, chapterId, file) => {
    validateVideoFileForStorage(file);

    const ext = getFileExtension(file, 'mp4');
    const cleanName = sanitizeStorageName(file.name.replace(/\.[^.]+$/, ''));
    const fileName = `${Date.now()}_${cleanName || 'video'}.${ext}`;
    const storagePath = `courses/${courseRefId}/chapters/${chapterId}/${fileName}`;
    const fileRef = ref(storage, storagePath);

    await uploadBytes(fileRef, file, {
        contentType: file.type || 'video/mp4',
        customMetadata: {
            originalName: file.name || '',
            uploadedBy: auth.currentUser?.uid || ''
        }
    });

    return getDownloadURL(fileRef);
};

export const uploadPendingMediaForChapters = async (courseRefId, chapters) => {
    const entries = Array.from(pendingChapterMedia.entries());

    if (entries.length === 0) return;

    for (const [chapterId, pending] of entries) {
        const chapter = chapters.find(c => c.id === chapterId);
        if (!chapter) continue;

        if (pending.imageFile) {
            chapter.mediaImage = await uploadImageToStorage(courseRefId, chapterId, pending.imageFile);
        }

        if (pending.videoFile) {
            chapter.mediaVideo = await uploadVideoToStorage(courseRefId, chapterId, pending.videoFile);
        }

        clearPendingMediaForChapter(chapterId);
    }
};

/* -----------------------------------------------------------------------
   SUPPRESSION STORAGE
   -----------------------------------------------------------------------
   Important :
   - On ne supprime que les URLs Firebase Storage.
   - On ignore les anciens médias base64.
   - On ne supprime pas un média encore référencé par un autre cours,
     notamment après duplication.
   ----------------------------------------------------------------------- */

const isFirebaseStorageUrl = (value) => {
    return (
        typeof value === 'string' &&
        value.startsWith('https://') &&
        value.includes('firebasestorage.googleapis.com')
    );
};

const collectCourseStorageUrls = (courseData) => {
    const urls = new Set();

    const chapters = Array.isArray(courseData?.chapitres)
        ? courseData.chapitres
        : [];

    chapters.forEach((chapter) => {
        if (isFirebaseStorageUrl(chapter.mediaImage)) {
            urls.add(chapter.mediaImage);
        }

        if (isFirebaseStorageUrl(chapter.mediaVideo)) {
            urls.add(chapter.mediaVideo);
        }
    });

    return urls;
};

export const deleteUnusedCourseMediaFromStorage = async ({ courseId, courseData, allCourses }) => {
    const targetUrls = collectCourseStorageUrls(courseData);

    if (targetUrls.size === 0) {
        return {
            deleted: 0,
            skipped: 0,
            failed: 0
        };
    }

    const reusedUrls = new Set();

    allCourses
        .filter((course) => course.id !== courseId)
        .forEach((course) => {
            collectCourseStorageUrls(course).forEach((url) => {
                reusedUrls.add(url);
            });
        });

    const urlsToDelete = Array.from(targetUrls).filter((url) => !reusedUrls.has(url));
    const skipped = targetUrls.size - urlsToDelete.length;

    const results = await Promise.allSettled(
        urlsToDelete.map(async (url) => {
            const fileRef = ref(storage, url);
            await deleteObject(fileRef);
        })
    );

    const deleted = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.filter((result) => result.status === 'rejected').length;

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.warn("[SBI Storage] Suppression média impossible :", urlsToDelete[index], result.reason);
        }
    });

    return {
        deleted,
        skipped,
        failed
    };
};
