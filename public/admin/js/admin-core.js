/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

import { logoutUser } from '/js/auth.js';
import { db, auth, app } from '/js/firebase-init.js';
import { doc, setDoc, collection, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app);

// Configuration app secondaire pour la création de compte sans déconnecter l'admin
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

const fetchUsers = async () => {
    const container = document.getElementById('users-list-container');
    if(!container) return;
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsersData = []; 
        querySnapshot.forEach((doc) => { allUsersData.push({ id: doc.id, ...doc.data() }); });
        
        const godExists = allUsersData.some(u => u.isGod === true);
        const myProfile = allUsersData.find(u => u.id === currentUid);
        isCurrentUserGod = godExists ? (myProfile && myProfile.isGod === true) : true;
        
        renderUsersList(allUsersData);
    } catch (error) {
        container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
    }
};

const renderUsersList = (usersToRender) => {
    const container = document.getElementById('users-list-container');
    if(!container) return;
    
    // Nettoyage (on retire l'ancien scroll horizontal)
    container.innerHTML = ''; 
    container.style.overflowX = 'hidden';
    container.style.paddingBottom = '0';
    
    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>'; return;
    }
    
    usersToRender.forEach(user => {
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || "Sans nom");
        const statusLabel = user.statut === 'suspendu' ? '<span style="color: #ff4a4a; font-weight:bold;">Suspendu</span>' : '<span style="color: #2ed573; font-weight:bold;">Actif</span>';
        
        // Style harmonisé pour les étiquettes (Rôle et Bouton Éditer)
        const badgeStyle = "padding: 4px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; display: inline-block; text-align: center; width: 100%; text-transform: uppercase; letter-spacing: 0.5px;";
        
        // Le Rôle n'est plus un bouton, juste un fond coloré léger et élégant
        let roleBadge = '';
        if (user.isGod) roleBadge = `<span style="${badgeStyle} background: rgba(255, 215, 0, 0.08); color: #ffd700;">Suprême</span>`;
        else if(user.role === 'admin') roleBadge = `<span style="${badgeStyle} background: rgba(255, 74, 74, 0.08); color: #ff4a4a;">Admin</span>`;
        else if(user.role === 'teacher') roleBadge = `<span style="${badgeStyle} background: rgba(251, 188, 4, 0.08); color: #fbbc04;">Prof</span>`;
        else if(user.role === 'student') roleBadge = `<span style="${badgeStyle} background: rgba(0, 255, 163, 0.08); color: #00ffa3;">Élève</span>`;

        // Le bouton Éditer reprend exactement le même design que le rôle (en bleu)
        const editBtnStyle = `${badgeStyle} background: rgba(42, 87, 255, 0.1); color: #2A57FF; border: none; cursor: pointer; transition: background-color 0.2s;`;

        // Grille resserrée (gap réduit), petite police (0.8rem) et colonnes ajustées
        const userCardHTML = `
            <div style="background: #0a0a0c; padding: 0.6rem 0.8rem; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.4rem; display: grid; grid-template-columns: 75px 1fr 1.5fr 70px 75px; gap: 0.8rem; align-items: center; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; font-size: 0.8rem;">
                <div>${roleBadge}</div>
                <div style="color: white; font-weight: bold; word-break: break-word; min-width: 0;">${displayName}</div>
                <div style="color: #9ca3af; word-break: break-word; min-width: 0;">${user.email}</div>
                <div style="text-align: center;">${statusLabel}</div>
                <div>
                    <button class="btn-edit-user" data-id="${user.id}" style="${editBtnStyle}" onmouseover="this.style.background='rgba(42, 87, 255, 0.2)'" onmouseout="this.style.background='rgba(42, 87, 255, 0.1)'">Éditer</button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', userCardHTML);
    });
    
    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => openEditModal(e.target.getAttribute('data-id')));
    });
};

const initFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');
    if(!searchInput || !roleFilter) return;

    const filterData = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const roleTerm = roleFilter.value;
        const filteredUsers = allUsersData.filter(user => {
            const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
            const matchesSearch = fullName.includes(searchTerm) || (user.email || '').toLowerCase().includes(searchTerm);
            const matchesRole = roleTerm === 'all' || user.role === roleTerm;
            return matchesSearch && matchesRole;
        });
        renderUsersList(filteredUsers);
    };
    searchInput.addEventListener('input', filterData);
    roleFilter.addEventListener('change', filterData);
};

const generateRandomPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";
    let pwd = ""; for (let i = 0; i < 10; i++) pwd += charset.charAt(Math.floor(Math.random() * charset.length));
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
        msgBox.style.display = 'block'; msgBox.textContent = 'Création...';
        
        const prenom = formatPrenom(document.getElementById('new-user-prenom').value.trim());
        const nom = formatNom(document.getElementById('new-user-nom').value.trim());
        const email = document.getElementById('new-user-email').value.trim();
        const role = document.getElementById('new-user-role').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pwdInput.value);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                prenom, nom, email, role, statut: "actif", isGod: false, dateCreation: new Date().toISOString()
            });
            await secondaryAuth.signOut();
            await sendPasswordResetEmail(auth, email);
            msgBox.style.color = "var(--accent-green)"; msgBox.textContent = `✅ Compte créé pour ${prenom} ! Email envoyé.`;
            form.reset(); pwdInput.value = generateRandomPassword(); fetchUsers(); 
        } catch (error) {
            msgBox.style.color = "var(--accent-red)"; msgBox.textContent = "❌ Erreur : " + error.message;
        }
    });
};

const openEditModal = (userId) => {
    const targetUser = allUsersData.find(u => u.id === userId);
    if(!targetUser) return;
    document.getElementById('edit-user-id').value = targetUser.id;
    document.getElementById('edit-user-prenom').value = targetUser.prenom || '';
    document.getElementById('edit-user-nom').value = targetUser.nom || '';
    document.getElementById('edit-user-email').value = targetUser.email || '';
    document.getElementById('edit-user-role').value = targetUser.role || 'student';
    document.getElementById('edit-user-statut').value = targetUser.statut || 'actif';
    document.getElementById('edit-user-modal').style.display = 'flex';
};

const initModalLogic = () => {
    const modal = document.getElementById('edit-user-modal');
    if(!modal) return;
    document.getElementById('close-modal-btn').addEventListener('click', () => modal.style.display = 'none');
    
    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        await updateDoc(doc(db, "users", userId), {
            prenom: formatPrenom(document.getElementById('edit-user-prenom').value),
            nom: formatNom(document.getElementById('edit-user-nom').value),
            role: document.getElementById('edit-user-role').value,
            statut: document.getElementById('edit-user-statut').value
        });
        modal.style.display = 'none'; fetchUsers();
    });

    document.getElementById('delete-user-btn').addEventListener('click', async () => {
        const userId = document.getElementById('edit-user-id').value;
        if(confirm("DANGER ABSOLU : Supprimer définitivement ?")) {
            try {
                const deleteUserAccount = httpsCallable(functionsInstance, 'deleteUserAccount');
                await deleteUserAccount({ uid: userId });
                modal.style.display = 'none'; fetchUsers(); 
            } catch (error) { alert("❌ Erreur serveur."); }
        }
    });
};

// --- LANCEMENT PROPRE DE L'APPLICATION ---
document.addEventListener('DOMContentLoaded', () => {
    
    // BUG CORRIGÉ : Réactivation des boutons du panneau droit dans index.html
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }
    
    const cacheBtn = document.getElementById('btn-clear-cache');
    if(cacheBtn) {
        cacheBtn.addEventListener('click', () => {
            if(confirm('Vider le cache local ? Cela rechargera la page.')) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            }
        });
    }

    initFilters();
    initUserCreation();
    initModalLogic(); 

    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUid = user.uid; 
            fetchUsers(); 
        } else {
            window.location.replace('/login.html');
        }
    });
});
