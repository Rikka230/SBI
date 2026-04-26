/**
 * =======================================================================
 * STUDENT HUB - Logique du tableau de bord étudiant
 * =======================================================================
 *
 * Étape 5.2.4 :
 * - suppression du chargement global des formations
 * - lecture ciblée des formations de l'élève connecté
 * - préparation au durcissement Firestore Rules
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadStudentData(user.uid);
        } else {
            window.location.replace('/login.html');
        }
    });
});

async function loadStudentData(uid) {
    try {
        const userSnap = await getDoc(doc(db, "users", uid));

        if (!userSnap.exists()) {
            console.warn("[SBI Student Hub] Profil utilisateur introuvable.");
            window.location.replace('/login.html');
            return;
        }

        const userData = userSnap.data();

        updateTopBar(userData);
        updateGamification(userData);
        await renderAssignedFormations(uid, userData);

    } catch (error) {
        console.error("Erreur de chargement du Hub Étudiant", error);

        const formationsList = document.getElementById('assigned-formations-list');
        if (formationsList) {
            formationsList.innerHTML = `
                <p style="color: var(--accent-red, #ff4a4a); font-style: italic;">
                    Impossible de charger vos formations pour le moment.
                </p>
            `;
        }
    }
}

function updateTopBar(userData) {
    const name = userData.prenom || userData.nom || "Étudiant";

    const topUserName = document.getElementById('top-user-name');
    if (topUserName) {
        topUserName.textContent = name;
    }

    const topUserAvatar = document.getElementById('top-user-avatar');
    if (topUserAvatar) {
        if (userData.photoURL) {
            topUserAvatar.innerHTML = `<img src="${userData.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            topUserAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

function updateGamification(userData) {
    const xp = userData.xp || 0;
    const level = Math.floor(xp / 100) + 1;
    const percent = Math.min((xp / 1000) * 100, 100);

    const topUserLevel = document.getElementById('top-user-level');
    if (topUserLevel) {
        topUserLevel.textContent = `Niveau ${level}`;
    }

    const hubLevel = document.getElementById('hub-level');
    if (hubLevel) {
        hubLevel.textContent = level;
    }

    const hubXp = document.getElementById('hub-xp');
    if (hubXp) {
        hubXp.textContent = xp;
    }

    setTimeout(() => {
        const xpFill = document.getElementById('hub-xp-fill');
        if (xpFill) {
            xpFill.style.width = percent + '%';
        }
    }, 300);
}

async function renderAssignedFormations(uid, userData) {
    const formationsList = document.getElementById('assigned-formations-list');
    if (!formationsList) return;

    formationsList.innerHTML = 'Chargement...';

    const assignedFormations = await fetchAssignedFormations(uid, userData);

    if (assignedFormations.length === 0) {
        formationsList.innerHTML = `
            <p style="color:var(--text-muted); font-style:italic;">
                Aucun module ne vous a été assigné par l'équipe pédagogique.
            </p>
        `;
        return;
    }

    formationsList.innerHTML = assignedFormations.map((formation) => {
        const title = escapeHTML(formation.titre || 'Formation');

        return `
            <div style="padding: 1rem; background: #0a0a0c; border: 1px solid #222; border-radius: 6px; color: white; display: flex; align-items: center; gap: 0.8rem; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent-blue)'" onmouseout="this.style.borderColor='#222'">
                <div style="width: 8px; height: 8px; background: var(--accent-blue); border-radius: 50%; flex-shrink: 0;"></div>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</span>
            </div>
        `;
    }).join('');
}

async function fetchAssignedFormations(uid, userData) {
    const isAdminPreview = userData.role === 'admin' || userData.isGod === true;

    if (isAdminPreview) {
        const allSnap = await getDocs(collection(db, "formations"));
        const formations = [];

        allSnap.forEach((formationDoc) => {
            formations.push({
                id: formationDoc.id,
                ...formationDoc.data()
            });
        });

        return formations.sort(sortByTitle);
    }

    const assignedQuery = query(
        collection(db, "formations"),
        where("students", "array-contains", uid)
    );

    const assignedSnap = await getDocs(assignedQuery);
    const formations = [];

    assignedSnap.forEach((formationDoc) => {
        formations.push({
            id: formationDoc.id,
            ...formationDoc.data()
        });
    });

    return formations.sort(sortByTitle);
}

function sortByTitle(a, b) {
    return String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', {
        sensitivity: 'base'
    });
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
