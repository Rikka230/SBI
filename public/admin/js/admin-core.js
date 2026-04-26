/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

import { logoutUser } from '/js/auth.js';
import { db, auth, app } from '/js/firebase-init.js';
import {
    doc,
    setDoc,
    collection,
    updateDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app);

const firebaseConfig = {
    apiKey: "AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY",
    authDomain: "sbi-web-4f6b4.firebaseapp.com",
    projectId: "sbi-web-4f6b4"
};

const secondaryApp = initializeApp(firebaseConfig, "AdminCreationApp");
const secondaryAuth = getAuth(secondaryApp);

let allUsersData = [];
let currentUid = null;
let isCurrentUserGod = false;
let unsubscribeUsersRealtime = null;
let presenceRefreshIntervalId = null;

const ONLINE_TTL_MS = 90000;

const presenceToMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
};

const isUserReallyOnline = (user) => {
    if (!user || user.statut === 'suspendu') return false;
    if (user.isOnline !== true) return false;

    const lastSeenMs = presenceToMillis(user.lastSeenAt);
    if (!lastSeenMs) return false;

    return Date.now() - lastSeenMs <= ONLINE_TTL_MS;
};

const getLastSeenLabel = (user) => {
    const lastSeenMs = presenceToMillis(user?.lastSeenAt);
    if (!lastSeenMs) return 'Hors ligne';

    const diffSeconds = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
    if (diffSeconds < 10) return 'À l’instant';
    if (diffSeconds < 60) return `Vu il y a ${diffSeconds}s`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Vu il y a ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Vu il y a ${diffHours}h`;

    return 'Hors ligne';
};

const getFilteredUsers = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const roleTerm = roleFilter ? roleFilter.value : 'all';

    return allUsersData.filter(user => {
        const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        const matchesSearch = fullName.includes(searchTerm) || email.includes(searchTerm);
        const matchesRole = roleTerm === 'all' || user.role === roleTerm;
        return matchesSearch && matchesRole;
    });
};

const renderCurrentFilteredUsers = () => {
    renderUsersList(getFilteredUsers());
};

const fetchUsers = () => {
    const container = document.getElementById('users-list-container');
    if (!container) return;

    if (unsubscribeUsersRealtime) {
        renderCurrentFilteredUsers();
        return;
    }

    try {
        unsubscribeUsersRealtime = onSnapshot(collection(db, "users"), (querySnapshot) => {
            allUsersData = [];

            querySnapshot.forEach((snapDoc) => {
                allUsersData.push({ id: snapDoc.id, ...snapDoc.data() });
            });

            const godExists = allUsersData.some(u => u.isGod === true);
            const myProfile = allUsersData.find(u => u.id === currentUid);
            isCurrentUserGod = godExists ? (myProfile && myProfile.isGod === true) : true;

            renderCurrentFilteredUsers();
        }, (error) => {
            console.error("Erreur écoute users :", error);
            container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
        });

        if (!presenceRefreshIntervalId) {
            presenceRefreshIntervalId = window.setInterval(() => {
                if (allUsersData.length > 0) renderCurrentFilteredUsers();
            }, 30000);
        }
    } catch (error) {
        container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
    }
};

const renderUsersList = (usersToRender) => {
    const container = document.getElementById('users-list-container');
    if (!container) return;

    container.innerHTML = '';
    container.style.overflowX = 'hidden';
    container.style.paddingBottom = '0';

    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>';
        return;
    }

    usersToRender.forEach(user => {
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || "Sans nom");
        const statusLabel = user.statut === 'suspendu'
            ? '<span style="color: #ff4a4a; font-weight:bold;">Suspendu</span>'
            : '<span style="color: #2ed573; font-weight:bold;">Actif</span>';

        const isOnline = isUserReallyOnline(user);
        const lastSeenLabel = getLastSeenLabel(user);
        const onlineIndicator = isOnline
            ? '<span style="display:inline-block; min-width:8px; height:8px; background-color:#00ffa3; border-radius:50%; margin-right:8px; box-shadow: 0 0 6px #00ffa3;" title="En ligne"></span>'
            : `<span style="display:inline-block; min-width:8px; height:8px; background-color:#4b4b52; border-radius:50%; margin-right:8px;" title="${lastSeenLabel}"></span>`;

        let roleBgColor = '';
        let roleTextColor = '';
        let roleText = '';

        if (user.isGod) {
            roleBgColor = 'rgba(255, 215, 0, 0.15)';
            roleTextColor = '#ffd700';
            roleText = '👑 Suprême';
        } else if (user.role === 'admin') {
            roleBgColor = 'rgba(255, 74, 74, 0.15)';
            roleTextColor = '#ff4a4a';
            roleText = 'Admin';
        } else if (user.role === 'teacher') {
            roleBgColor = 'rgba(251, 188, 4, 0.15)';
            roleTextColor = '#fbbc04';
            roleText = 'Prof';
        } else if (user.role === 'student') {
            roleBgColor = 'rgba(0, 255, 163, 0.15)';
            roleTextColor = '#00ffa3';
            roleText = 'Élève';
        }

        const userCardHTML = `
            <div style="background: #0a0a0c; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.4rem; display: grid; grid-template-columns: 85px 1fr 1.5fr 70px 75px 75px; align-items: stretch; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; font-size: 0.8rem; overflow: hidden;">

                <div style="background: ${roleBgColor}; color: ${roleTextColor}; display: flex; align-items: center; justify-content: center; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem; border-right: 1px solid #222; text-align: center;">
                    ${roleText}
                </div>

                <div style="color: white; font-weight: bold; word-break: break-word; min-width: 0; padding: 0.6rem 0.8rem; display: flex; align-items: center;">
                    ${onlineIndicator} ${displayName}
                </div>

                <div style="color: #9ca3af; word-break: break-word; min-width: 0; padding: 0.6rem 0.8rem; display: flex; align-items: center;">
                    ${user.email}
                </div>

                <div style="text-align: center; padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: center;">
                    ${statusLabel}
                </div>

                <button class="btn-view-profile" data-id="${user.id}" style="background: rgba(46, 213, 115, 0.1); color: #2ed573; border: none; border-left: 1px solid #222; cursor: pointer; transition: background-color 0.2s; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 0;" onmouseover="this.style.background='rgba(46, 213, 115, 0.2)'" onmouseout="this.style.background='rgba(46, 213, 115, 0.1)'">
                    Profil
                </button>

                <button class="btn-edit-user" data-id="${user.id}" style="background: rgba(42, 87, 255, 0.1); color: #2A57FF; border: none; border-left: 1px solid #222; cursor: pointer; transition: background-color 0.2s; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 0;" onmouseover="this.style.background='rgba(42, 87, 255, 0.2)'" onmouseout="this.style.background='rgba(42, 87, 255, 0.1)'">
                    Éditer
                </button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', userCardHTML);
    });

    document.querySelectorAll('.btn-view-profile').forEach(btn => {
        btn.addEventListener('click', (e) => {
            window.location.href = `admin-profile.html?id=${e.target.getAttribute('data-id')}`;
        });
    });

    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => openEditModal(e.target.getAttribute('data-id')));
    });
};

const initFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');
    if (!searchInput || !roleFilter) return;

    searchInput.addEventListener('input', renderCurrentFilteredUsers);
    roleFilter.addEventListener('change', renderCurrentFilteredUsers);
};

const generateRandomPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";
    let pwd = "";
    for (let i = 0; i < 10; i++) pwd += charset.charAt(Math.floor(Math.random() * charset.length));
    return pwd;
};

const formatNom = (str) => str.toUpperCase();
const formatPrenom = (str) => str.toLowerCase().replace(/(^|\s|-)\S/g, l => l.toUpperCase());

const initUserCreation = () => {
    const form = document.getElementById('create-user-form');
    const pwdInput = document.getElementById('new-user-password');
    if (!form || !pwdInput) return;

    pwdInput.value = generateRandomPassword();
    document.getElementById('btn-regen-pwd').addEventListener('click', () => pwdInput.value = generateRandomPassword());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('user-creation-msg');
        msgBox.style.display = 'block';
        msgBox.textContent = 'Création...';

        const prenom = formatPrenom(document.getElementById('new-user-prenom').value.trim());
        const nom = formatNom(document.getElementById('new-user-nom').value.trim());
        const email = document.getElementById('new-user-email').value.trim();
        const role = document.getElementById('new-user-role').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pwdInput.value);

            await setDoc(doc(db, "users", userCredential.user.uid), {
                prenom: prenom,
                nom: nom,
                email: email,
                role: role,
                statut: "actif",
                isGod: false,
                isOnline: false,
                lastSeenAt: null,
                dateCreation: new Date().toISOString(),
                formationsAcces: []
            });

            await secondaryAuth.signOut();
            await sendPasswordResetEmail(auth, email);

            msgBox.style.color = "var(--accent-green)";
            msgBox.textContent = `✅ Compte créé pour ${prenom} ! Email envoyé.`;

            form.reset();
            pwdInput.value = generateRandomPassword();
            fetchUsers();
        } catch (error) {
            msgBox.style.color = "var(--accent-red)";
            msgBox.textContent = "❌ Erreur : " + error.message;
        }
    });
};

