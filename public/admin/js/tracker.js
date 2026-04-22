/**
 * =======================================================================
 * TRACKER DE SESSION - Statut en ligne, Temps & Affichage Profil Menu
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let sessionStart = Date.now();
let activeUid = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        activeUid = user.uid;
        sessionStart = Date.now();
        updateDoc(doc(db, "users", activeUid), { isOnline: true }).catch(()=>{});

        // 1. CHARGEMENT DYNAMIQUE DU PROFIL DANS LE MENU DROIT
        try {
            const snap = await getDoc(doc(db, "users", activeUid));
            if(snap.exists()) {
                const data = snap.data();
                
                const navName = document.getElementById('nav-name');
                const navRole = document.getElementById('nav-role');
                const navAvatar = document.getElementById('nav-avatar');
                
                // Injection du Nom
                if(navName) navName.textContent = (data.prenom || '') + ' ' + (data.nom || '');
                
                // Injection du Rôle
                if(navRole) {
                    if(data.isGod) navRole.textContent = 'Admin Suprême';
                    else if(data.role === 'admin') navRole.textContent = 'Administrateur';
                    else if(data.role === 'teacher') navRole.textContent = 'Professeur';
                    else navRole.textContent = 'Élève';
                }
                
                // Injection de la Photo ou de la Première Lettre
                if(navAvatar) {
                    if(data.photoURL) {
                        navAvatar.innerHTML = `<img src="${data.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
                    } else {
                        navAvatar.textContent = data.prenom ? data.prenom.charAt(0).toUpperCase() : 'U';
                    }
                }
            }
        } catch(e) { console.error("Erreur chargement profil panel", e); }

        // 2. CHRONOMÈTRE DE CONNEXION (Toutes les minutes)
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

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden' && activeUid) {
        const diffSeconds = Math.floor((Date.now() - sessionStart) / 1000);
        updateDoc(doc(db, "users", activeUid), {
            isOnline: false,
            totalConnectionTime: increment(diffSeconds)
        }).catch(()=>{});
    } else if (document.visibilityState === 'visible' && activeUid) {
        sessionStart = Date.now();
        updateDoc(doc(db, "users", activeUid), { isOnline: true }).catch(()=>{});
    }
});
