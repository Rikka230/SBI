/**
 * =======================================================================
 * NOTIFICATIONS - Écoute temps réel et actions
 * =======================================================================
 *
 * Étape 5.2.4C fix :
 * - correction visualisation cours validé côté professeur
 * - le bouton prof ouvre /teacher/cours-viewer.html
 * - évite la redirection dashboard causée par la route student
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { waitForSbiTopbar } from '/admin/js/components/ready.js';
import { setupGlobalSearch, clearGlobalSearchCache } from '/admin/js/global-search.js';

let currentUid = null;
let currentUserProfile = null;

let notificationUnsubscribers = [];
let notificationStreams = new Map();
let notificationsInitializedForUid = null;

/* =======================================================================
 * SECTION 1 : INITIALISATION
 * ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        cleanupNotificationListeners();
        clearGlobalSearchCache();

        if (!user) {
            currentUid = null;
            currentUserProfile = null;
            notificationsInitializedForUid = null;
            updateRedBadges(0);
            renderNotificationsList([]);
            return;
        }

        currentUid = user.uid;

        await waitForSbiTopbar();

        const userSnap = await getDoc(doc(db, "users", currentUid));

        if (userSnap.exists()) {
            currentUserProfile = userSnap.data();

            const displayName = `${currentUserProfile.prenom || ''} ${currentUserProfile.nom || ''}`.trim() || "Utilisateur";

            let bgColor = "111";
            let textColor = "fff";

            if (currentUserProfile.role === 'student') {
                bgColor = "e5e7eb";
                textColor = "2A57FF";
            } else if (currentUserProfile.role === 'teacher') {
                bgColor = "fef3c7";
                textColor = "f59e0b";
            }

            const avatarUrl = currentUserProfile.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=${bgColor}&color=${textColor}`;
            const userXp = currentUserProfile.xp || 0;
            const userLevel = Math.floor(userXp / 100) + 1;

            const topName = document.getElementById('top-user-name');
            if (topName) {
                topName.textContent = displayName;
            }

            const topAvatar = document.getElementById('top-user-avatar');
            if (topAvatar) {
                topAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
            }

            const topLevel = document.getElementById('top-user-level');
            if (topLevel) {
                topLevel.textContent = `Niveau ${userLevel}`;
            }
        }

        initNotificationsRealtime();

        setTimeout(() => {
            setupGlobalSearch({
                currentUid,
                currentUserProfile
            });
        }, 500);
    });

    document.body.addEventListener('click', (e) => {
        const bellBtn = e.target.closest('#notif-bell-btn');
        const notifSection = document.getElementById('notifications-section');
        const profileSection = document.getElementById('profile-section');
        const titleNotif = document.getElementById('notif-panel-title');

        if (bellBtn) {
            if (notifSection) {
                let activeColor = 'var(--accent-blue)';

                if (window.location.pathname.includes('student')) {
                    activeColor = 'var(--accent-green)';
                }

                if (window.location.pathname.includes('teacher')) {
                    activeColor = 'var(--accent-orange)';
                }

                if (notifSection.style.display === 'none' || notifSection.style.display === '') {
                    if (profileSection) {
                        profileSection.style.display = 'none';
                    }

                    notifSection.style.display = 'block';

                    if (titleNotif) {
                        titleNotif.style.display = 'block';
                    }

                    const svg = bellBtn.querySelector('svg');
                    if (svg) {
                        svg.style.fill = activeColor;
                    }
                } else {
                    closeNotificationsPanel();
                }
            }
        } else if (
            notifSection &&
            notifSection.style.display === 'block' &&
            !e.target.closest('#notifications-section') &&
            !e.target.closest('#sbi-validation-action-modal') &&
            !e.target.closest('#sbi-student-course-action-modal') &&
            !e.target.closest('#teacher-action-modal')
        ) {
            closeNotificationsPanel();
        }
    });
});

/* =======================================================================
 * SECTION 2 : TEMPS RÉEL
 * ======================================================================= */