const openEditModal = (userId) => {
    const targetUser = allUsersData.find(u => u.id === userId);
    if (!targetUser) return;

    const prenomInput = document.getElementById('edit-user-prenom');
    const nomInput = document.getElementById('edit-user-nom');
    const emailInput = document.getElementById('edit-user-email');
    const roleSelect = document.getElementById('edit-user-role');
    const statutSelect = document.getElementById('edit-user-statut');

    const godContainer = document.getElementById('god-mode-container');
    const godCheckbox = document.getElementById('edit-user-isgod');
    const godLabelWrapper = godCheckbox ? godCheckbox.parentElement : null;
    const godDesc = document.getElementById('god-mode-desc');

    const deleteZone = document.getElementById('delete-zone');
    const resetPwdBtn = document.getElementById('reset-pwd-btn');
    const submitBtn = document.querySelector('#edit-user-form button[type="submit"]');

    document.getElementById('edit-user-id').value = targetUser.id;
    prenomInput.value = targetUser.prenom || '';
    nomInput.value = targetUser.nom || '';
    emailInput.value = targetUser.email || '';
    roleSelect.value = targetUser.role || 'student';
    statutSelect.value = targetUser.statut || 'actif';

    prenomInput.disabled = false;
    nomInput.disabled = false;
    roleSelect.disabled = false;
    statutSelect.disabled = false;

    if (resetPwdBtn) resetPwdBtn.style.display = 'block';
    if (submitBtn) submitBtn.style.display = 'block';
    if (deleteZone) deleteZone.style.display = 'block';

    if (godContainer) {
        godContainer.style.display = 'none';
        if (godCheckbox) godCheckbox.checked = false;
        if (godLabelWrapper) godLabelWrapper.style.display = 'flex';
        if (godDesc) godDesc.style.marginTop = '0.5rem';
    }

    const godExists = allUsersData.some(u => u.isGod === true);

    if (targetUser.isGod && !isCurrentUserGod) {
        prenomInput.disabled = true;
        nomInput.disabled = true;
        roleSelect.disabled = true;
        statutSelect.disabled = true;

        if (resetPwdBtn) resetPwdBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
        if (deleteZone) deleteZone.style.display = 'none';

        if (godContainer) {
            godContainer.style.display = 'block';
            if (godLabelWrapper) godLabelWrapper.style.display = 'none';
            if (godDesc) {
                godDesc.style.marginTop = '0';
                godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Cet utilisateur est l'Administrateur Suprême (Lecture seule).</span>";
            }
        }
    } else if (targetUser.isGod && isCurrentUserGod) {
        if (deleteZone) deleteZone.style.display = 'none';

        roleSelect.disabled = true;
        statutSelect.disabled = true;

        if (godContainer) {
            godContainer.style.display = 'block';
            if (godLabelWrapper) godLabelWrapper.style.display = 'none';
            if (godDesc) {
                godDesc.style.marginTop = '0';
                godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Vous êtes l'Administrateur Suprême de la plateforme.</span>";
            }
        }
    } else if (!targetUser.isGod && targetUser.role === 'admin') {
        if (!godExists && godContainer) {
            godContainer.style.display = 'block';
            if (godCheckbox) godCheckbox.disabled = false;

            if (targetUser.id === currentUid && godDesc) {
                godDesc.innerHTML = "Aucun Suprême n'existe. Cochez pour <strong>réclamer</strong> les pouvoirs (irréversible).";
            } else if (godDesc) {
                godDesc.innerHTML = "Aucun Suprême n'existe. Cochez pour lui <strong>donner</strong> les pouvoirs.";
            }
        } else if (isCurrentUserGod && godContainer) {
            godContainer.style.display = 'block';
            if (godCheckbox) godCheckbox.disabled = false;
            if (godDesc) godDesc.innerHTML = "⚠️ En cochant, vous lui <strong>transférez</strong> vos pouvoirs. Vous les perdrez définitivement.";
        }
    }

    if (targetUser.id === currentUid && deleteZone) {
        deleteZone.style.display = 'none';
    }

    document.getElementById('edit-user-modal').style.display = 'flex';
};

