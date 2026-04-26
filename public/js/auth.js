/**
 * =======================================================================
 * 1. SECURITE ET ROLES (Authentification Vanilla JS)
 * =======================================================================
 *
 * Route guard renforcé :
 * - /admin    → admin ou isGod uniquement
 * - /teacher  → teacher, admin ou isGod
 * - /student  → student, admin ou isGod
 *
 * Anti-flash :
 * - Les interfaces privées sont masquées par CSS tant que body n'a pas
 *   la classe .auth-ready.
 * - auth.js ajoute .auth-ready uniquement après validation du rôle.
 * =======================================================================
 */

import { auth, db } from './firebase-init.js';
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/* --- 1.1 ELEMENTS LOGIN --- */
const loginForm = document.getElementById('login-form');
const loginCard = document.getElementById('login-card');
const loginSignal = document.querySelector('.sbi-signal-login');
const submitButton = document.getElementById('login-submit');
const submitLabel = submitButton?.querySelector('.login-submit-label');
const errorMessage = document.getElementById('error-message');

let redirectInProgress = false;
let loginSignalTimers = [];

/* --- 1.2 CONSTANTES ROUTES --- */
const ROLE_DASHBOARDS = {
    admin: '/admin/index.html',
    teacher: '/teacher/dashboard.html',
    student: '/student/dashboard.html'
};

const PROTECTED_PATHS = {
    admin: '/admin',
    teacher: '/teacher',
    student: '/student'
};

/* --- 1.3 ANTI-FLASH UI --- */
const releasePrivateInterface = () => {
    document.body.classList.remove('auth-redirecting');
    document.body.classList.add('auth-ready');
};

const lockPrivateInterface = () => {
    document.body.classList.remove('auth-ready');
    document.body.classList.add('auth-redirecting');
};

/* --- 1.4 HELPERS UI LOGIN --- */
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

/* --- 1.5 HELPERS ROLES / ROUTES --- */
const normalizePath = () => {
    return window.location.pathname.toLowerCase();
};

const isLoginPage = (path = normalizePath()) => {
    return path.includes('login');
};

const isPublicIndex = (path = normalizePath()) => {
    return path === '/' || path === '/index.html' || path === '/index';
};

const isProtectedPath = (path = normalizePath()) => {
    return (
        path.startsWith(PROTECTED_PATHS.admin) ||
        path.startsWith(PROTECTED_PATHS.teacher) ||
        path.startsWith(PROTECTED_PATHS.student)
    );
};

const isAdminLike = (userData) => {
    return userData?.isGod === true || userData?.role === 'admin';
};

const getDashboardForUser = (userData) => {
    if (isAdminLike(userData)) {
        return ROLE_DASHBOARDS.admin;
    }

    if (userData?.role === 'teacher') {
        return ROLE_DASHBOARDS.teacher;
    }

    return ROLE_DASHBOARDS.student;
};

const canAccessCurrentPath = (userData, path = normalizePath()) => {
    if (!isProtectedPath(path)) {
        return true;
    }

    if (isAdminLike(userData)) {
        return true;
    }

    if (path.startsWith(PROTECTED_PATHS.admin)) {
        return false;
    }

    if (path.startsWith(PROTECTED_PATHS.teacher)) {
        return userData?.role === 'teacher';
    }

    if (path.startsWith(PROTECTED_PATHS.student)) {
        return userData?.role === 'student';
    }

    return false;
};

const redirectTo = (targetUrl, useLoginFeedback = false) => {
    if (redirectInProgress) return;

    const currentPath = normalizePath();

    if (currentPath === targetUrl.toLowerCase()) {
        releasePrivateInterface();
        return;
    }

    redirectInProgress = true;
    lockPrivateInterface();

    if (useLoginFeedback && isLoginPage(currentPath) && loginCard) {
        setLoginSuccess();

        window.setTimeout(() => {
            window.location.replace(targetUrl);
        }, 650);

        return;
    }

    window.location.replace(targetUrl);
};

const redirectToDashboard = (userData, useLoginFeedback = false) => {
    redirectTo(getDashboardForUser(userData), useLoginFeedback);
};

/* --- 1.6 GESTION DU FORMULAIRE DE CONNEXION --- */
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
             * afin de conserver la logique role/statut.
             */
            setLoginSuccess();

        } catch (error) {
            console.error("❌ Erreur de connexion :", error.code);
            setLoginError(getFirebaseErrorMessage(error));
        }
    });
}

/* --- 1.7 VERIFICATION PROFIL FIRESTORE (Rôle + Statut) --- */
const fetchUserData = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();

            return {
                role: data.role || "student",
                statut: data.statut || "actif",
                isGod: data.isGod === true
            };
        }

        console.warn("⚠️ Aucun profil trouvé, attribution étudiant par défaut.");

        return {
            role: "student",
            statut: "actif",
            isGod: false
        };

    } catch (error) {
        console.error("Erreur lors de la lecture du profil :", error);

        return {
            role: "student",
            statut: "actif",
            isGod: false
        };
    }
};

/* --- 1.8 ROUTE GUARD & REDIRECTIONS --- */
const enforceSecurityPolicies = async (user, userData) => {
    const currentPath = normalizePath();

    /*
     * Règle A :
     * Les non-connectés ne peuvent pas accéder aux espaces privés.
     */
    if (!user) {
        if (isProtectedPath(currentPath)) {
            redirectTo('/login.html');
            return;
        }

        releasePrivateInterface();
        return;
    }

    /*
     * Règle B :
     * Les comptes suspendus sont déconnectés immédiatement.
     */
    if (userData.statut === 'suspendu') {
        if (isLoginPage(currentPath)) {
            setLoginError("Votre compte a été suspendu par un administrateur.");
        } else {
            alert("Votre compte a été suspendu par un administrateur.");
        }

        await signOut(auth);
        redirectTo('/login.html');
        return;
    }

    /*
     * Règle C :
     * Si un utilisateur connecté est sur login ou index,
     * il repart vers son espace.
     */
    if (isPublicIndex(currentPath) || isLoginPage(currentPath)) {
        redirectToDashboard(userData, true);
        return;
    }

    /*
     * Règle D :
     * Protection stricte des espaces.
     *
     * /admin   -> admin ou isGod uniquement
     * /teacher -> teacher ou admin/isGod
     * /student -> student ou admin/isGod
     */
    if (!canAccessCurrentPath(userData, currentPath)) {
        redirectToDashboard(userData);
        return;
    }

    /*
     * Règle E :
     * Ici seulement, l'utilisateur est autorisé.
     * On peut révéler l'interface.
     */
    releasePrivateInterface();
};

/* --- 1.9 OBSERVATEUR D'ETAT GLOBAL --- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userData = await fetchUserData(user.uid);
        enforceSecurityPolicies(user, userData);
    } else {
        enforceSecurityPolicies(null, null);
    }
});

/* --- 1.10 FONCTION DE DECONNEXION GLOBALE --- */
export const logoutUser = () => {
    lockPrivateInterface();

    signOut(auth).then(() => {
        window.location.replace('/index.html');
    }).catch((error) => {
        console.error("Erreur lors de la déconnexion :", error);
    });
};
