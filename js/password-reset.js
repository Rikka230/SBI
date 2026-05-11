/**
 * =======================================================================
 * PASSWORD RESET - Flux de sécurité Firebase Auth (v10+)
 * =======================================================================
 */

import { auth } from '/js/firebase-init.js'; // Assure-toi que le chemin vers ton init est correct
import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// Variables globales
let actionCode = null;

document.addEventListener('DOMContentLoaded', () => {
    handleInitialLoad();
});

// 1. INITIALISATION ET VÉRIFICATION DU CODE
async function handleInitialLoad() {
    // Extraction du oobCode depuis l'URL générée par Firebase
    const urlParams = new URLSearchParams(window.location.search);
    actionCode = urlParams.get('oobCode');

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
        showView(viewForm);

    } catch (error) {
        // Code invalide ou expiré
        console.error("Erreur de vérification du code:", error.code);
        showView(viewError);
        
        let errorMsg = "Ce lien a expiré ou a déjà été utilisé.";
        if (error.code === 'auth/invalid-action-code') {
            errorMsg = "Ce lien de réinitialisation est invalide ou a déjà été utilisé.";
        } else if (error.code === 'auth/expired-action-code') {
            errorMsg = "Ce lien a expiré. Veuillez refaire une demande de mot de passe.";
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
        // Application du nouveau mot de passe via Firebase
        await confirmPasswordReset(auth, actionCode, pwd1);
        showView(viewSuccess);
    } catch (error) {
        console.error("Erreur lors de la réinitialisation:", error.code);
        setButtonLoading(false);
        
        if (error.code === 'auth/weak-password') {
            showFormError("Ce mot de passe est trop faible.");
        } else if (error.code === 'auth/expired-action-code' || error.code === 'auth/invalid-action-code') {
            showView(viewError);
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
