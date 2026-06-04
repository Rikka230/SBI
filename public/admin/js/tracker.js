/**
 * =======================================================================
 * TRACKER DE SESSION - Statut en ligne, Temps & Affichage Profil Menu
 * =======================================================================
 *
 * 8.0P.166.5 :
 * - le profil du panel droit n’attend plus la mise à jour présence Firestore ;
 * - hydrateNavProfile réessaie si le Web Component admin-right-panel n’est pas encore monté ;
 * - cache session pour afficher nom/avatar/rôle plus vite ;
 * - présence conservée, mais en arrière-plan.
 * 8.0P.167.42 :
 * - première connexion : import du gate de validation obligatoire.
 * 8.0P.167.44 :
 * - permissions/rôles centralisés via sbi-permissions.js.
 * 8.0P.167.97-GPT2.2 :
 * - profils : admin/prof sans XP/badges, prof avec liste élèves suivis.
 * 8.0P.167.116 :
 * - correctif responsive des panneaux première connexion / information étudiant.
 * 8.0P.167.117 :
 * - wording panneau information étudiant : ordinateur recommandé, mobile à éviter temporairement.
 * =======================================================================
 */

import '/js/auth.js?v=8.0P.167.44';
import '/js/first-login-gate.js?v=8.0P.167.314';
import '/student/js/student-visible-documents.js?v=8.0P.167.205';

import { db, auth } from '/js/firebase-init.js';
import {
    doc,
    getDoc,
    updateDoc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getSbiRoleLabel } from "/js/sbi-permissions.js?v=8.0P.167.44";

let sessionStart = Date.now();
let activeUid = null;
let connectionSyncIntervalId = null;
let heartbeatIntervalId = null;
let lastNavProfilePayload = null;

const CONNECTION_SYNC_INTERVAL_MS = 300000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 30000;
const NAV_PROFILE_CACHE_PREFIX = 'sbi:navProfile:';
const NAV_PROFILE_MAX_ATTEMPTS = 20;
const RESPONSIVE_PANEL_STYLE_ID = 'sbi-responsive-panel-fixes-8-0p-167-117';

