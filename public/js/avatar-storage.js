/**
 * =======================================================================
 * AVATAR STORAGE - Firebase Storage + migration legacy base64
 * =======================================================================
 *
 * Objectif :
 * - ne plus stocker les avatars en base64 dans Firestore
 * - garder la compatibilité avec les anciens avatars base64
 * - migrer les anciens avatars automatiquement ou via diagnostic admin
 * =======================================================================
 */

import { db, storage } from '/js/firebase-init.js';
import {
    collection,
    deleteField,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    deleteObject,
    getDownloadURL,
    ref,
    uploadString
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const AVATAR_FOLDER = 'avatar';
const AVATAR_MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

export const isLegacyAvatarDataUrl = (value) => {
    return typeof value === 'string' && /^data:image\//i.test(value.trim());
};

export const isBase64MediaDataUrl = (value) => {
    return typeof value === 'string' && /^data:(image|video)\//i.test(value.trim());
};

export const isFirebaseStorageUrl = (value) => {
    return (
        typeof value === 'string' &&
        value.startsWith('https://') &&
        value.includes('firebasestorage.googleapis.com')
    );
};

export const estimateDataUrlBytes = (value) => {
    if (typeof value !== 'string' || !value) return 0;

    const base64Part = value.includes(',') ? value.split(',').pop() : value;
    return Math.round(base64Part.length * 0.75);
};

const sanitizeFileName = (value) => {
    return String(value || 'avatar')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
};

const getContentTypeFromDataUrl = (dataUrl) => {
    const match = String(dataUrl || '').match(/^data:([^;]+);/i);
    return match?.[1] || 'image/webp';
};

const assertValidAvatarDataUrl = (dataUrl) => {
    if (!isLegacyAvatarDataUrl(dataUrl)) {
        throw new Error("L'image avatar doit être une image base64 valide.");
    }

    const estimatedBytes = estimateDataUrlBytes(dataUrl);

    if (estimatedBytes > AVATAR_MAX_DATA_URL_BYTES) {
        throw new Error("Avatar trop lourd. Limite actuelle : 8 Mo.");
    }
};

const getAvatarStoragePath = (userId, prefix = 'avatar') => {
    const cleanPrefix = sanitizeFileName(prefix);
    return `users/${userId}/${AVATAR_FOLDER}/${cleanPrefix}_${Date.now()}.webp`;
};

const isSafeAvatarPathForUser = (path, userId) => {
    return (
        typeof path === 'string' &&
        path.startsWith(`users/${userId}/${AVATAR_FOLDER}/`) &&
        !path.includes('..')
    );
};

export const deletePreviousAvatarFromStorage = async (userId, previousStoragePath) => {
    if (!isSafeAvatarPathForUser(previousStoragePath, userId)) {
        return { deleted: false, skipped: true };
    }

    try {
        await deleteObject(ref(storage, previousStoragePath));
        return { deleted: true, skipped: false };
    } catch (error) {
        console.warn('[SBI Avatar] Ancien avatar Storage non supprimé :', previousStoragePath, error);
        return { deleted: false, skipped: false, error };
    }
};

export const uploadAvatarDataUrl = async (userId, dataUrl, options = {}) => {
    if (!userId) throw new Error('Utilisateur avatar introuvable.');

    assertValidAvatarDataUrl(dataUrl);

    const storagePath = getAvatarStoragePath(userId, options.prefix || 'avatar');
    const avatarRef = ref(storage, storagePath);
    const contentType = getContentTypeFromDataUrl(dataUrl);

    await uploadString(avatarRef, dataUrl, 'data_url', {
        contentType,
        customMetadata: {
            ownerId: userId,
            kind: 'profile-avatar',
            migratedFrom: options.migratedFrom || 'profile-editor'
        }
    });

    const downloadURL = await getDownloadURL(avatarRef);

    return {
        downloadURL,
        storagePath
    };
};

export const saveProfileAvatarToStorage = async (userId, dataUrl, previousStoragePath = null, options = {}) => {
    const uploaded = await uploadAvatarDataUrl(userId, dataUrl, options);

    await updateDoc(doc(db, 'users', userId), {
        photoURL: uploaded.downloadURL,
        photoStoragePath: uploaded.storagePath,
        photoOriginal: deleteField(),
        avatarUpdatedAt: serverTimestamp(),
        avatarStorageVersion: 1
    });

    if (previousStoragePath && previousStoragePath !== uploaded.storagePath) {
        await deletePreviousAvatarFromStorage(userId, previousStoragePath);
    }

    return uploaded;
};

export const migrateLegacyAvatarForUser = async (userId, userData = {}, options = {}) => {
    const legacyAvatar = userData.photoURL;
    const legacyOriginal = userData.photoOriginal;

    if (!isLegacyAvatarDataUrl(legacyAvatar)) {
        if (isLegacyAvatarDataUrl(legacyOriginal)) {
            await updateDoc(doc(db, 'users', userId), {
                photoOriginal: deleteField(),
                avatarCleanupAt: serverTimestamp(),
                avatarStorageVersion: 1
            });

            return {
                migrated: false,
                cleaned: true,
                skipped: false,
                reason: 'photo-original-cleaned'
            };
        }

        return {
            migrated: false,
            cleaned: false,
            skipped: true,
            reason: 'no-legacy-avatar'
        };
    }

    const uploaded = await saveProfileAvatarToStorage(
        userId,
        legacyAvatar,
        userData.photoStoragePath || null,
        {
            prefix: 'legacy_avatar',
            migratedFrom: options.migratedFrom || 'legacy-base64'
        }
    );

    return {
        migrated: true,
        cleaned: isLegacyAvatarDataUrl(legacyOriginal),
        skipped: false,
        ...uploaded
    };
};

export const scanLegacyStorageUsage = async () => {
    const [usersSnap, coursesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'courses'))
    ]);

    const stats = {
        usersTotal: usersSnap.size,
        coursesTotal: coursesSnap.size,
        avatarsLegacy: 0,
        avatarsStorage: 0,
        avatarOriginalLegacy: 0,
        courseImagesLegacy: 0,
        courseVideosLegacy: 0,
        courseImagesStorage: 0,
        courseVideosStorage: 0,
        firestoreLegacyBytes: 0,
        legacyAvatarUserIds: []
    };

    usersSnap.forEach((userDoc) => {
        const data = userDoc.data() || {};

        if (isLegacyAvatarDataUrl(data.photoURL)) {
            stats.avatarsLegacy += 1;
            stats.firestoreLegacyBytes += estimateDataUrlBytes(data.photoURL);
            stats.legacyAvatarUserIds.push(userDoc.id);
        } else if (data.photoStoragePath || isFirebaseStorageUrl(data.photoURL)) {
            stats.avatarsStorage += 1;
        }

        if (isLegacyAvatarDataUrl(data.photoOriginal)) {
            stats.avatarOriginalLegacy += 1;
            stats.firestoreLegacyBytes += estimateDataUrlBytes(data.photoOriginal);
        }
    });

    coursesSnap.forEach((courseDoc) => {
        const data = courseDoc.data() || {};
        const chapters = Array.isArray(data.chapitres) ? data.chapitres : [];

        chapters.forEach((chapter) => {
            if (isBase64MediaDataUrl(chapter.mediaImage)) {
                stats.courseImagesLegacy += 1;
                stats.firestoreLegacyBytes += estimateDataUrlBytes(chapter.mediaImage);
            } else if (isFirebaseStorageUrl(chapter.mediaImage)) {
                stats.courseImagesStorage += 1;
            }

            if (isBase64MediaDataUrl(chapter.mediaVideo)) {
                stats.courseVideosLegacy += 1;
                stats.firestoreLegacyBytes += estimateDataUrlBytes(chapter.mediaVideo);
            } else if (isFirebaseStorageUrl(chapter.mediaVideo)) {
                stats.courseVideosStorage += 1;
            }
        });
    });

    return stats;
};

