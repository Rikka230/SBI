/**
 * =======================================================================
 * CHANGE EMAIL - Logique de mise à jour sécurisée avec Re-Auth
 * =======================================================================
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Vues
const viewLoading = document.getElementById('state-loading');
const viewForm = document.getElementById('state-form');
const viewSuccess = document.getElementById('state-success');

// Formulaire
const form = document.getElementById('change-email-form');
const inputNewEmail = document.getElementById('new-email');
const groupPassword = document.getElementById('password-group');
const inputPassword = document.getElementById('current-password');
const btnSubmit = document.getElementById('btn-submit');
const btnText = btnSubmit.querySelector('.btn-text');
const btnSpinner = btnSubmit.querySelector('.btn-spinner');
const errorText = document.getElementById('form-error');

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    // Vérification de la connexion de l'utilisateur
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('current-email-display').textContent = user.email;
            showView(viewForm);
        } else {
            // Sécurité : redirection si l'utilisateur n'est pas connecté
            window.location.replace('/login.html');
        }
    });
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormError();

    const newEmail = inputNewEmail.value.trim();
    const password = inputPassword.value;

    if (!newEmail || newEmail === currentUser.email) {
        showFormError("Veuillez entrer une adresse e-mail différente de l'actuelle.");
        return;
    }

    setButtonLoading(true);

    try {
        // ÉTAPE 1 : Si le champ mot de passe est visible, on re-valide d'abord la session
        if (groupPassword.style.display !== 'none') {
            if (!password) {
                showFormError("Veuillez entrer votre mot de passe actuel.");
                setButtonLoading(false);
                return;
            }
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
        }

        // ÉTAPE 2 : Mise à jour de l'e-mail dans Firebase Auth
        await updateEmail(currentUser, newEmail);

        // ÉTAPE 3 : Synchronisation dans la base de données Firestore (Essentiel pour l'affichage Profil)
        await updateDoc(doc(db, "users", currentUser.uid), {
            email: newEmail
        });

        // Succès
        showView(viewSuccess);

    } catch (error) {
        console.error("Erreur de modification d'email :", error.code);
        setButtonLoading(false);

        // Interception du blocage de sécurité de Firebase (Session trop ancienne)
        if (error.code === 'auth/requires-recent-login') {
            // On fait apparaître le champ de mot de passe pour forcer la ré-authentification
            groupPassword.style.display = 'block';
            inputPassword.setAttribute('required', 'true');
            inputPassword.focus();
            showFormError("Pour votre sécurité, veuillez confirmer avec votre mot de passe actuel.");
        } 
        else if (error.code === 'auth/wrong-password') {
            showFormError("Le mot de passe actuel est incorrect.");
        }
        else if (error.code === 'auth/email-already-in-use') {
            showFormError("Cette adresse e-mail est déjà utilisée par un autre compte.");
        }
        else if (error.code === 'auth/invalid-email') {
            showFormError("Format d'adresse e-mail invalide.");
        }
        else {
            showFormError("Une erreur est survenue. Veuillez réessayer.");
        }
    }
});

// Fonctions utilitaires
function showView(viewElement) {
    document.querySelectorAll('.state-view').forEach(el => el.classList.remove('active'));
    viewElement.classList.add('active');
}

function showFormError(message) {
    errorText.textContent = message;
    errorText.style.display = 'block';
    inputNewEmail.style.borderColor = 'var(--accent-red)';
    if (groupPassword.style.display !== 'none') {
        inputPassword.style.borderColor = 'var(--accent-red)';
    }
}

function hideFormError() {
    errorText.style.display = 'none';
    inputNewEmail.style.borderColor = 'var(--border-color)';
    inputPassword.style.borderColor = 'var(--border-color)';
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