function cleanupNotificationListeners() {
    notificationUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });

    notificationUnsubscribers = [];
    notificationStreams = new Map();
}

function isAdminLike() {
    return currentUserProfile?.isGod === true || currentUserProfile?.role === 'admin';
}

function isNotificationDismissedForCurrentUser(notif) {
    if (!notif || !currentUid) return true;
    if (!Array.isArray(notif.dismissedBy)) return false;

    return notif.dismissedBy.includes(currentUid);
}

function isNotificationResolved(notif) {
    return notif?.status === 'resolved' || Boolean(notif?.resolvedAt);
}

function isNotificationRelevantForCurrentUser(notif) {
    if (!notif || !currentUid) return false;
    if (isNotificationResolved(notif)) return false;
    if (isNotificationDismissedForCurrentUser(notif)) return false;

    if (notif.destinataireId && notif.destinataireId === currentUid) {
        return true;
    }

    if (Array.isArray(notif.targetStudents) && notif.targetStudents.includes(currentUid)) {
        return true;
    }

    if (notif.type === 'course_validation' && isAdminLike()) {
        return true;
    }

    return false;
}

function initNotificationsRealtime() {
    if (!currentUid || !currentUserProfile) return;

    if (notificationsInitializedForUid === currentUid) {
        return;
    }

    cleanupNotificationListeners();
    notificationsInitializedForUid = currentUid;

    const listeners = [];

    listeners.push({
        key: 'direct',
        ref: query(
            collection(db, "notifications"),
            where("destinataireId", "==", currentUid)
        )
    });

    listeners.push({
        key: 'studentTargets',
        ref: query(
            collection(db, "notifications"),
            where("targetStudents", "array-contains", currentUid)
        )
    });

    if (isAdminLike()) {
        listeners.push({
            key: 'adminValidations',
            ref: query(
                collection(db, "notifications"),
                where("type", "==", "course_validation")
            )
        });
    }

    listeners.forEach(({ key, ref }) => {
        const unsubscribe = onSnapshot(ref, (snapshot) => {
            const streamMap = new Map();

            snapshot.forEach((docSnap) => {
                const data = {
                    id: docSnap.id,
                    ...docSnap.data()
                };

                if (isNotificationRelevantForCurrentUser(data)) {
                    streamMap.set(docSnap.id, data);
                }
            });

            notificationStreams.set(key, streamMap);
            renderCombinedNotifications();

        }, (error) => {
            console.error(`[SBI Notifications] Erreur écoute ${key}:`, error);
        });

        notificationUnsubscribers.push(unsubscribe);
    });
}

function getCombinedNotifications() {
    const combinedMap = new Map();

    notificationStreams.forEach((streamMap) => {
        streamMap.forEach((notif, id) => {
            if (isNotificationRelevantForCurrentUser(notif)) {
                combinedMap.set(id, notif);
            }
        });
    });

    return Array.from(combinedMap.values()).sort((a, b) => {
        const dateA = a.dateCreation?.toMillis ? a.dateCreation.toMillis() : 0;
        const dateB = b.dateCreation?.toMillis ? b.dateCreation.toMillis() : 0;
        return dateB - dateA;
    });
}

function renderCombinedNotifications() {
    const notifs = getCombinedNotifications();

    updateRedBadges(notifs.length);
    renderNotificationsList(notifs);
}

async function dismissNotificationForCurrentUser(notifId) {
    if (!notifId || !currentUid) return;

    try {
        await updateDoc(doc(db, "notifications", notifId), {
            dismissedBy: arrayUnion(currentUid)
        });
    } catch (error) {
        console.error("[SBI Notifications] Impossible de masquer la notification :", error);
    }
}

/* =======================================================================
 * SECTION 3 : AFFICHAGE
 * ======================================================================= */