export const migrateAllLegacyAvatars = async ({ onProgress } = {}) => {
    const usersSnap = await getDocs(collection(db, 'users'));
    const legacyUsers = [];

    usersSnap.forEach((userDoc) => {
        const data = userDoc.data() || {};

        if (isLegacyAvatarDataUrl(data.photoURL) || isLegacyAvatarDataUrl(data.photoOriginal)) {
            legacyUsers.push({
                id: userDoc.id,
                data
            });
        }
    });

    const result = {
        total: legacyUsers.length,
        migrated: 0,
        cleaned: 0,
        skipped: 0,
        failed: 0,
        errors: []
    };

    for (const [index, user] of legacyUsers.entries()) {
        try {
            const migration = await migrateLegacyAvatarForUser(user.id, user.data, {
                migratedFrom: 'admin-bulk-migration'
            });

            if (migration.migrated) result.migrated += 1;
            if (migration.cleaned) result.cleaned += 1;
            if (migration.skipped) result.skipped += 1;
        } catch (error) {
            console.warn('[SBI Avatar] Migration avatar impossible :', user.id, error);
            result.failed += 1;
            result.errors.push({
                userId: user.id,
                message: error?.message || String(error)
            });
        }

        if (typeof onProgress === 'function') {
            onProgress({
                ...result,
                current: index + 1
            });
        }
    }

    if (legacyUsers.length === 0) {
        result.skipped = usersSnap.size;
    }

    return result;
};
