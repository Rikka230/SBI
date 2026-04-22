/**
 * =======================================================================
 * TRACKER DE SESSION - Statut en ligne & Temps de connexion
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let sessionStart = Date.now();
let activeUid = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        activeUid = user.uid;
        sessionStart = Date.now();
        // Marquer "En Ligne" à la connexion
        updateDoc(doc(db, "users", activeUid), { isOnline: true }).catch(()=>{});

        // Sauvegarde le temps toutes les minutes (60000ms) pour ne rien perdre
        setInterval(() => {
            if(!activeUid) return;
            const now = Date.now();
            const diffSeconds = Math.floor((now - sessionStart) / 1000);
            sessionStart = now;
            if (diffSeconds > 0) {
                updateDoc(doc(db, "users", activeUid), {
                    totalConnectionTime: increment(diffSeconds)
                }).catch(()=>{});
            }
        }, 60000); 

    } else {
        if (activeUid) {
            updateDoc(doc(db, "users", activeUid), { isOnline: false }).catch(()=>{});
            activeUid = null;
        }
    }
});

// Quand on change d'onglet ou qu'on quitte la page
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden' && activeUid) {
        // Le navigateur est masqué (hors ligne + sauvegarde des dernières secondes)
        const diffSeconds = Math.floor((Date.now() - sessionStart) / 1000);
        updateDoc(doc(db, "users", activeUid), {
            isOnline: false,
            totalConnectionTime: increment(diffSeconds)
        }).catch(()=>{});
    } else if (document.visibilityState === 'visible' && activeUid) {
        // Retour sur la page (en ligne)
        sessionStart = Date.now();
        updateDoc(doc(db, "users", activeUid), { isOnline: true }).catch(()=>{});
    }
});
