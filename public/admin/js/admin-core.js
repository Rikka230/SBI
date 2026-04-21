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
    
    // On vide le conteneur et on active la barre de défilement horizontale
    container.innerHTML = ''; 
    container.style.overflowX = 'auto';
    container.style.paddingBottom = '10px'; // Laisse respirer la scrollbar
    
    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>'; return;
    }
    
    usersToRender.forEach(user => {
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || "Sans nom");
        const statusLabel = user.statut === 'suspendu' ? '<span style="color: #ff4a4a; font-weight:bold;">Suspendu</span>' : '<span style="color: #2ed573; font-weight:bold;">Actif</span>';
        
        let roleBadge = '';
        if (user.isGod) roleBadge = '<span style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block; white-space:nowrap;">👑 Suprême</span>';
        else if(user.role === 'admin') roleBadge = '<span style="background: rgba(255, 74, 74, 0.15); color: #ff4a4a; border: 1px solid rgba(255, 74, 74, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block; white-space:nowrap;">Admin</span>';
        else if(user.role === 'teacher') roleBadge = '<span style="background: rgba(255, 215, 0, 0.15); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block; white-space:nowrap;">Enseignant</span>';
        else if(user.role === 'student') roleBadge = '<span style="background: rgba(0, 255, 163, 0.15); color: #00ffa3; border: 1px solid rgba(0, 255, 163, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block; white-space:nowrap;">Étudiant</span>';

        // Affichage en ligne sans retour à la ligne (white-space: nowrap) avec taille minimale (min-width: 800px)
        const userCardHTML = `
            <div style="background: #0a0a0c; padding: 0.8rem 1.2rem; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.5rem; display: grid; grid-template-columns: 120px auto auto 100px 100px; gap: 1.5rem; align-items: center; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; min-width: 800px;">
                <div>${roleBadge}</div>
                <div style="color: white; font-weight: bold; white-space: nowrap;">${displayName}</div>
                <div style="color: #9ca3af; font-size: 0.9rem; white-space: nowrap;">${user.email}</div>
                <div style="font-size: 0.85rem; white-space: nowrap;">${statusLabel}</div>
                <div style="text-align: right;"><button class="action-btn btn-edit-user" data-id="${user.id}" style="padding: 0.4rem 1rem; font-size: 0.85rem; margin:0; width: 100%; white-space: nowrap;">Éditer</button></div>
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
