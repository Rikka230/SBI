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

// Optimisation : Sauvegarde toutes les 5 minutes au lieu d'1 minute.
// Cela divise par 5 ta consommation de base de données Firebase.
const SYNC_INTERVAL_MS = 300000; 

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

        // 2. CHRONOMÈTRE DE CONNEXION (Synchronisation périodique)
        setInterval(() => {
            if(!activeUid) return;
            const now = Date.now();
            const diffSeconds = Math.floor((now - sessionStart) / 1000);
            
            if (diffSeconds > 0) {
                // On met à jour le marqueur de temps AVANT l'envoi
                sessionStart = now; 
                updateDoc(doc(db, "users", activeUid), {
                    totalConnectionTime: increment(diffSeconds)
                }).catch(()=>{});
            }
        }, SYNC_INTERVAL_MS); 

    } else {
        if (activeUid) {
            updateDoc(doc(db, "users", activeUid), { isOnline: false }).catch(()=>{});
            activeUid = null;
        }
    }
});

// 3. SAUVEGARDE À LA FERMETURE OU AU CHANGEMENT D'ONGLET
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden' && activeUid) {
        const now = Date.now();
        const diffSeconds = Math.floor((now - sessionStart) / 1000);
        
        if (diffSeconds > 0) {
            // FIX : Indispensable de remettre le chrono à zéro ici pour éviter de compter l'intervalle en double
            sessionStart = now; 
            updateDoc(doc(db, "users", activeUid), {
                isOnline: false,
                totalConnectionTime: increment(diffSeconds)
            }).catch(()=>{});
        } else {
            // Si le temps est inférieur à 1s, on passe juste hors-ligne
            updateDoc(doc(db, "users", activeUid), { isOnline: false }).catch(()=>{});
        }
    } else if (document.visibilityState === 'visible' && activeUid) {
        // L'utilisateur revient sur l'onglet, on relance le chrono
        sessionStart = Date.now();
        updateDoc(doc(db, "users", activeUid), { isOnline: true }).catch(()=>{});
    }
});