function injectResponsivePanelFixes() {
    if (document.getElementById(RESPONSIVE_PANEL_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = RESPONSIVE_PANEL_STYLE_ID;
    style.textContent = `
        body.sbi-first-login-locked,
        body.sbi-student-notice-locked {
            overflow: hidden !important;
        }

        .sbi-first-login-gate,
        .sbi-student-construction-notice {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: center !important;
            min-height: 100dvh !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
            padding: clamp(0.7rem, 2vw, 1.2rem) !important;
        }

        .sbi-first-login-card,
        .sbi-student-notice-card {
            display: flex !important;
            flex-direction: column !important;
            width: min(720px, 100%) !important;
            max-height: calc(100dvh - 2rem) !important;
            min-height: 0 !important;
            overflow: hidden !important;
        }

        .sbi-first-login-head,
        .sbi-student-notice-head {
            flex: 0 0 auto !important;
        }

        .sbi-first-login-body,
        .sbi-student-notice-body {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            scrollbar-gutter: stable !important;
            -webkit-overflow-scrolling: touch !important;
        }

        .sbi-first-login-actions,
        .sbi-student-notice-actions {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 2 !important;
            padding-top: 0.85rem !important;
            background: linear-gradient(180deg, rgba(5, 8, 17, 0), rgba(5, 8, 17, 0.98) 28%) !important;
        }

        .sbi-first-login-body::-webkit-scrollbar,
        .sbi-student-notice-body::-webkit-scrollbar {
            width: 9px;
        }

        .sbi-first-login-body::-webkit-scrollbar-track,
        .sbi-student-notice-body::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.04);
            border-radius: 999px;
        }

        .sbi-first-login-body::-webkit-scrollbar-thumb,
        .sbi-student-notice-body::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(42, 87, 255, 0.72), rgba(0, 212, 255, 0.38));
            border: 2px solid rgba(3, 7, 18, 0.85);
            border-radius: 999px;
        }

        @media (max-width: 640px), (max-height: 740px) {
            .sbi-first-login-gate,
            .sbi-student-construction-notice {
                padding: max(0.55rem, env(safe-area-inset-top)) 0.65rem max(0.65rem, env(safe-area-inset-bottom)) !important;
            }

            .sbi-first-login-card,
            .sbi-student-notice-card {
                width: 100% !important;
                max-height: calc(100dvh - 1.2rem) !important;
                border-radius: 18px !important;
            }

            .sbi-first-login-head,
            .sbi-student-notice-head {
                padding-top: 1rem !important;
                padding-bottom: 0.85rem !important;
            }

            .sbi-first-login-body,
            .sbi-student-notice-body {
                padding-top: 0.95rem !important;
                padding-bottom: 1rem !important;
            }

            .sbi-first-login-checks,
            .sbi-student-notice-advice,
            .sbi-student-notice-patch {
                gap: 0.58rem !important;
            }

            .sbi-first-login-check,
            .sbi-student-notice-advice-item,
            .sbi-student-notice-patch li {
                padding: 0.72rem 0.78rem !important;
            }
        }
    `;

    document.head.appendChild(style);
}

injectResponsivePanelFixes();

const clearTrackerIntervals = () => {
    if (connectionSyncIntervalId) {
        window.clearInterval(connectionSyncIntervalId);
        connectionSyncIntervalId = null;
    }

    if (heartbeatIntervalId) {
        window.clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
};

const getActiveUserRef = () => {
    if (!activeUid) return null;
    return doc(db, "users", activeUid);
};

const updateActiveUser = async (payload) => {
    const userRef = getActiveUserRef();
    if (!userRef) return;

    try {
        await updateDoc(userRef, payload);
    } catch (error) {
        console.warn("[SBI Tracker] Mise à jour présence impossible :", error);
    }
};

const syncConnectionTime = async (extraPayload = {}) => {
    if (!activeUid) return;

    const now = Date.now();
    const diffSeconds = Math.floor((now - sessionStart) / 1000);
    sessionStart = now;

    const payload = { ...extraPayload };

    if (diffSeconds > 0) {
        payload.totalConnectionTime = increment(diffSeconds);
    }

    if (Object.keys(payload).length > 0) {
        await updateActiveUser(payload);
    }
};

const markOnline = async () => {
    if (!activeUid) return;

    await updateActiveUser({
        isOnline: true,
        lastSeenAt: serverTimestamp()
    });
};

const markOffline = async () => {
    if (!activeUid) return;

    await syncConnectionTime({
        isOnline: false,
        lastSeenAt: serverTimestamp()
    });
};

const startTrackerIntervals = () => {
    clearTrackerIntervals();

    connectionSyncIntervalId = window.setInterval(() => {
        if (!activeUid) return;
        syncConnectionTime().catch(() => {});
    }, CONNECTION_SYNC_INTERVAL_MS);

    heartbeatIntervalId = window.setInterval(() => {
        if (!activeUid) return;
        if (document.visibilityState !== 'visible') return;

        markOnline().catch(() => {});
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
};

function getNavProfileCacheKey(uid) {
    return `${NAV_PROFILE_CACHE_PREFIX}${uid}`;
}

function readNavProfileCache(uid) {
    try {
        const raw = sessionStorage.getItem(getNavProfileCacheKey(uid));
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function writeNavProfileCache(uid, payload) {
    try {
        sessionStorage.setItem(getNavProfileCacheKey(uid), JSON.stringify({
            ...payload,
            cachedAt: Date.now()
        }));
    } catch (_) {}
}

function getDisplayName(data = {}) {
    return `${data.prenom || ''} ${data.nom || ''}`.trim()
        || data.displayName
        || data.email
        || 'Utilisateur';
}

function getRoleLabel(data = {}) {
    return getSbiRoleLabel(data);
}

function getFallbackAvatarLabel(data = {}) {
    const name = getDisplayName(data);
    return (name || 'U').charAt(0).toUpperCase();
}

function renderNavProfile(data, attempt = 0) {
    if (!data) return false;

    const navName = document.getElementById('nav-name');
    const navRole = document.getElementById('nav-role');
    const navAvatar = document.getElementById('nav-avatar');

    if (!navName && !navRole && !navAvatar) {
        if (attempt < NAV_PROFILE_MAX_ATTEMPTS) {
            window.setTimeout(() => renderNavProfile(data, attempt + 1), attempt < 6 ? 80 : 160);
        }
        return false;
    }

    const displayName = getDisplayName(data);

    if (navName) {
        navName.textContent = displayName;
    }

    if (navRole) {
        navRole.textContent = getRoleLabel(data);
    }

    if (navAvatar) {
        if (data.photoURL) {
            navAvatar.innerHTML = `<img src="${escapeHTML(data.photoURL)}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeHTML(displayName)}">`;
        } else {
            navAvatar.textContent = getFallbackAvatarLabel(data);
        }
    }

    return true;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const hydrateNavProfile = async (uid) => {
    if (!uid) return;

    const cached = readNavProfileCache(uid);
    if (cached) {
        lastNavProfilePayload = cached;
        renderNavProfile(cached);
    }

    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return;

        const data = snap.data() || {};
        const payload = {
            uid,
            prenom: data.prenom || '',
            nom: data.nom || '',
            email: data.email || '',
            role: data.role || '',
            isGod: data.isGod === true,
            photoURL: data.photoURL || '',
            displayName: data.displayName || ''
        };

        lastNavProfilePayload = payload;
        writeNavProfileCache(uid, payload);
        renderNavProfile(payload);
    } catch (error) {
        console.error("Erreur chargement profil panel", error);
    }
};

function replayNavProfile() {
    if (lastNavProfilePayload) {
        renderNavProfile(lastNavProfilePayload);
        return;
    }

    const uid = activeUid || auth.currentUser?.uid;
    if (!uid) return;

    const cached = readNavProfileCache(uid);
    if (cached) {
        lastNavProfilePayload = cached;
        renderNavProfile(cached);
    }
}

onAuthStateChanged(auth, async (user) => {
    clearTrackerIntervals();

    if (activeUid && (!user || user.uid !== activeUid)) {
        markOffline().catch(() => {});
    }

    if (user) {
        activeUid = user.uid;
        sessionStart = Date.now();

        hydrateNavProfile(activeUid).catch(() => {});
        markOnline().catch(() => {});
        startTrackerIntervals();
    } else {
        activeUid = null;
        lastNavProfilePayload = null;
    }
});

window.addEventListener('sbi:component-mounted', (event) => {
    if (event?.detail?.name === 'admin-right-panel') {
        replayNavProfile();
    }
});

window.addEventListener('sbi:components-ready', replayNavProfile);

document.addEventListener("visibilitychange", () => {
    if (!activeUid) return;

    if (document.visibilityState === 'hidden') {
        markOffline().catch(() => {});
    } else if (document.visibilityState === 'visible') {
        sessionStart = Date.now();
        markOnline().catch(() => {});
        replayNavProfile();
    }
});

window.addEventListener('pagehide', () => {
    if (!activeUid) return;
    markOffline().catch(() => {});
});
