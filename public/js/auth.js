/**
 * =======================================================================
 * 1. SECURITE ET ROLES (Authentification Vanilla JS)
 * =======================================================================
 */

import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/* --- 1.1 GESTION DU FORMULAIRE DE CONNEXION --- */
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMessage.style.display = 'none';
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log("✅ Connexion réussie");
        } catch (error) {
            console.error("❌ Erreur de connexion :", error.code);
            errorMessage.textContent = "Email ou mot de passe incorrect.";
            errorMessage.style.display = 'block';
        }
    });
}

/* --- 1.2 VERIFICATION DES ROLES FIRESTORE --- */
const fetchUserRole = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            return userSnap.data().role;
        } else {
            console.warn("⚠️ Aucun rôle trouvé, attribution étudiant par défaut.");
            return "student"; 
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du rôle :", error);
        return "student";
    }
};

/* --- 1.3 ROUTE GUARD & REDIRECTIONS (SECURITE ANTI-BOUCLE) --- */
const enforceSecurityPolicies = (user, role) => {
    const currentPath = window.location.pathname;

    // Règle A : Éjecte les non-connectés des zones privées
    if (!user) {
        if (currentPath.includes('/admin') || currentPath.includes('/student') || currentPath.includes('/teacher')) {
            if (!currentPath.includes('login')) {
                window.location.replace('/login.html');
            }
        }
        return; 
    }

    // Règle B : Protection stricte du Dashboard Admin
    if (currentPath.includes('/admin') && role !== 'admin') {
        window.location.replace('/login.html');
        return;
    }

    // Règle C : Redirection POST-LOGIN vers le bon espace
    const isPublicIndex = currentPath === '/' || currentPath === '/index.html' || currentPath === '/index';
    const isLogin = currentPath.includes('login');

    if (user && (isPublicIndex || isLogin)) {
        // La condition !currentPath... empêche la boucle si on y est déjà
        if (role === 'admin' && !currentPath.includes('/admin')) {
            window.location.replace('/admin/index.html'); 
        } else if (role === 'student' && !currentPath.includes('/student')) {
            window.location.replace('/student/dashboard.html');
        } else if (role === 'teacher' && !currentPath.includes('/teacher')) {
            window.location.replace('/teacher/index.html');
        }
    }
};

/* --- 1.4 OBSERVATEUR D'ETAT GLOBAL --- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const role = await fetchUserRole(user.uid);
        enforceSecurityPolicies(user, role);
    } else {
        enforceSecurityPolicies(null, null);
    }
});

/* --- 1.5 FONCTION DE DECONNEXION GLOBALE --- */
export const logoutUser = () => {
    signOut(auth).then(() => {
        window.location.replace('/index.html');
    }).catch((error) => {
        console.error("Erreur lors de la déconnexion :", error);
    });
};
