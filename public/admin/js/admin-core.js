/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

/* --- 1.1 INITIALISATION OUTILS DE BASE --- */
import { logoutUser } from '/js/auth.js';
import { db, auth } from '/js/firebase-init.js';
import { doc, setDoc, collection, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.getElementById('logout-btn').addEventListener('click', logoutUser);

document.getElementById('btn-clear-cache').addEventListener('click', () => {
    if(confirm('Vider le cache local ? Cela rechargera la page.')) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload(true);
    }
});

/* --- 1.2 CONFIGURATION APP SECONDAIRE --- */
const firebaseConfig = {
    apiKey: "AIzaSyBCBY51kkexg7jJgEpVYlKCNbZemrtdaiY",
    authDomain: "sbi-web-4f6b4.firebaseapp.com",
    projectId: "sbi-web-4f6b4"
};
const secondaryApp = initializeApp(firebaseConfig, "AdminCreationApp");
const secondaryAuth = getAuth(secondaryApp);

let allUsersData = [];


/* --- 2. NAVIGATION INTERNE AVEC MEMOIRE (F5) --- */
const initNavigation = () => {
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    // Vérifier si un onglet était déjà ouvert avant le rafraîchissement
    const savedTab = sessionStorage.getItem('activeAdminTab');
    if (savedTab) {
        navButtons.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.nav-item[data-target="${savedTab}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        const activeView = document.getElementById(savedTab);
        if (activeView) activeView.classList.add('active');
    }

    // Comportement au clic
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');

            // Sauvegarder l'onglet cliqué dans la mémoire session
            sessionStorage.setItem('activeAdminTab', targetId);
        });
    });
};


/* --- 3. AFFICHAGE ET RECHERCHE DES UTILISATEURS --- */
const fetchUsers = async () => {
    const container = document.getElementById('users-list-container');
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsersData = []; 
        
        querySnapshot.forEach((doc) => {
            allUsersData.push({ id: doc.id, ...doc.data() });
        });
        
        renderUsersList(allUsersData);
    } catch (error) {
        console.error("Erreur récupération:", error);
        container.innerHTML = `<div class="sys-msg error" style="display:block;">Erreur de chargement.</div>`;
    }
};

const renderUsersList = (usersToRender) => {
    const container = document.getElementById('users-list-container');
    container.innerHTML = ''; 

    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>';
        return;
    }

    usersToRender.forEach(user => {
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || "Sans nom");
        const statusLabel = user.statut === 'suspendu' ? '<span style="color: #ff4a4a; font-weight:bold;">Suspendu</span>' : '<span style="color: #2ed573; font-weight:bold;">Actif</span>';

        let roleBadge = '';
        if(user.role === 'admin') roleBadge = '<span style="color: #ff4a4a; font-weight:bold;">Admin</span>';
        if(user.role === 'teacher') roleBadge = '<span style="color: var(--sbi-blue); font-weight:bold;">Enseignant</span>';
        if(user.role === 'student') roleBadge = '<span style="color: #9ca3af; font-weight:bold;">Étudiant</span>';

        // STRUCTURE GRID SUR 1 SEULE LIGNE (Rôle | Nom | Email | Statut | Bouton)
        const userCardHTML = `
            <div style="background: #0a0a0c; padding: 0.8rem 1.2rem; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.5rem; display: grid; grid-template-columns: 100px 1.5fr 2fr 100px 120px; gap: 1rem; align-items: center; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; transition: all 0.2s;">
                
                <div style="font-size: 0.9rem;">${roleBadge}</div>
                
                <div style="color: white; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName}">
                    ${displayName}
                </div>
                
                <div style="color: #9ca3af; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${user.email}">
                    ${user.email}
                </div>
                
                <div style="font-size: 0.85rem;">${statusLabel}</div>
                
                <div style="text-align: right;">
                    <button class="btn-secondary btn-edit-user" data-id="${user.id}" style="padding: 0.4rem 1rem; font-size: 0.85rem; width: 100%;">Éditer</button>
                </div>
                
            </div>
        `;
        container.insertAdjacentHTML('beforeend', userCardHTML);
    });

    attachEditListeners();
};

const attachEditListeners = () => {
    const editBtns = document.querySelectorAll('.btn-edit-user');
    editBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-id');
            openEditModal(userId);
        });
    });
};

const initFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');

    const filterData = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const roleTerm = roleFilter.value;

        const filteredUsers = allUsersData.filter(user => {
            const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
            const email = (user.email || '').toLowerCase();
            const matchesSearch = fullName.includes(searchTerm) || email.includes(searchTerm);
            const matchesRole = roleTerm === 'all' || user.role === roleTerm;
            return matchesSearch && matchesRole;
        });

        renderUsersList(filteredUsers);
    };

    searchInput.addEventListener('input', filterData);
    roleFilter.addEventListener('change', filterData);
};


/* --- 4. CREATION DE COMPTES UTILISATEURS --- */
const initUserCreation = () => {
    const form = document.getElementById('create-user-form');
    const msgBox = document.getElementById('user-creation-msg');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        msgBox.className = 'sys-msg'; 
        msgBox.textContent = 'Création en cours...';
        msgBox.style.display = 'block';

        const prenom = document.getElementById('new-user-prenom').value.trim();
        const nom = document.getElementById('new-user-nom').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            await setDoc(doc(db, "users", newUid), {
                prenom: prenom,
                nom: nom,
                email: email,
                role: role,
                statut: "actif",
                dateCreation: new Date().toISOString(),
                formationsAcces: [] 
            });

            await secondaryAuth.signOut();
            await sendPasswordResetEmail(auth, email);

            msgBox.classList.add('success');
            msgBox.textContent = `✅ Compte créé ! Un email a été envoyé.`;
            form.reset(); 
            fetchUsers(); 

        } catch (error) {
            console.error("Erreur création:", error);
            msgBox.classList.add('error');
            msgBox.textContent = "❌ Erreur : " + error.message;
        }
    });
};


/* --- 5. MODALE D'EDITION, SUSPENSION ET SUPPRESSION --- */
const openEditModal = (userId) => {
    const user = allUsersData.find(u => u.id === userId);
    if(!user) return;

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-prenom').value = user.prenom || '';
    document.getElementById('edit-user-nom').value = user.nom || '';
    document.getElementById('edit-user-email').value = user.email || '';
    document.getElementById('edit-user-role').value = user.role || 'student';
    document.getElementById('edit-user-statut').value = user.statut || 'actif';

    document.getElementById('edit-user-modal').style.display = 'flex';
};

const initModalLogic = () => {
    const modal = document.getElementById('edit-user-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const form = document.getElementById('edit-user-form');
    const deleteBtn = document.getElementById('delete-user-btn');
    const resetPwdBtn = document.getElementById('reset-pwd-btn');

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    resetPwdBtn.addEventListener('click', async () => {
        const userEmail = document.getElementById('edit-user-email').value;
        try {
            await sendPasswordResetEmail(auth, userEmail);
            alert(`✅ Un e-mail de réinitialisation vient d'être envoyé à ${userEmail}`);
        } catch (error) {
            console.error("Erreur reset password:", error);
            alert("❌ Impossible d'envoyer l'e-mail. Vérifiez la connexion.");
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const newPrenom = document.getElementById('edit-user-prenom').value.trim();
        const newNom = document.getElementById('edit-user-nom').value.trim();
        const newRole = document.getElementById('edit-user-role').value;
        const newStatut = document.getElementById('edit-user-statut').value;

        try {
            await updateDoc(doc(db, "users", userId), {
                prenom: newPrenom,
                nom: newNom,
                role: newRole,
                statut: newStatut
            });
            modal.style.display = 'none';
            fetchUsers(); 
        } catch (error) {
            console.error("Erreur mise à jour:", error);
            alert("Erreur lors de la mise à jour des données.");
        }
    });

    deleteBtn.addEventListener('click', async () => {
        const userId = document.getElementById('edit-user-id').value;
        if(confirm("🛑 DANGER : Cela va supprimer définitivement l'accès de cet utilisateur à la plateforme. Confirmer ?")) {
            try {
                await deleteDoc(doc(db, "users", userId));
                modal.style.display = 'none';
                fetchUsers(); 
            } catch (error) {
                console.error("Erreur suppression:", error);
                alert("Erreur lors de la suppression du compte.");
            }
        }
    });
};

// --- INITIALISATION GLOBALE ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilters();
    fetchUsers(); 
    initUserCreation();
    initModalLogic(); 
});