function updateRedBadges(count) {
    const bellBadge = document.getElementById('bell-badge');
    const avatarBadge = document.getElementById('avatar-badge');

    if (!bellBadge && document.querySelector('teacher-top-bar, admin-top-bar, student-top-bar')) {
        setTimeout(() => updateRedBadges(count), 100);
        return;
    }

    if (count > 0) {
        const displayCount = count > 9 ? '9+' : count;

        if (bellBadge) {
            bellBadge.textContent = displayCount;
            bellBadge.style.display = '';
        }

        if (avatarBadge) {
            avatarBadge.textContent = displayCount;
            avatarBadge.style.display = '';
        }
    } else {
        if (bellBadge) {
            bellBadge.style.display = 'none';
        }

        if (avatarBadge) {
            avatarBadge.style.display = 'none';
        }
    }
}

function renderNotificationsList(notifs) {
    const container = document.getElementById('notifications-list');

    if (!container && document.querySelector('teacher-top-bar, admin-top-bar, student-top-bar')) {
        setTimeout(() => renderNotificationsList(notifs), 100);
        return;
    }

    if (!container) return;

    container.innerHTML = '';

    if (notifs.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem;">Aucune nouvelle notification.</p>`;
        return;
    }

    notifs.forEach((notif) => {
        const dotIndicator = `<div style="width:8px; height:8px; min-width:8px; background:var(--accent-red, #ff4a4a); border-radius:50%; flex-shrink:0; margin-top: 5px;"></div>`;

        let titleText = "";
        let bodyText = "";
        let iconSvg = "";

        if (notif.type === 'new_course_published') {
            titleText = "Nouveau cours disponible !";
            bodyText = `Le cours <strong>${notif.courseTitle}</strong> est maintenant disponible.`;
            iconSvg = `<svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="var(--accent-blue, #2A57FF)" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>`;
        } else if (notif.type === 'course_approved') {
            titleText = "Cours Validé !";
            bodyText = `Votre cours "<strong>${notif.courseTitle}</strong>" a été publié.`;
            iconSvg = `<svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="var(--accent-green, #10b981)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        } else if (notif.type === 'course_rejected') {
            titleText = "Cours Refusé";
            bodyText = `Votre cours "<strong>${notif.courseTitle}</strong>" nécessite des modifications.`;
            iconSvg = `<svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="var(--accent-red, #ff4a4a)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>`;
        } else if (notif.type === 'course_deleted') {
            titleText = "Cours supprimé";
            bodyText = `Votre cours "<strong>${notif.courseTitle}</strong>" a été supprimé par l'administration.`;
            iconSvg = `<svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="var(--accent-red, #ff4a4a)" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
        } else {
            titleText = "Validation requise";
            bodyText = `<strong>${notif.auteurName}</strong> a soumis "<strong>${notif.courseTitle}</strong>".`;
            iconSvg = `<svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="var(--accent-yellow, #fbbc04)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        }

        const safeTitle = notif.courseTitle ? String(notif.courseTitle).replace(/"/g, '&quot;') : 'Cours';
        const safeAuthor = notif.auteurName ? String(notif.auteurName).replace(/"/g, '&quot;') : 'Professeur';

        const html = `
            <div class="notif-item" data-id="${notif.id}" data-type="${notif.type}" data-course="${notif.courseId}" data-title="${safeTitle}" data-author="${safeAuthor}" style="display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--border-color, #333); cursor: pointer; transition: background 0.2s; background: rgba(128, 128, 128, 0.05);">
                ${dotIndicator}
                <div style="flex-shrink:0;">${iconSvg}</div>
                <div>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-main, #fff); font-weight:bold;">${titleText}</p>
                    <p style="margin:0.3rem 0 0 0; font-size:0.8rem; color:var(--text-muted, #9ca3af); line-height: 1.4;">${bodyText}</p>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.notif-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const notifId = e.currentTarget.getAttribute('data-id');
            const notifType = e.currentTarget.getAttribute('data-type');
            const courseId = e.currentTarget.getAttribute('data-course');
            const courseTitle = e.currentTarget.getAttribute('data-title');
            const auteurName = e.currentTarget.getAttribute('data-author');

            if (notifType === 'course_validation') {
                showAdminValidationActionModal({
                    notifId,
                    courseId,
                    courseTitle,
                    auteurName
                });
                return;
            }

            if (notifType === 'new_course_published') {
                showStudentCourseActionModal({
                    notifId,
                    courseId,
                    courseTitle
                });
                return;
            }

            e.currentTarget.style.display = 'none';

            await dismissNotificationForCurrentUser(notifId);

            closeNotificationsPanel();

            let userRole = 'student';

            if (currentUserProfile) {
                if (currentUserProfile.isGod) {
                    userRole = 'admin';
                } else if (currentUserProfile.role) {
                    userRole = currentUserProfile.role;
                }
            }

            if (notifType === 'course_approved') {
                showTeacherCourseActionModal(courseId, courseTitle);
            } else if (notifType === 'course_deleted') {
                return;
            } else if (notifType === 'course_rejected') {
                if (userRole === 'teacher') {
                    window.location.assign(`/teacher/mes-cours.html?edit=${courseId}`);
                } else {
                    window.location.assign(`/admin/formations-cours.html?edit=${courseId}`);
                }
            } else {
                if (window.location.pathname.includes('formations-cours.html') && typeof window.editCourse === 'function') {
                    window.editCourse(courseId);
                } else {
                    window.location.assign(`/admin/formations-cours.html?edit=${courseId}`);
                }
            }
        });
    });
}

function closeNotificationsPanel() {
    const notifSection = document.getElementById('notifications-section');
    const profileSection = document.getElementById('profile-section');
    const titleNotif = document.getElementById('notif-panel-title');

    if (notifSection) {
        notifSection.style.display = 'none';
    }

    if (profileSection) {
        profileSection.style.display = 'block';
    }

    if (titleNotif) {
        titleNotif.style.display = 'none';
    }

    const bellIcon = document.querySelector('#notif-bell-btn svg');
    if (bellIcon) {
        bellIcon.style.fill = 'var(--text-muted, #9ca3af)';
    }
}

/* =======================================================================
 * SECTION 4 : MODALES
 * ======================================================================= */

function closeValidationActionModal() {
    const modal = document.getElementById('sbi-validation-action-modal');
    if (!modal) return;

    modal.style.opacity = '0';
    const panel = modal.querySelector('[data-modal-panel]');
    if (panel) {
        panel.style.transform = 'translateY(14px) scale(0.98)';
    }

    window.setTimeout(() => {
        modal.remove();
        closeNotificationsPanel();
    }, 220);
}

function closeStudentCourseActionModal() {
    const modal = document.getElementById('sbi-student-course-action-modal');
    if (!modal) return;

    modal.style.opacity = '0';
    const panel = modal.querySelector('[data-modal-panel]');
    if (panel) {
        panel.style.transform = 'translateY(14px) scale(0.98)';
    }

    window.setTimeout(() => {
        modal.remove();
        closeNotificationsPanel();
    }, 220);
}

function showAdminValidationActionModal({ notifId, courseId, courseTitle, auteurName }) {
    let modal = document.getElementById('sbi-validation-action-modal');
    if (modal) modal.remove();

    closeNotificationsPanel();

    modal = document.createElement('div');
    modal.id = 'sbi-validation-action-modal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.68); backdrop-filter:blur(4px); opacity:0; transition:opacity 0.22s ease;';

    modal.innerHTML = `
        <div data-modal-panel style="width:min(92vw, 460px); background:var(--bg-card, #111); border:1px solid var(--border-color, #333); border-radius:14px; padding:2rem; box-shadow:0 18px 50px rgba(0,0,0,0.55); transform:translateY(14px) scale(0.98); transition:transform 0.22s ease;">
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.25rem;">
                <div style="width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(251,188,4,0.12); color:var(--accent-yellow, #fbbc04); flex-shrink:0;">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; color:var(--text-main, #fff); font-size:1.25rem;">Demande de validation</h3>
                    <p style="margin:0.25rem 0 0; color:var(--text-muted, #9ca3af); font-size:0.86rem;">Cette notification reste active tant que le cours n'est pas validé ou refusé.</p>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:1rem; margin-bottom:1.4rem;">
                <p style="margin:0 0 0.35rem; color:var(--text-muted, #9ca3af); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:bold;">Cours</p>
                <p style="margin:0; color:var(--text-main, #fff); font-weight:800;">${courseTitle}</p>
                <p style="margin:0.55rem 0 0; color:var(--text-muted, #9ca3af); font-size:0.88rem;">Soumis par ${auteurName || 'un professeur'}.</p>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                <button id="btn-validation-examine" style="width:100%; padding:0.95rem 1rem; border:none; border-radius:8px; cursor:pointer; background:var(--accent-blue, #2A57FF); color:white; font-weight:800;">
                    Examiner maintenant
                </button>
                <button id="btn-validation-later" style="width:100%; padding:0.95rem 1rem; border:1px solid var(--border-color, #333); border-radius:8px; cursor:pointer; background:transparent; color:var(--text-main, #fff); font-weight:700;">
                    Garder pour plus tard
                </button>
                <button id="btn-validation-dismiss" style="width:100%; padding:0.9rem 1rem; border:none; border-radius:8px; cursor:pointer; background:rgba(255,74,74,0.08); color:var(--accent-red, #ff4a4a); font-weight:800;">
                    Masquer pour moi
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const panel = modal.querySelector('[data-modal-panel]');
        if (panel) {
            panel.style.transform = 'translateY(0) scale(1)';
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeValidationActionModal();
        }
    });

    document.getElementById('btn-validation-examine').addEventListener('click', () => {
        closeValidationActionModal();

        if (window.location.pathname.includes('formations-cours.html') && typeof window.editCourse === 'function') {
            window.editCourse(courseId);
            return;
        }

        window.location.assign(`/admin/formations-cours.html?edit=${courseId}`);
    });

    document.getElementById('btn-validation-later').addEventListener('click', () => {
        closeValidationActionModal();
    });

    document.getElementById('btn-validation-dismiss').addEventListener('click', async () => {
        await dismissNotificationForCurrentUser(notifId);
        closeValidationActionModal();
    });
}

function showStudentCourseActionModal({ notifId, courseId, courseTitle }) {
    let modal = document.getElementById('sbi-student-course-action-modal');
    if (modal) modal.remove();

    closeNotificationsPanel();

    modal = document.createElement('div');
    modal.id = 'sbi-student-course-action-modal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.68); backdrop-filter:blur(4px); opacity:0; transition:opacity 0.22s ease;';

    modal.innerHTML = `
        <div data-modal-panel style="width:min(92vw, 440px); background:var(--bg-card, #111); border:1px solid var(--border-color, #333); border-radius:14px; padding:2rem; box-shadow:0 18px 50px rgba(0,0,0,0.55); transform:translateY(14px) scale(0.98); transition:transform 0.22s ease;">
            <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.25rem;">
                <div style="width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(42,87,255,0.13); color:var(--accent-blue, #2A57FF); flex-shrink:0;">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; color:var(--text-main, #fff); font-size:1.25rem;">Nouveau cours disponible</h3>
                    <p style="margin:0.25rem 0 0; color:var(--text-muted, #9ca3af); font-size:0.86rem;">Tu peux l’ouvrir maintenant ou le garder pour plus tard.</p>
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:1rem; margin-bottom:1.4rem;">
                <p style="margin:0 0 0.35rem; color:var(--text-muted, #9ca3af); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:bold;">Cours</p>
                <p style="margin:0; color:var(--text-main, #fff); font-weight:800;">${courseTitle}</p>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                <button id="btn-student-open-course" style="width:100%; padding:0.95rem 1rem; border:none; border-radius:8px; cursor:pointer; background:var(--accent-blue, #2A57FF); color:white; font-weight:800;">
                    Ouvrir le cours
                </button>
                <button id="btn-student-later" style="width:100%; padding:0.95rem 1rem; border:1px solid var(--border-color, #333); border-radius:8px; cursor:pointer; background:transparent; color:var(--text-main, #fff); font-weight:700;">
                    Garder pour plus tard
                </button>
                <button id="btn-student-dismiss" style="width:100%; padding:0.9rem 1rem; border:none; border-radius:8px; cursor:pointer; background:rgba(255,74,74,0.08); color:var(--accent-red, #ff4a4a); font-weight:800;">
                    Masquer pour moi
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const panel = modal.querySelector('[data-modal-panel]');
        if (panel) {
            panel.style.transform = 'translateY(0) scale(1)';
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeStudentCourseActionModal();
        }
    });

    document.getElementById('btn-student-open-course').addEventListener('click', async () => {
        await dismissNotificationForCurrentUser(notifId);
        closeStudentCourseActionModal();
        window.location.assign(`/student/cours-viewer.html?id=${courseId}`);
    });

    document.getElementById('btn-student-later').addEventListener('click', () => {
        closeStudentCourseActionModal();
    });

    document.getElementById('btn-student-dismiss').addEventListener('click', async () => {
        await dismissNotificationForCurrentUser(notifId);
        closeStudentCourseActionModal();
    });
}

function showTeacherCourseActionModal(courseId, courseTitle) {
    let modal = document.getElementById('teacher-action-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'teacher-action-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px); opacity:0; transition: opacity 0.3s ease;';
        document.body.appendChild(modal);
    }

    const eyeSvg = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 8px;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
    const editSvg = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 8px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

    modal.innerHTML = `
        <div style="background: var(--bg-card, #111); padding: 2.5rem 2rem; border-radius: 12px; border: 1px solid var(--border-color, #333); max-width: 420px; width: 90%; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.6); transform: translateY(20px); transition: transform 0.3s ease;">
            <div style="width: 60px; height: 60px; background: rgba(16, 185, 129, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
                <svg width="32" height="32" style="min-width:32px; flex-shrink:0;" fill="var(--accent-green, #10b981)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </div>
            <h3 style="color: var(--text-main, white); margin-top: 0; font-size: 1.5rem; margin-bottom: 0.5rem;">Cours en ligne !</h3>
            <p style="color: var(--text-muted, #aaa); margin-bottom: 2rem; font-size: 0.95rem; line-height: 1.5;">
                Félicitations, votre cours <strong style="color: var(--accent-orange, #f59e0b);">${courseTitle}</strong> a été validé et est désormais accessible aux élèves.
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                <button id="btn-modal-view" style="width: 100%; padding: 0.9rem; background: var(--accent-blue, #2A57FF); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: background 0.2s;">
                    ${eyeSvg} Visualiser le cours
                </button>
                <button id="btn-modal-edit" style="width: 100%; padding: 0.9rem; background: transparent; color: var(--text-main, white); border: 1px solid var(--border-color, #444); border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    ${editSvg} Ouvrir dans l'éditeur
                </button>
                <button id="btn-modal-close" style="width: 100%; padding: 0.8rem; background: transparent; color: var(--accent-red, #ff4a4a); border: none; font-weight: bold; cursor: pointer; margin-top: 0.5rem;">Fermer</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.querySelector('div').style.transform = 'translateY(0)';
    });

    document.getElementById('btn-modal-view').onclick = () => {
        modal.style.display = 'none';
        closeNotificationsPanel();
        window.open(`/teacher/cours-viewer.html?id=${courseId}&preview=true`, '_blank');
    };

    document.getElementById('btn-modal-edit').onclick = () => {
        modal.style.display = 'none';
        closeNotificationsPanel();
        window.location.assign(`/teacher/mes-cours.html?edit=${courseId}`);
    };

    document.getElementById('btn-modal-close').onclick = () => {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            closeNotificationsPanel();
        }, 300);
    };
}
