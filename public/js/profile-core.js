/**
 * =======================================================================
 * PROFILE CORE - Moteur Unique (Admin & Étudiant) + CROPPER.JS + TRACKING
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    doc,
    getDoc,
    updateDoc,
    collection,
    getDocs,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress, resetCourseProgress, updateQuizScore } from '/js/course-engine.js';
import {
    isLegacyAvatarDataUrl,
    migrateLegacyAvatarForUser,
    saveProfileAvatarToStorage
} from '/js/avatar-storage.js';

let currentProfileId = null;
let currentProfileData = null;
let loggedInUserId = null;
let loggedInUserData = null;
let isOwner = false;
let isAdmin = false;
let isEditMode = false;
let cropperInstance = null;
let unsubscribeProfilePresence = null;
let profilePresenceRefreshIntervalId = null;
let latestPresenceData = null;

const ONLINE_TTL_MS = 90000;

const chunkArray = (items, size = 10) => {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
};

const normalizeIdList = (items) => {
    if (!Array.isArray(items)) return [];

    return Array.from(new Set(
        items
            .filter(Boolean)
            .map((item) => String(item).trim())
            .filter(Boolean)
    ));
};

const isTeacherProfile = (profile) => {
    return profile?.role === 'teacher';
};

const sortByTitle = (a, b) => {
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', {
        sensitivity: 'base'
    });
};

const uniqueById = (items) => {
    const map = new Map();

    items.forEach((item) => {
        if (item?.id) map.set(item.id, item);
    });

    return Array.from(map.values());
};

const escapeHTML = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const parseGradeInput = (value, maxScoreValue) => {
    const raw = String(value || '').trim().replace(',', '.');
    const maxScore = Number(maxScoreValue);

    if (!raw) return null;

    let parsedScore = null;

    // Saisie normale attendue : uniquement la note obtenue, ex : 1 ou 1.5.
    // On garde le support 1/2 pour compatibilité, mais il n'est plus nécessaire.
    if (raw.includes('/')) {
        const parts = raw.split('/').map(part => part.trim().replace(',', '.'));
        if (parts.length !== 2) return null;

        const numerator = Number(parts[0]);
        const denominator = Number(parts[1]);

        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
            return null;
        }

        parsedScore = Number.isFinite(maxScore) && maxScore > 0
            ? (numerator / denominator) * maxScore
            : numerator;
    } else {
        parsedScore = Number(raw);
    }

    if (!Number.isFinite(parsedScore)) return null;

    const roundedScore = Math.round(parsedScore * 100) / 100;

    if (roundedScore < 0) return null;

    // Si le score max est connu, on bloque les notes impossibles.
    // Si le score max est inconnu ou vaut 0 sur un ancien cours, on accepte la note manuelle.
    if (Number.isFinite(maxScore) && maxScore > 0 && roundedScore > maxScore) return null;

    return roundedScore;
};

const formatScore = (value) => {
    const score = Number(value) || 0;
    return Number.isInteger(score) ? String(score) : String(Math.round(score * 100) / 100);
};

const computeQuizMaxScore = (chapter = {}) => {
    if (!Array.isArray(chapter.questions) || chapter.questions.length === 0) return 0;

    return chapter.questions.reduce((sum, question) => {
        const points = Number(question?.points);
        return sum + (Number.isFinite(points) && points > 0 ? points : 1);
    }, 0);
};

const getCourseChapterIds = (courseData = {}) => {
    if (!Array.isArray(courseData.chapitres)) return [];
    return courseData.chapitres.map(chap => chap?.id).filter(Boolean);
};

const getSharedFormationIdsForProfile = (targetUserData = {}) => {
    const targetFormationIds = normalizeIdList(targetUserData.formationIds);

    if (isOwner || isAdmin) return targetFormationIds;

    const viewerFormationIds = normalizeIdList(loggedInUserData?.formationIds);
    if (!viewerFormationIds.length) return [];

    const viewerSet = new Set(viewerFormationIds);
    return targetFormationIds.filter((formationId) => viewerSet.has(formationId));
};

const fetchFormationById = async (formationId) => {
    try {
        const snap = await getDoc(doc(db, "formations", formationId));
        if (!snap.exists()) return null;

        return {
            id: snap.id,
            ...snap.data()
        };
    } catch (error) {
        console.warn(`[SBI Profile] Formation inaccessible : ${formationId}`, error);
        return null;
    }
};

const fetchFormationsByIds = async (formationIds) => {
    const ids = normalizeIdList(formationIds);
    if (!ids.length) return [];

    const formations = await Promise.all(ids.map((formationId) => fetchFormationById(formationId)));
    return formations.filter(Boolean).sort(sortByTitle);
};

const fetchAssignedFormationsByMembership = async (uid, targetUserData = {}) => {
    if (!uid) return [];

    if (!isOwner && !isAdmin && !normalizeIdList(targetUserData.formationIds).length) {
        return [];
    }

    const membershipField = isTeacherProfile(targetUserData) ? 'profs' : 'students';
    const formationsQuery = query(
        collection(db, "formations"),
        where(membershipField, "array-contains", uid)
    );

    const snap = await getDocs(formationsQuery);
    const formations = [];

    snap.forEach((formationDoc) => {
        formations.push({
            id: formationDoc.id,
            ...formationDoc.data()
        });
    });

    return formations.sort(sortByTitle);
};

const fetchAssignedFormationsForUser = async (uid, targetUserData = {}) => {
    const indexedFormationIds = getSharedFormationIdsForProfile(targetUserData);

    if (indexedFormationIds.length > 0) {
        return fetchFormationsByIds(indexedFormationIds);
    }

    return fetchAssignedFormationsByMembership(uid, targetUserData);
};

const getFormationLookupKeys = (formations) => {
    const keys = [];

    formations.forEach((formation) => {
        if (formation.id) keys.push(String(formation.id));
        if (formation.titre) keys.push(String(formation.titre));
    });

    return normalizeIdList(keys);
};

const fetchActiveCoursesForFormationKeys = async (formationKeys) => {
    const keys = normalizeIdList(formationKeys);
    if (!keys.length) return [];

    const courses = [];
    const chunks = chunkArray(keys, 10);

    for (const chunk of chunks) {
        const coursesQuery = query(
            collection(db, "courses"),
            where("formations", "array-contains-any", chunk),
            where("actif", "==", true)
        );

        const snap = await getDocs(coursesQuery);

        snap.forEach((courseDoc) => {
            courses.push({
                id: courseDoc.id,
                ...courseDoc.data()
            });
        });
    }

    return uniqueById(courses);
};

const fetchCourseById = async (courseId) => {
    try {
        const snap = await getDoc(doc(db, "courses", courseId));
        if (!snap.exists()) return null;

        return {
            id: snap.id,
            ...snap.data()
        };
    } catch (error) {
        console.warn(`[SBI Profile] Cours inaccessible : ${courseId}`, error);
        return null;
    }
};

const fetchCoursesByIds = async (courseIds) => {
    const ids = normalizeIdList(courseIds);
    if (!ids.length) return [];

    const courses = await Promise.all(ids.map((courseId) => fetchCourseById(courseId)));
    return courses.filter(Boolean);
};


const presenceToMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
};

const isUserReallyOnline = (userData) => {
    if (!userData || userData.statut === 'suspendu') return false;
    if (userData.isOnline !== true) return false;

    const lastSeenMs = presenceToMillis(userData.lastSeenAt);
    if (!lastSeenMs) return false;

    return Date.now() - lastSeenMs <= ONLINE_TTL_MS;
};

const updateProfilePresenceStatus = (data) => {
    const dot = document.getElementById('prof-online-dot');
    const statusText = document.getElementById('prof-status-text');
    if (!dot || !statusText || !data) return;

    if (data.statut === 'suspendu') {
        dot.className = 'online-dot offline';
        statusText.textContent = "Compte Suspendu";
        return;
    }

    if (isUserReallyOnline(data)) {
        dot.className = 'online-dot';
        statusText.textContent = "En Ligne";
    } else {
        dot.className = 'online-dot offline';
        statusText.textContent = "Hors Ligne";
    }
};

const startProfilePresenceListener = (uid) => {
    if (!uid) return;

    if (unsubscribeProfilePresence) {
        unsubscribeProfilePresence();
        unsubscribeProfilePresence = null;
    }

    if (profilePresenceRefreshIntervalId) {
        window.clearInterval(profilePresenceRefreshIntervalId);
        profilePresenceRefreshIntervalId = null;
    }

    unsubscribeProfilePresence = onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists()) return;

        latestPresenceData = snap.data();
        updateProfilePresenceStatus(latestPresenceData);
    }, (error) => {
        console.warn("Erreur écoute présence profil :", error);
    });

    profilePresenceRefreshIntervalId = window.setInterval(() => {
        if (latestPresenceData) updateProfilePresenceStatus(latestPresenceData);
    }, 30000);
};


const maybeMigrateVisibleLegacyAvatar = async (uid, data, avatarImg = null) => {
    if (!uid || !data) return;
    if (!isLegacyAvatarDataUrl(data.photoURL) && !isLegacyAvatarDataUrl(data.photoOriginal)) return;
    if (!isOwner && !isAdmin) return;

    try {
        const migrated = await migrateLegacyAvatarForUser(uid, data, {
            migratedFrom: isAdmin && !isOwner ? 'admin-profile-view' : 'profile-view'
        });

        if (migrated?.downloadURL) {
            currentProfileData = {
                ...currentProfileData,
                photoURL: migrated.downloadURL,
                photoStoragePath: migrated.storagePath
            };

            if (avatarImg) avatarImg.src = migrated.downloadURL;

            const displayName = `${data.prenom || ''} ${data.nom || ''}`.trim() || 'Utilisateur SBI';
            const topAvatar = document.getElementById('top-user-avatar');

            if (isOwner && topAvatar) {
                topAvatar.innerHTML = `<img src="${migrated.downloadURL}" alt="${escapeHTML(displayName)}" style="width:100%; height:100%; object-fit:cover;">`;
            }
        }
    } catch (error) {
        console.warn('[SBI Profile] Migration avatar legacy ignorée :', error);
    }
};

const SVG_RESET = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
const SVG_EDIT = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loggedInUserId = user.uid;

            const mySnap = await getDoc(doc(db, "users", loggedInUserId));
            if (mySnap.exists()) {
                const myData = mySnap.data();
                loggedInUserData = myData;
                isAdmin = (myData.role === 'admin' || myData.isGod === true);

                const myDisplayName = `${myData.prenom || ''} ${myData.nom || ''}`.trim() || "Étudiant";
                const myAvatarUrl = myData.photoURL || `https://ui-avatars.com/api/?name=${myDisplayName}&background=111&color=fff`;
                const myXp = myData.xp || 0;
                const myLevel = Math.floor(myXp / 100) + 1;

                const topName = document.getElementById('top-user-name');
                if (topName) topName.textContent = myDisplayName;

                const topAvatar = document.getElementById('top-user-avatar');
                if (topAvatar) topAvatar.innerHTML = `<img src="${myAvatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;

                const topLevel = document.getElementById('top-user-level');
                if (topLevel) topLevel.textContent = `Niveau ${myLevel}`;
            }

            currentProfileId = targetId ? targetId : loggedInUserId;
            isOwner = (currentProfileId === loggedInUserId);

            await loadProfileData(currentProfileId);
            startProfilePresenceListener(currentProfileId);
            setupSecurityAndEditMode();
            setupSaveButtons();
            initCropperEngine();

            const myProfileBtn = document.getElementById('btn-my-profile');
            if (myProfileBtn) {
                myProfileBtn.addEventListener('click', () => {
                    window.location.href = `admin-profile.html?id=${loggedInUserId}`;
                });
            }

        } else {
            window.location.replace('/login.html');
        }
    });
});

async function loadProfileData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));

        if (snap.exists()) {
            currentProfileData = snap.data();
            const data = currentProfileData;

            const displayName = `${data.prenom || ''} ${data.nom || ''}`.trim() || "Utilisateur Sans Nom";
            const nameEl = document.getElementById('prof-name');

            if (nameEl) {
                nameEl.innerHTML = `${displayName} <span id="prof-badge-zone" style="margin-left: 10px; font-size: 0.45em; vertical-align: middle;"></span>`;
            }

            if (document.getElementById('prof-bio-display')) {
                document.getElementById('prof-bio-display').textContent = data.bio || 'Élève de la plateforme SBI';
            }

            if (document.getElementById('prof-bio')) {
                document.getElementById('prof-bio').value = data.bio || '';
            }

            const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;
            const avatarImg = document.getElementById('prof-avatar-img');
            if (avatarImg) avatarImg.src = avatarUrl;

            maybeMigrateVisibleLegacyAvatar(uid, data, avatarImg);

            updateProfilePresenceStatus(data);

            const badgeZone = document.getElementById('prof-badge-zone');
            if (badgeZone) {
                if (data.isGod) {
                    badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-weight:bold;">SUPRÊME</span>`;
                } else if (data.role === 'admin') {
                    badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-weight:bold;">ADMIN</span>`;
                } else if (data.role === 'teacher') {
                    badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-weight:bold;">PROFESSEUR</span>`;
                } else {
                    badgeZone.innerHTML = `<span style="background:rgba(42, 87, 255, 0.15); color:#2A57FF; padding:4px 8px; border-radius:4px; font-weight:bold;">ÉLÈVE</span>`;
                }
            }

            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;

            if (document.getElementById('prof-level')) {
                document.getElementById('prof-level').textContent = level;
            }

            const badgeBronze = document.getElementById('badge-bronze');
            const badgeSilver = document.getElementById('badge-silver');
            const badgeGold = document.getElementById('badge-gold');
            const badgeDiamond = document.getElementById('badge-diamond');

            if (badgeBronze) badgeBronze.classList.remove('unlocked');
            if (badgeSilver) badgeSilver.classList.remove('unlocked');
            if (badgeGold) badgeGold.classList.remove('unlocked');
            if (badgeDiamond) badgeDiamond.classList.remove('unlocked');

            if (badgeBronze && level >= 2) badgeBronze.classList.add('unlocked');
            if (badgeSilver && level >= 5) badgeSilver.classList.add('unlocked');
            if (badgeGold && level >= 10) badgeGold.classList.add('unlocked');
            if (badgeDiamond && level >= 20) badgeDiamond.classList.add('unlocked');

            const xpEls = [
                document.getElementById('prof-xp'),
                document.getElementById('prof-xp-text')
            ];

            xpEls.forEach(el => {
                if (el) {
                    el.innerHTML = `${xp}`;

                    if (isAdmin) {
                        el.innerHTML = `${xp} ${SVG_EDIT}`;
                        el.style.cursor = 'pointer';
                        el.title = "Cliquez pour modifier l'XP brute";

                        el.onclick = async () => {
                            const newXp = prompt(`Modifier l'XP de cet élève (Actuel : ${xp}) :`, xp);

                            if (newXp !== null && !isNaN(newXp) && newXp.trim() !== "") {
                                await updateDoc(doc(db, "users", uid), {
                                    xp: parseInt(newXp)
                                });

                                loadProfileData(uid);
                            }
                        };
                    }
                }
            });

            if (document.getElementById('prof-xp-fill')) {
                document.getElementById('prof-xp-fill').style.width = Math.min((xp / 1000) * 100, 100) + '%';
            }

            if (isOwner || isAdmin) {
                const emailEl = document.getElementById('prof-email');

                if (emailEl) {
                    emailEl.tagName === 'INPUT'
                        ? emailEl.value = data.email || ''
                        : emailEl.textContent = data.email || '';
                }

                if (isOwner) {
                    const btnChangeAdmin = document.getElementById('btn-change-email-admin');
                    if (btnChangeAdmin) btnChangeAdmin.style.display = 'block';
                }

                if (document.getElementById('prof-phone')) {
                    document.getElementById('prof-phone').value = data.privateData?.phone || '';
                }

                if (document.getElementById('prof-address')) {
                    document.getElementById('prof-address').value = data.privateData?.address || '';
                }

                if (document.getElementById('prof-time')) {
                    const t = data.totalConnectionTime || 0;
                    document.getElementById('prof-time').textContent = `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
                }
            }

            if (document.getElementById('prof-activity-list')) {
                document.getElementById('prof-activity-list').innerHTML = `<li>Création du compte : ${data.dateCreation ? new Date(data.dateCreation).toLocaleDateString() : 'Date inconnue'}</li>`;
            }

            loadUserFormations(uid);

            if (document.getElementById('prof-tracking-list')) {
                loadLearningTracking(uid);
            }

        } else {
            console.warn("Utilisateur introuvable.");
        }
    } catch (e) {
        console.error("Erreur", e);
    }
}

async function loadLearningTracking(uid) {
    const list = document.getElementById('prof-tracking-list');
    list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">Chargement du dossier...</p>';

    try {
        const progress = await getUserLearningProgress(uid);
        const targetUserData = currentProfileData || {};
        const assignedFormations = await fetchAssignedFormationsForUser(uid, targetUserData);
        const formationKeys = getFormationLookupKeys(assignedFormations);
        const activeCourses = await fetchActiveCoursesForFormationKeys(formationKeys);

        const allCourses = {};
        const coursesToShow = new Set();

        activeCourses.forEach((courseData) => {
            allCourses[courseData.id] = courseData;
            coursesToShow.add(courseData.id);
        });

        const progressCourseIds = Object.keys(progress.courses || {});
        const canSeeExtraProgressCourses = isOwner || isAdmin;

        if (canSeeExtraProgressCourses) {
            const missingProgressCourseIds = progressCourseIds.filter((courseId) => !allCourses[courseId]);
            const progressCourses = await fetchCoursesByIds(missingProgressCourseIds);

            progressCourses.forEach((courseData) => {
                allCourses[courseData.id] = courseData;
                coursesToShow.add(courseData.id);
            });
        } else {
            progressCourseIds.forEach((courseId) => {
                if (allCourses[courseId]) coursesToShow.add(courseId);
            });
        }

        const sortedCourseIds = Array.from(coursesToShow).sort((a, b) => {
            return String(allCourses[a]?.titre || '').localeCompare(String(allCourses[b]?.titre || ''), 'fr', {
                sensitivity: 'base'
            });
        });

        if (sortedCourseIds.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Aucun cours assigné ou commencé.</p>';
            return;
        }

        list.innerHTML = '';
        const isStudentUI = !window.location.pathname.includes('admin');

        sortedCourseIds.forEach(cId => {
            const courseData = allCourses[cId];
            if (!courseData) return;
            const pData = (progress.courses && progress.courses[cId])
                ? progress.courses[cId]
                : {
                    status: 'todo',
                    completedChapters: []
                };

            const completedCount = pData.completedChapters ? pData.completedChapters.length : 0;
            const totalCount = courseData.chapitres ? courseData.chapitres.length : 0;

            let statusBadge = '';

            if (pData.status === 'done') {
                statusBadge = `<span style="background: rgba(42, 87, 255, 0.1); color: var(--accent-blue); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Terminé</span>`;
            } else if (pData.status === 'in_progress') {
                statusBadge = '<span style="background: rgba(251, 188, 4, 0.1); color: var(--accent-yellow); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">En cours</span>';
            } else {
                statusBadge = `<span style="background: ${isStudentUI ? '#f3f4f6' : 'rgba(255, 255, 255, 0.1)'}; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">À faire</span>`;
            }

            let quizHtml = '';

            if (courseData.chapitres) {
                courseData.chapitres.forEach(chap => {
                    if (chap.type === 'quiz') {
                        const totalPossible = computeQuizMaxScore(chap);

                        const scoreObtained = (pData.quizScores && pData.quizScores[chap.id] !== undefined)
                            ? Number(pData.quizScores[chap.id]) || 0
                            : 0;
                        const scoreDisplay = formatScore(scoreObtained);
                        const maxScoreDisplay = formatScore(totalPossible);

                        let editBtnHtml = '';

                        if (isAdmin) {
                            editBtnHtml = `<button class="action-btn btn-edit-grade" data-course="${cId}" data-chapter="${chap.id}" data-current="${scoreDisplay}" data-max="${totalPossible}" style="width: auto; margin: 0; padding: 4px 8px; font-size: 0.75rem; background: #333; color: white; border: none;">${SVG_EDIT} Éditer</button>`;
                        }

                        quizHtml += `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: ${isStudentUI ? '#f9fafb' : 'rgba(0,0,0,0.2)'}; padding: 0.5rem 1rem; border-radius: 6px; margin-top: 0.8rem; border: 1px solid ${isStudentUI ? 'var(--border-color)' : 'transparent'};">
                                <span style="font-size: 0.85rem; color: var(--text-muted);">${chap.titre}</span>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 0.85rem; font-weight: bold; color: ${scoreObtained === totalPossible && totalPossible > 0 ? 'var(--accent-blue)' : 'var(--text-main)'};">Score: ${scoreDisplay} / ${maxScoreDisplay}</span>
                                    ${editBtnHtml}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            let resetBtnHtml = '';

            if (isAdmin) {
                resetBtnHtml = `<button class="action-btn btn-reset-course danger" data-course="${cId}" style="width: auto; margin: 0; padding: 6px 10px; font-size: 0.8rem;">${SVG_RESET} Réinitialiser</button>`;
            }

            const html = `
                <div class="tracking-item" style="background: ${isStudentUI ? 'white' : '#111'}; border: 1px solid ${isStudentUI ? 'var(--border-color)' : '#333'}; border-radius: 8px; padding: 1rem; box-shadow: ${isStudentUI ? '0 2px 10px rgba(0,0,0,0.02)' : 'none'};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div>
                            <h5 class="tracking-title" style="margin: 0 0 0.5rem 0; color: var(--accent-blue); font-size: 1rem;">${courseData.titre}</h5>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                ${statusBadge}
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Étapes: ${completedCount} / ${totalCount}</span>
                            </div>
                        </div>
                        ${resetBtnHtml}
                    </div>
                    ${quizHtml}
                </div>
            `;

            list.insertAdjacentHTML('beforeend', html);
        });

        const searchInput = document.getElementById('search-tracking-admin');

        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();

                document.querySelectorAll('.tracking-item').forEach(item => {
                    const title = item.querySelector('.tracking-title').textContent.toLowerCase();
                    item.style.display = title.includes(term) ? 'block' : 'none';
                });
            };
        }

        if (isAdmin) {
            document.querySelectorAll('.btn-reset-course').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const cId = e.currentTarget.getAttribute('data-course');

                    if (confirm("⚠️ Réinitialiser ce cours ? L'élève perdra sa progression et l'XP liée aux QCM de ce cours. Cette action est irréversible.")) {
                        e.currentTarget.disabled = true;
                        e.currentTarget.textContent = "Reset...";

                        const success = await resetCourseProgress(uid, cId);

                        if (success) {
                            loadProfileData(uid);
                        } else {
                            alert("Erreur lors de la réinitialisation.");
                            e.currentTarget.disabled = false;
                        }
                    }
                });
            });

            document.querySelectorAll('.btn-edit-grade').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const cId = e.currentTarget.getAttribute('data-course');
                    const chapId = e.currentTarget.getAttribute('data-chapter');
                    const currentScore = e.currentTarget.getAttribute('data-current');
                    const maxScore = e.currentTarget.getAttribute('data-max');

                    const maxScoreLabel = Number(maxScore) > 0 ? ` / ${formatScore(maxScore)}` : '';
                    const newScoreStr = prompt(
                        `Modifier la note.
Actuelle : ${currentScore}${maxScoreLabel}

Écris uniquement la note obtenue, par exemple : 1 ou 1.5.
Le /2 reste accepté si tu le tapes, mais il n'est pas nécessaire.

Cette action ajuste l'XP globale de l'élève et marque le cours comme terminé.`,
                        currentScore
                    );

                    if (newScoreStr !== null) {
                        const newScore = parseGradeInput(newScoreStr, maxScore);

                        if (newScore !== null) {
                            e.currentTarget.disabled = true;
                            e.currentTarget.textContent = "Sauvegarde...";

                            const courseData = allCourses[cId] || {};
                            const chapterIdsToComplete = getCourseChapterIds(courseData);
                            const success = await updateQuizScore(uid, cId, chapId, newScore, chapterIdsToComplete);

                            if (success) {
                                loadProfileData(uid);
                            } else {
                                alert("Erreur lors de la mise à jour.");
                                e.currentTarget.disabled = false;
                            }
                        } else {
                            alert("Note invalide. Écris uniquement la note obtenue, par exemple : 1 ou 1.5.");
                        }
                    }
                });
            });
        }

    } catch (err) {
        console.error(err);
        list.innerHTML = '<p style="color: var(--accent-red); font-size: 0.9rem;">Erreur de chargement du suivi.</p>';
    }
}

async function loadUserFormations(uid) {
    const list = document.getElementById('prof-formations-list');
    if (!list) return;

    list.innerHTML = 'Recherche...';

    try {
        const res = await fetchAssignedFormationsForUser(uid, currentProfileData || {});

        if (res.length > 0) {
            if (window.location.pathname.includes('admin')) {
                list.innerHTML = res.map(a => `<span style="color: white; display:block; margin-bottom:5px; cursor:pointer;" onclick="window.location.href='/admin/index.html?tab=view-formations'">📁 ${escapeHTML(a.titre || 'Formation')}</span>`).join('');
            } else if (window.location.pathname.includes('teacher')) {
                list.innerHTML = res.map(a => `<span style="display:flex; align-items:center; gap:8px; margin-bottom:5px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.color='var(--accent-orange)'" onmouseout="this.style.color='inherit'" onclick="window.location.href='/teacher/mes-cours.html'"><div style="width:8px; height:8px; background:var(--accent-orange); border-radius:50%; flex-shrink:0;"></div>${escapeHTML(a.titre || 'Formation')}</span>`).join('');
            } else {
                list.innerHTML = res.map(a => `<span style="display:flex; align-items:center; gap:8px; margin-bottom:5px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='inherit'" onclick="window.location.href='/student/mes-cours.html'"><div style="width:8px; height:8px; background:var(--accent-blue); border-radius:50%; flex-shrink:0;"></div>${escapeHTML(a.titre || 'Formation')}</span>`).join('');
            }
        } else {
            list.innerHTML = 'Aucune formation assignée.';
        }
    } catch (e) {
        console.error("Erreur chargement formations profil", e);
        list.innerHTML = 'Erreur.';
    }
}

function setupSecurityAndEditMode() {
    const btnToggleEdit = document.getElementById('btn-toggle-edit');

    if (isOwner || isAdmin) {
        document.querySelectorAll('.private-section').forEach(el => {
            el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-flex';
        });

        if (btnToggleEdit && isOwner) {
            btnToggleEdit.addEventListener('click', () => {
                isEditMode = !isEditMode;
                document.body.classList.toggle('editing', isEditMode);

                const span = btnToggleEdit.querySelector('span');

                if (isEditMode) {
                    if (span) span.textContent = 'Quitter édition';

                    btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
                    btnToggleEdit.style.color = 'var(--accent-red)';
                    btnToggleEdit.style.borderColor = 'transparent';

                    document.querySelectorAll('.edit-mode-only').forEach(el => {
                        el.style.display = 'flex';
                    });

                    ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => {
                        if (document.getElementById(id)) {
                            document.getElementById(id).disabled = false;
                        }
                    });
                } else {
                    if (span) span.textContent = 'Modifier mon profil';

                    btnToggleEdit.style.background = 'white';
                    btnToggleEdit.style.color = 'var(--text-main)';
                    btnToggleEdit.style.borderColor = 'var(--border-color)';

                    document.querySelectorAll('.edit-mode-only').forEach(el => {
                        el.style.display = 'none';
                    });

                    ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => {
                        if (document.getElementById(id)) {
                            document.getElementById(id).disabled = true;
                        }
                    });
                }
            });
        }
    } else {
        ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => {
            if (document.getElementById(id)) {
                document.getElementById(id).disabled = true;
            }
        });
    }
}

function setupSaveButtons() {
    document.getElementById('btn-save-public')?.addEventListener('click', async () => {
        if (!isOwner && !isAdmin) return;

        await updateDoc(doc(db, "users", currentProfileId), {
            bio: document.getElementById('prof-bio').value
        });

        alert("Profil public mis à jour !");
        loadProfileData(currentProfileId);
    });

    document.getElementById('btn-save-private')?.addEventListener('click', async () => {
        if (!isOwner && !isAdmin) return;

        await updateDoc(doc(db, "users", currentProfileId), {
            privateData: {
                phone: document.getElementById('prof-phone').value,
                address: document.getElementById('prof-address').value
            }
        });

        alert("Données privées sécurisées !");
    });
}

function initCropperEngine() {
    const modal = document.getElementById('crop-modal');
    const input = document.getElementById('pfp-file-input');
    const imageElement = document.getElementById('crop-image');

    if (!modal || !input || !imageElement) return;

    let originalImageDataUrl = null;

    function compressImage(file, maxWidth, callback) {
        const reader = new FileReader();

        reader.onload = function(event) {
            const img = new Image();

            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height *= maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                callback(canvas.toDataURL('image/webp', 0.9));
            };

            img.src = event.target.result;
        };

        reader.readAsDataURL(file);
    }

    function launchCropper(src) {
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }

        imageElement.crossOrigin = "anonymous";
        imageElement.src = src;

        setTimeout(() => {
            cropperInstance = new Cropper(imageElement, {
                aspectRatio: 1,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 1,
                cropBoxMovable: false,
                cropBoxResizable: false,
                guides: false,
                highlight: false,
                background: true
            });
        }, 150);
    }

    const openTrigger = document.getElementById('btn-trigger-crop');

    if (openTrigger) {
        openTrigger.addEventListener('click', () => {
            modal.style.display = 'flex';

            const imageToLoad = (currentProfileData && currentProfileData.photoOriginal)
                ? currentProfileData.photoOriginal
                : (currentProfileData && currentProfileData.photoURL ? currentProfileData.photoURL : null);

            if (imageToLoad) {
                originalImageDataUrl = imageToLoad;
                launchCropper(imageToLoad);
            } else {
                input.click();
            }
        });
    }

    document.getElementById('btn-upload-new')?.addEventListener('click', () => {
        input.click();
    });

    input.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            modal.style.display = 'flex';

            const btnSave = document.getElementById('btn-save-crop');
            const originalText = btnSave.textContent;

            btnSave.textContent = "Traitement...";
            btnSave.disabled = true;

            compressImage(e.target.files[0], 800, (compressedBase64) => {
                originalImageDataUrl = compressedBase64;
                launchCropper(compressedBase64);
                input.value = '';

                btnSave.textContent = originalText;
                btnSave.disabled = false;
            });
        }
    });

    document.getElementById('btn-cancel-crop')?.addEventListener('click', () => {
        modal.style.display = 'none';

        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }

        imageElement.src = '';
    });

    document.getElementById('btn-save-crop')?.addEventListener('click', async () => {
        if (!cropperInstance || !currentProfileId || !originalImageDataUrl) return;

        const btnSave = document.getElementById('btn-save-crop');

        btnSave.textContent = "Mise à jour...";
        btnSave.disabled = true;

        const croppedCanvas = cropperInstance.getCroppedCanvas({
            width: 200,
            height: 200
        });

        const croppedWebpData = croppedCanvas.toDataURL('image/webp', 0.8);

        try {
            await saveProfileAvatarToStorage(
                currentProfileId,
                croppedWebpData,
                currentProfileData?.photoStoragePath || null,
                {
                    prefix: 'avatar',
                    migratedFrom: 'profile-cropper'
                }
            );

            loadProfileData(currentProfileId);

            modal.style.display = 'none';

            if (cropperInstance) {
                cropperInstance.destroy();
                cropperInstance = null;
            }

            imageElement.src = '';
        } catch (e) {
            console.error(e);
            alert("Erreur réseau ou fichier trop lourd.");
        } finally {
            btnSave.textContent = "Appliquer";
            btnSave.disabled = false;
        }
    });
}
