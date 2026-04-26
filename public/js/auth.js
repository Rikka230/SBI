/**
 * =======================================================================
 * 1. SECURITE ET ROLES (Authentification Vanilla JS)
 * =======================================================================
 */

import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/* --- 1.1 ELEMENTS LOGIN --- */
const loginForm = document.getElementById('login-form');
const loginCard = document.getElementById('login-card');
const loginSignal = document.querySelector('.sbi-signal-login');
const submitButton = document.getElementById('login-submit');
const submitLabel = submitButton?.querySelector('.login-submit-label');
const errorMessage = document.getElementById('error-message');

let redirectInProgress = false;
let loginSignalTimers = [];

const setSubmitLabel = (text) => {
    if (submitLabel) {
        submitLabel.textContent = text;
    }
};

const clearLoginSignalTimers = () => {
    loginSignalTimers.forEach(timer => window.clearTimeout(timer));
    loginSignalTimers = [];
};

const hideLoginSignal = () => {
    if (!loginSignal) return;

    clearLoginSignalTimers();
    loginSignal.classList.remove('is-revealed', 'is-attention');
};

const revealLoginSignal = (duration = 5400, delay = 300) => {
    if (!loginSignal) return;

    clearLoginSignalTimers();

    const openTimer = window.setTimeout(() => {
        loginSignal.classList.add('is-revealed', 'is-attention');

        const attentionTimer = window.setTimeout(() => {
            loginSignal.classList.remove('is-attention');
        }, 1100);

        const closeTimer = window.setTimeout(() => {
            if (!loginSignal.matches(':hover') && !loginSignal.matches(':focus-within')) {
                loginSignal.classList.remove('is-revealed', 'is-attention');
            }
        }, duration);

        loginSignalTimers.push(attentionTimer, closeTimer);
    }, delay);

    loginSignalTimers.push(openTimer);
};

const clearLoginStates = () => {
    if (!loginCard) return;

    loginCard.classList.remove('is-loading', 'is-success', 'is-error');
};

const clearLoginError = () => {
    if (!errorMessage) return;

    errorMessage.textContent = '';
    errorMessage.classList.remove('is-visible');
};

const showLoginError = (message) => {
    if (!errorMessage) return;

    errorMessage.textContent = message;
    errorMessage.classList.add('is-visible');
};

const setLoginLoading = () => {
    clearLoginStates();
    clearLoginError();
    hideLoginSignal();

    if (loginCard) {
        loginCard.classList.add('is-loading');
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    setSubmitLabel('Vérification');
};

const setLoginSuccess = () => {
    clearLoginStates();
    clearLoginError();
    hideLoginSignal();

    if (loginCard) {
        loginCard.classList.add('is-success');
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    setSubmitLabel('Connexion validée');
};

const setLoginError = (message) => {
    clearLoginStates();

    if (loginCard) {
        loginCard.classList.add('is-error');
    }

    if (submitButton) {
        submitButton.disabled = false;
    }

    setSubmitLabel("Accéder à l'espace");
    showLoginError(message);

    /* Réouvre la bulle du losange pour guider les utilisateurs sans compte */
    revealLoginSignal(5600, 450);

    window.setTimeout(() => {
        loginCard?.classList.remove('is-error');
    }, 900);
};

const getFirebaseErrorMessage = (error) => {
    const code = error?.code || '';

    switch (code) {
        case 'auth/invalid-email':
            return "L'adresse email n'est pas valide.";

        case 'auth/user-disabled':
            return "Ce compte a été désactivé.";

        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return "Email ou mot de passe incorrect.";

        case 'auth/too-many-requests':
            return "Trop de tentatives. Réessaie un peu plus tard.";

        case 'auth/network-request-failed':
            return "Problème réseau. Vérifie ta connexion.";

        default:
            return "Email ou mot de passe incorrect.";
    }
};

const redirectWithLoginFeedback = (targetUrl) => {
    if (redirectInProgress) return;

    redirectInProgress = true;

    const currentPath = window.location.pathname;
    const isLogin = currentPath.includes('login');

    if (isLogin && loginCard) {
        setLoginSuccess();

        window.setTimeout(() => {
            window.location.replace(targetUrl);
        }, 650);

        return;
    }

    window.location.replace(targetUrl);
};

/* --- 1.2 GESTION DU FORMULAIRE DE CONNEXION --- */
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            setLoginError('Renseigne ton email et ton mot de passe.');
            return;
        }

        setLoginLoading();

        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log("✅ Connexion réussie");

            /*
             * La redirection reste gérée par onAuthStateChanged + Firestore,
             * pour conserver la logique role/statut existante.
             */
            setLoginSuccess();

        } catch (error) {
            console.error("❌ Erreur de connexion :", error.code);
            setLoginError(getFirebaseErrorMessage(error));
        }
    });
}

/* --- 1.3 VERIFICATION PROFIL FIRESTORE (Rôle + Statut) --- */
const fetchUserData = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            return {
                role: userSnap.data().role,
                statut: userSnap.data().statut
            };
        } else {
            console.warn("⚠️ Aucun profil trouvé, attribution étudiant par défaut.");

            return {
                role: "student",
                statut: "actif"
            };
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du profil :", error);

        return {
            role: "student",
            statut: "actif"
        };
    }
};

/* --- 1.4 ROUTE GUARD & REDIRECTIONS --- */
const enforceSecurityPolicies = async (user, userData) => {
    const currentPath = window.location.pathname;

    // Règle A : Éjecte les non-connectés des zones privées
    if (!user) {
        if (currentPath.includes('/admin') || currentPath.includes('/student') || currentPath.includes('/teacher/')) {
            if (!currentPath.includes('login')) {
                window.location.replace('/login.html');
            }
        }

        return;
    }

    // Règle B : BLOCAGE DES COMPTES SUSPENDUS
    if (userData.statut === 'suspendu') {
        if (currentPath.includes('login')) {
            setLoginError("Votre compte a été suspendu par un administrateur.");
        } else {
            alert("Votre compte a été suspendu par un administrateur.");
        }

        await signOut(auth);
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
            redirectWithLoginFeedback('/admin/index.html');
            return;
        }

        if (userData.role === 'student' && !currentPath.includes('/student')) {
            redirectWithLoginFeedback('/student/dashboard.html');
            return;
        }

        if (userData.role === 'teacher' && !currentPath.includes('/teacher/dashboard.html')) {
            redirectWithLoginFeedback('/teacher/dashboard.html');
            return;
        }
    }
};

/* --- 1.5 OBSERVATEUR D'ETAT GLOBAL --- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userData = await fetchUserData(user.uid);
        enforceSecurityPolicies(user, userData);
    } else {
        enforceSecurityPolicies(null, null);
    }
});

/* --- 1.6 FONCTION DE DECONNEXION GLOBALE --- */
export const logoutUser = () => {
    signOut(auth).then(() => {
        window.location.replace('/index.html');
    }).catch((error) => {
        console.error("Erreur lors de la déconnexion :", error);
    });
};
