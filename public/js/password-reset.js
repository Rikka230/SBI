/**
 * =======================================================================
 * PASSWORD RESET / FINALISATION COMPTE - Flux SBI + Firebase Auth
 * -----------------------------------------------------------------------
 * 8.0P.167.118 :
 * - conserve le reset Firebase classique pour les comptes actifs ;
 * - ajoute la finalisation durable SBI par token pour les comptes qui
 *   n'ont pas encore créé leur mot de passe initial.
 * =======================================================================
 */

import { app, auth } from '/js/firebase-init.js';
import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app, 'europe-west1');
const verifyInitialPasswordToken = httpsCallable(functionsInstance, 'verifyInitialPasswordToken');
const completeInitialPasswordWithToken = httpsCallable(functionsInstance, 'completeInitialPasswordWithToken');

// Éléments de l'interface (Vues)
const viewLoading = document.getElementById('state-loading');
const viewError = document.getElementById('state-error');
const viewForm = document.getElementById('state-form');
const viewSuccess = document.getElementById('state-success');

// Éléments du formulaire
const resetForm = document.getElementById('reset-password-form');
const inputNewPassword = document.getElementById('new-password');
const inputConfirmPassword = document.getElementById('confirm-password');
const btnSubmit = document.getElementById('btn-submit');
const btnText = btnSubmit.querySelector('.btn-text');
const btnSpinner = btnSubmit.querySelector('.btn-spinner');
const errorText = document.getElementById('form-error');
const formTitle = document.getElementById('password-form-title');
const formSubtitle = document.getElementById('password-form-subtitle');
const successTitle = document.getElementById('success-title');
const successMessage = document.getElementById('success-message');

// Variables globales
let actionCode = null;
let finalizationToken = null;
let currentFlow = 'firebase-reset';

document.addEventListener('DOMContentLoaded', () => {
    handleInitialLoad();
});

function collectUrlParams(url = window.location.href) {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);

    if (parsed.hash) {
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        hashParams.forEach((value, key) => {
            if (!params.has(key)) params.set(key, value);
        });
    }

    return params;
}

function resolveParamFromCurrentUrl(paramNames = []) {
    const urlsToInspect = [window.location.href];
    const inspectedUrls = new Set();

    while (urlsToInspect.length > 0) {
        const currentUrl = urlsToInspect.shift();
        if (!currentUrl || inspectedUrls.has(currentUrl)) continue;
        inspectedUrls.add(currentUrl);

        const params = collectUrlParams(currentUrl);
        for (const paramName of paramNames) {
            const value = params.get(paramName);
            if (value) return value;
        }

        ['link', 'continueUrl', 'continueURL', 'deep_link_id'].forEach((key) => {
            const nestedUrl = params.get(key);
            if (!nestedUrl) return;

            urlsToInspect.push(nestedUrl);

            try {
                const decodedUrl = decodeURIComponent(nestedUrl);
                if (decodedUrl && decodedUrl !== nestedUrl) urlsToInspect.push(decodedUrl);
            } catch (_) {
                // Lien déjà décodé ou valeur non décodable : on garde la valeur brute.
            }
        });
    }

    return '';
}

function resolveActionCodeFromCurrentUrl() {
    return resolveParamFromCurrentUrl(['oobCode']);
}

function resolveFinalizationTokenFromCurrentUrl() {
    return resolveParamFromCurrentUrl(['token', 'finalizationToken', 't']);
}

function resolveModeFromCurrentUrl() {
    return resolveParamFromCurrentUrl(['mode']);
}

// 1. INITIALISATION ET VÉRIFICATION DU CODE / TOKEN
async function handleInitialLoad() {
    finalizationToken = resolveFinalizationTokenFromCurrentUrl();
    const mode = resolveModeFromCurrentUrl();

    if (finalizationToken || mode === 'finalizeAccount') {
        await handleDurableFinalizationLoad();
        return;
    }

    await handleFirebaseResetLoad();
}

async function handleDurableFinalizationLoad() {
    currentFlow = 'durable-finalization';

    if (!finalizationToken) {
        showView(viewError);
        document.getElementById('error-message').textContent = "Le token de finalisation est manquant. Utilisez le lien exact reçu par email.";
        return;
    }

    try {
        const response = await verifyInitialPasswordToken({ token: finalizationToken });
        const data = response?.data || {};

        document.getElementById('user-email-display').textContent = data.email || 'votre compte SBI';
        if (formTitle) formTitle.textContent = 'Définir mon mot de passe';
        if (formSubtitle) {
            formSubtitle.innerHTML = `Activez votre accès SBI pour le compte <br><strong id="user-email-display" style="color: var(--text-main);">${escapeHtml(data.email || 'votre compte SBI')}</strong>`;
        }
        if (btnText) btnText.textContent = 'Activer mon compte';

        showView(viewForm);
    } catch (error) {
        console.error("Erreur de vérification du token SBI:", error.code, error.message);
        showView(viewError);

        let errorMsg = "Ce lien de finalisation n’est plus valide, a déjà été utilisé ou ne correspond plus au compte. Demandez à l’équipe SBI de renvoyer une invitation.";
        if (error.code === 'functions/failed-precondition') {
            errorMsg = error.message || errorMsg;
        } else if (error.code === 'functions/permission-denied') {
            errorMsg = error.message || "Ce compte est suspendu. Contactez l’équipe SBI.";
        }
        document.getElementById('error-message').textContent = errorMsg;
    }
}

