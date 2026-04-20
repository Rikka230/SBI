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

/* --- 1.2 VERIFICATION PROFIL FIRESTORE (Rôle + Statut) --- */
const fetchUserData = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            return { role: userSnap.data().role, statut: userSnap.data().statut };
        } else {
            console.warn("⚠️ Aucun profil trouvé, attribution étudiant par défaut.");
            return { role: "student", statut: "actif" }; 
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du profil :", error);
        return { role: "student", statut: "actif" };
    }
};

/* --- 1.3 ROUTE GUARD & REDIRECTIONS --- */
const enforceSecurityPolicies = async (user, userData) => {
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

    // Règle B : BLOCAGE DES COMPTES SUSPENDUS
    if (userData.statut === 'suspendu') {
        alert("Votre compte a été suspendu par un administrateur.");
        await signOut(auth); // On le déconnecte de force
        window.location.replace('/login.html');
        return;
    }

    // Règle C : Protection stricte du Dashboard Admin
    if (currentPath.includes('/admin') && userData.role !== 'admin') {
        window.location.replace('/login.html');
        return;
    }

    // Règle D : Redirection POST-LOGIN vers le bon espace
    const isPublicIndex = currentPath === '/' || currentPath === '/index.html' || currentPath === '/index';
    const isLogin = currentPath.includes('login');

    if (user && (isPublicIndex || isLogin)) {
        if (userData.role === 'admin' && !currentPath.includes('/admin')) {
            window.location.replace('/admin/index.html'); 
        } else if (userData.role === 'student' && !currentPath.includes('/student')) {
            window.location.replace('/student/dashboard.html');
        } else if (userData.role === 'teacher' && !currentPath.includes('/teacher')) {
            window.location.replace('/teacher/index.html');
        }
    }
};

/* --- 1.4 OBSERVATEUR D'ETAT GLOBAL --- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userData = await fetchUserData(user.uid);
        enforceSecurityPolicies(user, userData);
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
