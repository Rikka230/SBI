/**
 * =======================================================================
 * CHANGE EMAIL - SBI 8.0P.138
 * -----------------------------------------------------------------------
 * Flux unifié professeur / étudiant : réauth client obligatoire,
 * puis changement email serveur via Firebase Functions + Brevo SBI.
 * =======================================================================
 */

import { auth, app } from '/js/firebase-init.js';
import {
    onAuthStateChanged,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app, "europe-west1");
const selfChangeUserEmail = httpsCallable(functionsInstance, 'selfChangeUserEmail');

const viewForm = document.getElementById('state-form');
const viewSuccess = document.getElementById('state-success');
const form = document.getElementById('change-email-form');
const inputNewEmail = document.getElementById('new-email');
const groupPassword = document.getElementById('password-group');
const inputPassword = document.getElementById('current-password');
const btnSubmit = document.getElementById('btn-submit');
const btnText = btnSubmit?.querySelector('.btn-text');
const btnSpinner = btnSubmit?.querySelector('.btn-spinner');
const errorText = document.getElementById('form-error');
const btnRelogin = document.getElementById('btn-relogin');

let currentUser = null;
let pendingEmailChange = false;
let emailChangeCompleted = false;

const getCallableErrorMessage = (error, fallback = 'Une erreur est survenue.') => {
    const rawMessage = error?.message || error?.details?.message || fallback;
    return String(rawMessage).replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || fallback;
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            if (pendingEmailChange || emailChangeCompleted) return;
            window.location.replace('/login.html');
            return;
        }

        if (emailChangeCompleted) return;

        currentUser = user;
        const currentEmailDisplay = document.getElementById('current-email-display');
        if (currentEmailDisplay) currentEmailDisplay.textContent = user.email || '';

        if (groupPassword) {
            groupPassword.style.display = 'block';
            inputPassword?.setAttribute('required', 'true');
        }

        showView(viewForm);
    });
});

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormError();

    if (!currentUser) {
        showFormError('Session introuvable. Veuillez vous reconnecter.');
        return;
    }

    const newEmail = inputNewEmail.value.trim().toLowerCase();
    const password = inputPassword.value;

    if (!newEmail || newEmail === (currentUser.email || '').toLowerCase()) {
        showFormError("Veuillez entrer une adresse e-mail différente de l'actuelle.");
        return;
    }

    if (!password) {
        showFormError('Veuillez confirmer votre mot de passe actuel.');
        inputPassword.focus();
        return;
    }

    setButtonLoading(true);
    pendingEmailChange = true;

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        await currentUser.getIdToken(true);

        const result = await selfChangeUserEmail({ email: newEmail });
        const warning = result?.data?.warning || '';

        pendingEmailChange = false;
        emailChangeCompleted = true;
        currentUser = null;
        showView(viewSuccess);

        if (warning) {
            console.warn(warning);
        }
    } catch (error) {
        pendingEmailChange = false;
        console.error('Erreur de modification email SBI :', error);
        setButtonLoading(false);

        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showFormError('Le mot de passe actuel est incorrect.');
        } else if (error.code === 'auth/too-many-requests') {
            showFormError('Trop de tentatives. Réessayez plus tard.');
        } else if (String(error?.message || '').includes('already-exists')) {
            showFormError('Cette adresse e-mail est déjà utilisée par un autre compte.');
        } else if (String(error?.message || '').includes('invalid-argument')) {
            showFormError("Format d'adresse e-mail invalide.");
        } else if (String(error?.message || '').includes('failed-precondition')) {
            showFormError('Veuillez confirmer à nouveau votre mot de passe actuel.');
        } else {
            showFormError(getCallableErrorMessage(error, 'Une erreur est survenue. Veuillez réessayer.'));
        }
    }
});


btnRelogin?.addEventListener('click', async () => {
    if (btnRelogin) {
        btnRelogin.disabled = true;
        btnRelogin.textContent = 'Déconnexion...';
    }

    try {
        await signOut(auth);
    } catch (error) {
        console.warn('Déconnexion après changement email :', error);
    } finally {
        window.location.replace('/login.html');
    }
});

function showView(viewElement) {
    document.querySelectorAll('.state-view').forEach(element => element.classList.remove('active'));
    if (viewElement) viewElement.classList.add('active');
}

function showFormError(message) {
    if (errorText) {
        errorText.textContent = message;
        errorText.style.display = 'block';
    }
    if (inputNewEmail) inputNewEmail.style.borderColor = 'var(--accent-red)';
    if (inputPassword) inputPassword.style.borderColor = 'var(--accent-red)';
}

function hideFormError() {
    if (errorText) errorText.style.display = 'none';
    if (inputNewEmail) inputNewEmail.style.borderColor = 'var(--border-color)';
    if (inputPassword) inputPassword.style.borderColor = 'var(--border-color)';
}

function setButtonLoading(isLoading) {
    if (!btnSubmit) return;
    btnSubmit.disabled = isLoading;
    if (btnText) btnText.style.display = isLoading ? 'none' : 'block';
    if (btnSpinner) btnSpinner.style.display = isLoading ? 'block' : 'none';
}
