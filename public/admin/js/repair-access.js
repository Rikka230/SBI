/**
 * =======================================================================
 * REPAIR ACCESS - Actualisation des accès formations / rôles pédagogiques
 * =======================================================================
 *
 * Cette page admin force la reconstruction des index d'accès :
 * - users/{uid}.formationIds
 * - users/{uid}.formationsAcces
 *
 * Source de vérité :
 * - formations/{formationId}.profs
 * - formations/{formationId}.students
 * - formations/{formationId}.titre
 * =======================================================================
 */

import '/js/auth.js';

import { auth, db } from '/js/firebase-init.js';
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { syncAllUserFormationIndexes } from '/admin/js/user-formation-index.js';

const setStatus = (message, type = 'idle') => {
    const status = document.getElementById('repair-access-status');
    if (!status) return;

    status.textContent = message;

    if (type === 'success') {
        status.style.color = 'var(--accent-green, #2ed573)';
    } else if (type === 'error') {
        status.style.color = 'var(--accent-red, #ff4a4a)';
    } else if (type === 'warning') {
        status.style.color = 'var(--accent-yellow, #fbbc04)';
    } else {
        status.style.color = 'var(--text-muted, #9ca3af)';
    }
};

const setButtonLoading = (isLoading) => {
    const button = document.getElementById('btn-repair-formation-access');
    if (!button) return;

    button.disabled = isLoading;
    button.style.opacity = isLoading ? '0.65' : '1';
    button.style.cursor = isLoading ? 'wait' : 'pointer';
    button.textContent = isLoading
        ? 'Actualisation en cours...'
        : 'Actualiser les accès maintenant';
};

const userIsAdminLike = async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;

    const data = snap.data();
    return data?.isGod === true || data?.role === 'admin';
};

const runAccessRepair = async () => {
    setButtonLoading(true);
    setStatus('Analyse des formations et utilisateurs...', 'idle');

    try {
        const result = await syncAllUserFormationIndexes();
        const updated = Number(result?.updated || 0);
        const skipped = Number(result?.skipped || 0);

        if (updated === 0) {
            setStatus(`Accès déjà à jour. ${skipped} utilisateur(s) vérifié(s).`, 'success');
            return;
        }

        setStatus(`Accès actualisés : ${updated} utilisateur(s) mis à jour, ${skipped} déjà correct(s).`, 'success');
    } catch (error) {
        console.error('[SBI Repair Access] Échec actualisation accès :', error);
        setStatus('Erreur pendant l’actualisation. Vérifie les droits admin et les règles Firestore.', 'error');
    } finally {
        setButtonLoading(false);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btn-repair-formation-access');

    if (button) {
        button.addEventListener('click', runAccessRepair);
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        try {
            const allowed = await userIsAdminLike(user.uid);

            if (!allowed) {
                setStatus('Accès refusé : action réservée aux administrateurs.', 'error');
                if (button) button.disabled = true;
                return;
            }

            setStatus('Prêt. Lance l’actualisation si les cours prof/élève ne remontent pas.', 'warning');
        } catch (error) {
            console.error('[SBI Repair Access] Vérification admin impossible :', error);
            setStatus('Impossible de vérifier les droits administrateur.', 'error');
            if (button) button.disabled = true;
        }
    });
});