async function handleFirebaseResetLoad() {
    currentFlow = 'firebase-reset';

    // Extraction robuste du oobCode depuis l'URL générée par Firebase ou reconstruite par SBI.
    actionCode = resolveActionCodeFromCurrentUrl();

    // Si aucun code n'est présent (accès direct à la page sans lien)
    if (!actionCode) {
        showView(viewError);
        document.getElementById('error-message').textContent = "Le code de sécurité est manquant. Assurez-vous d'avoir cliqué sur le lien exact reçu par e-mail.";
        return;
    }

    try {
        // Vérification de la validité du code auprès des serveurs Firebase
        const email = await verifyPasswordResetCode(auth, actionCode);

        // Code valide : On affiche le formulaire et l'email cible
        document.getElementById('user-email-display').textContent = email;
        if (formTitle) formTitle.textContent = 'Nouveau mot de passe';
        if (btnText) btnText.textContent = 'Réinitialiser mon mot de passe';
        showView(viewForm);

    } catch (error) {
        // Code invalide ou expiré
        console.error("Erreur de vérification du code:", error.code);
        showView(viewError);

        let errorMsg = "Ce lien a expiré, a déjà été utilisé ou provient d’un ancien email. Veuillez demander un nouveau lien depuis l’espace de connexion.";
        if (error.code === 'auth/invalid-action-code') {
            errorMsg = "Ce lien de réinitialisation est invalide, déjà utilisé ou généré avant la configuration du domaine final.";
        } else if (error.code === 'auth/expired-action-code') {
            errorMsg = "Ce lien a expiré. Si votre compte n’est pas encore finalisé, demandez à l’équipe SBI de renvoyer l’invitation de finalisation.";
        }
        document.getElementById('error-message').textContent = errorMsg;
    }
}

// 2. SOUMISSION DU NOUVEAU MOT DE PASSE
resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormError();

    const pwd1 = inputNewPassword.value;
    const pwd2 = inputConfirmPassword.value;

    // Vérification de sécurité côté client
    if (pwd1.length < 8) {
        showFormError("Le mot de passe doit contenir au moins 8 caractères.");
        return;
    }
    if (pwd1 !== pwd2) {
        showFormError("Les mots de passe ne correspondent pas.");
        return;
    }

    // Passage en mode chargement
    setButtonLoading(true);

    try {
        if (currentFlow === 'durable-finalization') {
            await completeInitialPasswordWithToken({
                token: finalizationToken,
                password: pwd1
            });

            if (successTitle) successTitle.textContent = 'Compte activé !';
            if (successMessage) successMessage.textContent = 'Votre mot de passe est créé. Vous pouvez maintenant vous connecter à votre espace SBI.';
            showView(viewSuccess);
            return;
        }

        // Application du nouveau mot de passe via Firebase
        await confirmPasswordReset(auth, actionCode, pwd1);
        if (successTitle) successTitle.textContent = 'Mot de passe modifié !';
        if (successMessage) successMessage.textContent = 'Votre compte est désormais sécurisé avec votre nouveau mot de passe.';
        showView(viewSuccess);
    } catch (error) {
        console.error("Erreur lors de la validation du mot de passe:", error.code, error.message);
        setButtonLoading(false);

        if (error.code === 'auth/weak-password' || error.code === 'functions/invalid-argument') {
            showFormError(error.message || "Ce mot de passe est trop faible.");
        } else if (
            error.code === 'auth/expired-action-code'
            || error.code === 'auth/invalid-action-code'
            || error.code === 'functions/failed-precondition'
            || error.code === 'functions/not-found'
            || error.code === 'functions/permission-denied'
        ) {
            showView(viewError);
            document.getElementById('error-message').textContent = error.message || "Ce lien n’est plus valide. Demandez un nouveau lien à l’équipe SBI.";
        } else {
            showFormError("Une erreur réseau est survenue. Veuillez réessayer.");
        }
    }
});

// Utilitaires UI
function showView(viewElement) {
    document.querySelectorAll('.state-view').forEach(el => el.classList.remove('active'));
    viewElement.classList.add('active');
}

function showFormError(message) {
    errorText.textContent = message;
    errorText.style.display = 'block';
    inputConfirmPassword.style.borderColor = 'var(--accent-red)';
    inputNewPassword.style.borderColor = 'var(--accent-red)';
}

function hideFormError() {
    errorText.style.display = 'none';
    inputConfirmPassword.style.borderColor = 'var(--border-color)';
    inputNewPassword.style.borderColor = 'var(--border-color)';
}

function setButtonLoading(isLoading) {
    btnSubmit.disabled = isLoading;
    if (isLoading) {
        btnText.style.display = 'none';
        btnSpinner.style.display = 'block';
    } else {
        btnText.style.display = 'block';
        btnSpinner.style.display = 'none';
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
