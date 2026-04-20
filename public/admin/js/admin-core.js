/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

import { logoutUser } from '../../public/js/auth.js';
import { db } from '../../public/js/firebase-init.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// Imports pour l'application secondaire (Création silencieuse de comptes)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* --- 1.1 INITIALISATION OUTILS DE BASE --- */

// Bouton de déconnexion
document.getElementById('logout-btn').addEventListener('click', logoutUser);

// Bouton Vidage de Cache
document.getElementById('btn-clear-cache').addEventListener('click', () => {
    if(confirm('Vider le cache local ? Cela rechargera la page.')) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload(true);
    }
});

/* --- 1.2 CONFIGURATION APP SECONDAIRE (Création d'utilisateurs sans déconnexion) --- */
const firebaseConfig = {
    apiKey: "TON_API_KEY_ICI", // <-- À REMPLACER
    authDomain: "sbi-web-4f6b4.firebaseapp.com",
    projectId: "sbi-web-4f6b4"
};
// On initialise une 2ème instance Firebase nommée "AdminCreationApp"
const secondaryApp = initializeApp(firebaseConfig, "AdminCreationApp");
const secondaryAuth = getAuth(secondaryApp);


/* --- 2. NAVIGATION INTERNE (Système d'onglets) --- */
const initNavigation = () => {
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Retirer l'état actif partout
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            // Activer le bouton cliqué et la vue correspondante
            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });
};


/* --- 3. CREATION DE COMPTES UTILISATEURS --- */
const initUserCreation = () => {
    const form = document.getElementById('create-user-form');
    const msgBox = document.getElementById('user-creation-msg');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset message
        msgBox.className = 'sys-msg'; 
        msgBox.textContent = 'Création en cours...';
        msgBox.style.display = 'block';

        const name = document.getElementById('new-user-name').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;

        try {
            // 1. Création dans Firebase Auth via l'app secondaire
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            // 2. Enregistrement du profil et du rôle dans Firestore (Base principale)
            await setDoc(doc(db, "users", newUid), {
                nom: name,
                email: email,
                role: role,
                dateCreation: new Date().toISOString(),
                formationsAcces: [] // Vide par défaut
            });

            // 3. Déconnexion immédiate de l'app secondaire pour sécurité
            await secondaryAuth.signOut();

            // Succès
            msgBox.classList.add('success');
            msgBox.textContent = `✅ Compte ${role} créé pour ${name} !`;
            form.reset(); // Vider le formulaire

        } catch (error) {
            console.error("Erreur création:", error);
            msgBox.classList.add('error');
            
            // Personnalisation des erreurs fréquentes
            if (error.code === 'auth/email-already-in-use') {
                msgBox.textContent = "❌ Cet email est déjà utilisé.";
            } else if (error.code === 'auth/weak-password') {
                msgBox.textContent = "❌ Le mot de passe doit faire au moins 6 caractères.";
            } else {
                msgBox.textContent = "❌ Erreur : " + error.message;
            }
        }
    });
};

// --- INITIALISATION GLOBALE ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUserCreation();
});
