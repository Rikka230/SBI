/**
 * =======================================================================
 * TRACKER DE SESSION - Statut en ligne, Temps & Affichage Profil Menu
 * =======================================================================
 *
 * Présence robuste :
 * - isOnline indique l'état demandé par l'onglet actif.
 * - lastSeenAt est rafraîchi régulièrement avec serverTimestamp().
 * - les écrans admin / profil ne considèrent l'utilisateur en ligne que si
 *   isOnline === true ET lastSeenAt est récent.
 *
 * Cette logique évite les utilisateurs bloqués "en ligne" si l'onglet est
 * fermé brutalement et que le passage à false n'a pas le temps de partir.
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    doc,
    getDoc,
    updateDoc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let sessionStart = Date.now();
let activeUid = null;
let connectionSyncIntervalId = null;
let heartbeatIntervalId = null;

const CONNECTION_SYNC_INTERVAL_MS = 300000; // 5 minutes
const PRESENCE_HEARTBEAT_INTERVAL_MS = 30000; // 30 secondes

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

const hydrateNavProfile = async (uid) => {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return;

        const data = snap.data();

        const navName = document.getElementById('nav-name');
        const navRole = document.getElementById('nav-role');
        const navAvatar = document.getElementById('nav-avatar');

        if (navName) {
            navName.textContent = `${data.prenom || ''} ${data.nom || ''}`.trim();
        }

        if (navRole) {
            if (data.isGod) navRole.textContent = 'Admin Suprême';
            else if (data.role === 'admin') navRole.textContent = 'Administrateur';
            else if (data.role === 'teacher') navRole.textContent = 'Professeur';
            else navRole.textContent = 'Élève';
        }

        if (navAvatar) {
            if (data.photoURL) {
                navAvatar.innerHTML = `<img src="${data.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                navAvatar.textContent = data.prenom ? data.prenom.charAt(0).toUpperCase() : 'U';
            }
        }
    } catch (error) {
        console.error("Erreur chargement profil panel", error);
    }
};

onAuthStateChanged(auth, async (user) => {
    clearTrackerIntervals();

    if (activeUid && (!user || user.uid !== activeUid)) {
        await markOffline();
    }

    if (user) {
        activeUid = user.uid;
        sessionStart = Date.now();

        await markOnline();
        startTrackerIntervals();
        hydrateNavProfile(activeUid);
    } else {
        activeUid = null;
    }
});

// L'utilisateur change d'onglet : on suit l'état de la fenêtre active.
document.addEventListener("visibilitychange", () => {
    if (!activeUid) return;

    if (document.visibilityState === 'hidden') {
        markOffline().catch(() => {});
    } else if (document.visibilityState === 'visible') {
        sessionStart = Date.now();
        markOnline().catch(() => {});
    }
});

// Best-effort : pas fiable à 100%, mais lastSeenAt + expiration corrige les cas ratés.
window.addEventListener('pagehide', () => {
    if (!activeUid) return;
    markOffline().catch(() => {});
});