const initModalLogic = () => {
    const modal = document.getElementById('edit-user-modal');
    if (!modal) return;

    document.getElementById('close-modal-btn').addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const userId = document.getElementById('edit-user-id').value;
        const targetUser = allUsersData.find(u => u.id === userId);

        if (targetUser.isGod && !isCurrentUserGod) {
            alert("❌ Accès refusé : Vous ne pouvez pas modifier le profil de l'Administrateur Suprême.");
            return;
        }

        const updates = {};

        if (!document.getElementById('edit-user-prenom').disabled) {
            updates.prenom = formatPrenom(document.getElementById('edit-user-prenom').value);
        }

        if (!document.getElementById('edit-user-nom').disabled) {
            updates.nom = formatNom(document.getElementById('edit-user-nom').value);
        }

        if (!document.getElementById('edit-user-role').disabled) {
            updates.role = document.getElementById('edit-user-role').value;
            updates.statut = document.getElementById('edit-user-statut').value;
        }

        const godCheckbox = document.getElementById('edit-user-isgod');
        const godLabelWrapper = godCheckbox ? godCheckbox.parentElement : null;
        const godExists = allUsersData.some(u => u.isGod === true);

        if (godCheckbox && godCheckbox.checked && godLabelWrapper && godLabelWrapper.style.display !== 'none') {
            if (isCurrentUserGod || !godExists) {
                updates.isGod = true;
                const currentGodProfile = allUsersData.find(u => u.isGod === true);

                if (currentGodProfile && currentGodProfile.id !== targetUser.id) {
                    await updateDoc(doc(db, "users", currentGodProfile.id), { isGod: false });
                }
            }
        }

        try {
            await updateDoc(doc(db, "users", userId), updates);
            modal.style.display = 'none';
            fetchUsers();
        } catch (error) {
            alert("Erreur de sauvegarde.");
        }
    });

    document.getElementById('delete-user-btn').addEventListener('click', async () => {
        const userId = document.getElementById('edit-user-id').value;
        const targetUser = allUsersData.find(u => u.id === userId);

        if (targetUser.isGod) {
            alert("❌ SÉCURITÉ : Le compte Suprême ne peut pas être supprimé !");
            return;
        }

        if (targetUser.id === currentUid) {
            alert("❌ SÉCURITÉ : Vous ne pouvez pas supprimer votre propre compte.");
            return;
        }

        if (confirm("DANGER ABSOLU : Supprimer définitivement ?")) {
            try {
                const deleteUserAccount = httpsCallable(functionsInstance, 'deleteUserAccount');
                await deleteUserAccount({ uid: userId });
                modal.style.display = 'none';
                fetchUsers();
            } catch (error) {
                alert("❌ Erreur serveur.");
            }
        }
    });

    document.getElementById('reset-pwd-btn').addEventListener('click', async () => {
        const userEmail = document.getElementById('edit-user-email').value;

        try {
            await sendPasswordResetEmail(auth, userEmail);
            alert(`✅ E-mail de réinitialisation envoyé à ${userEmail}`);
        } catch (error) {
            alert("❌ Impossible d'envoyer l'e-mail.");
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const myProfileBtn = document.getElementById('btn-my-profile');

    if (myProfileBtn) {
        myProfileBtn.addEventListener('click', () => {
            if (currentUid) {
                window.location.href = `admin-profile.html?id=${currentUid}`;
            } else {
                alert("Veuillez patienter, chargement de l'utilisateur en cours...");
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);

    const cacheBtn = document.getElementById('btn-clear-cache');

    if (cacheBtn) {
        cacheBtn.addEventListener('click', () => {
            if (confirm('Vider le cache local ? Cela rechargera la page.')) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            }
        });
    }

    if (typeof initFilters === "function") initFilters();
    if (typeof initUserCreation === "function") initUserCreation();
    if (typeof initModalLogic === "function") initModalLogic();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            if (typeof fetchUsers === "function") fetchUsers();
        } else {
            window.location.replace('/login.html');
        }
    });
});
