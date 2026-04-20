/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

/* --- 1.1 INITIALISATION OUTILS DE BASE (Chemins absolus) --- */
import { logoutUser } from '/js/auth.js';
import { db } from '/js/firebase-init.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Action : Bouton de déconnexion
document.getElementById('logout-btn').addEventListener('click', logoutUser);

// Action : Bouton Vidage de Cache
document.getElementById('btn-clear-cache').addEventListener('click', () => {
    if(confirm('Vider le cache local ? Cela rechargera la page.')) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload(true);
    }
});

/* --- 1.2 CONFIGURATION APP SECONDAIRE --- */
const firebaseConfig = {
    apiKey: "AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY",
    authDomain: "sbi-web-4f6b4.firebaseapp.com",
    projectId: "sbi-web-4f6b4"
};
const secondaryApp = initializeApp(firebaseConfig, "AdminCreationApp");
const secondaryAuth = getAuth(secondaryApp);

/* --- 2. NAVIGATION INTERNE (Système d'onglets) --- */
const initNavigation = () => {
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

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
        
        msgBox.className = 'sys-msg'; 
        msgBox.textContent = 'Création en cours...';
        msgBox.style.display = 'block';

        const name = document.getElementById('new-user-name').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            await setDoc(doc(db, "users", newUid), {
                nom: name,
                email: email,
                role: role,
                dateCreation: new Date().toISOString(),
                formationsAcces: [] 
            });

            await secondaryAuth.signOut();

            msgBox.classList.add('success');
            msgBox.textContent = `✅ Compte ${role} créé pour ${name} !`;
            form.reset(); 

        } catch (error) {
            console.error("Erreur création:", error);
            msgBox.classList.add('error');
            
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
