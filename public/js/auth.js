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
        
        // On masque les erreurs précédentes
        errorMessage.style.display = 'none';
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        try {
            // Tentative de connexion via Firebase
            await signInWithEmailAndPassword(auth, email, password);
            console.log("✅ Connexion réussie");
            // La redirection est gérée automatiquement par onAuthStateChanged plus bas
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
            return userSnap.data().role; // Ex: "admin", "teacher", "student"
        } else {
            console.warn("⚠️ Aucun rôle trouvé pour cet utilisateur, attribution du rôle étudiant par défaut.");
            return "student"; 
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du rôle :", error);
        return "student";
    }
};

/* --- 1.3 ROUTE GUARD & REDIRECTIONS --- */
const enforceSecurityPolicies = (user, role) => {
    const currentPath = window.location.pathname;
    console.log("📍 Position actuelle :", currentPath, "| Rôle détecté :", role);

    if (user && currentPath.includes('login.html')) {
        if (role === 'admin') {
            console.log("🚀 Redirection vers Admin...");
            window.location.href = '../admin/index.html';
        } else if (role === 'teacher') {
            window.location.href = '../teacher/index.html';
        } else if (role === 'student') {
            console.log("🚀 Redirection vers Étudiant...");
            window.location.href = '../student/dashboard.html';
        } else {
            console.error("❌ Rôle inconnu, arrêt de la redirection pour éviter une boucle.");
        }
        return;
    }

    // Règle C : Protection des espaces privés (éjecte les non-connectés)
    if (!user && (currentPath.includes('/student') || currentPath.includes('/teacher') || currentPath.includes('/admin'))) {
        window.location.href = '../public/login.html';
    }
};

/* --- 1.4 OBSERVATEUR D'ETAT GLOBAL --- */
// Se déclenche à chaque changement d'état (connexion/déconnexion)
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
        window.location.href = '../public/index.html';
    }).catch((error) => {
        console.error("Erreur lors de la déconnexion :", error);
    });
};
