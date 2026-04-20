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
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
let currentUid = null;
let isCurrentUserGod = false;


/* --- 2. NAVIGATION INTERNE AVEC MEMOIRE (F5) --- */
const initNavigation = () => {
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    const savedTab = sessionStorage.getItem('activeAdminTab');
    if (savedTab) {
        navButtons.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.nav-item[data-target="${savedTab}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        const activeView = document.getElementById(savedTab);
        if (activeView) activeView.classList.add('active');
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');

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

        // DEFINITION DU POUVOIR DU COMPTE CONNECTE
        const godExists = allUsersData.some(u => u.isGod === true);
        const myProfile = allUsersData.find(u => u.id === currentUid);
        isCurrentUserGod = godExists ? (myProfile && myProfile.isGod === true) : true;
        
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
        if (user.isGod) {
            roleBadge = '<span style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block;">👑 Suprême</span>';
        } else if(user.role === 'admin') {
            roleBadge = '<span style="background: rgba(255, 74, 74, 0.15); color: #ff4a4a; border: 1px solid rgba(255, 74, 74, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block;">Admin</span>';
        } else if(user.role === 'teacher') {
            roleBadge = '<span style="background: rgba(255, 215, 0, 0.15); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block;">Enseignant</span>';
        } else if(user.role === 'student') {
            roleBadge = '<span style="background: rgba(0, 255, 163, 0.15); color: #00ffa3; border: 1px solid rgba(0, 255, 163, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight:bold; display:inline-block;">Étudiant</span>';
        }

        const userCardHTML = `
            <div style="background: #0a0a0c; padding: 0.8rem 1.2rem; border: 1px solid #222; border-radius: 6px; margin-bottom: 0.5rem; display: grid; grid-template-columns: 120px 1.5fr 2fr 100px 120px; gap: 1rem; align-items: center; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; transition: all 0.2s;">
                <div>${roleBadge}</div>
                <div style="color: white; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName}">${displayName}</div>
                <div style="color: #9ca3af; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${user.email}">${user.email}</div>
                <div style="font-size: 0.85rem;">${statusLabel}</div>
                <div style="text-align: right;"><button class="btn-secondary btn-edit-user" data-id="${user.id}" style="padding: 0.4rem 1rem; font-size: 0.85rem; width: 100%;">Éditer</button></div>
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
                isGod: false,
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


/* --- 5. MODALE D'EDITION (GOD MODE & SUPPRESSION) --- */
const openEditModal = (userId) => {
    const targetUser = allUsersData.find(u => u.id === userId);
    if(!targetUser) return;

    document.getElementById('edit-user-id').value = targetUser.id;
    document.getElementById('edit-user-prenom').value = targetUser.prenom || '';
    document.getElementById('edit-user-nom').value = targetUser.nom || '';
    document.getElementById('edit-user-email').value = targetUser.email || '';
    document.getElementById('edit-user-role').value = targetUser.role || 'student';
    document.getElementById('edit-user-statut').value = targetUser.statut || 'actif';

    const godContainer = document.getElementById('god-mode-container');
    const godCheckbox = document.getElementById('edit-user-isgod');
    const godLabelWrapper = godCheckbox.parentElement; // Le label contenant la case
    const godDesc = document.getElementById('god-mode-desc');
    
    const deleteZone = document.getElementById('delete-zone');
    const roleSelect = document.getElementById('edit-user-role');
    const statutSelect = document.getElementById('edit-user-statut');

    // Réinitialisation de l'affichage par défaut
    godContainer.style.display = 'none';
    godCheckbox.checked = false;
    godLabelWrapper.style.display = 'flex'; // Affiche la case à cocher
    godDesc.style.marginTop = '0.5rem';
    deleteZone.style.display = 'block';
    roleSelect.disabled = false;
    statutSelect.disabled = false;

    const godExists = allUsersData.some(u => u.isGod === true);

    // A. LOGIQUE DU GOD MODE (AFFICHAGE)
    if (targetUser.isGod) {
        // Le profil ouvert EST le God officiel
        godContainer.style.display = 'block';
        godLabelWrapper.style.display = 'none'; // On masque la case à cocher
        godDesc.style.marginTop = '0'; // On réajuste l'espacement
        
        if (targetUser.id === currentUid) {
            godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Vous êtes l'Administrateur Suprême de la plateforme.</span>";
        } else {
            godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Cet utilisateur est l'Administrateur Suprême.</span>";
        }
    } else if (!godExists && targetUser.role === 'admin') {
        // Aucun God n'existe encore. La couronne est vacante.
        godContainer.style.display = 'block';
        godCheckbox.disabled = false;
        if (targetUser.id === currentUid) {
            godDesc.innerHTML = "Aucun God n'existe. Cochez pour <strong>réclamer</strong> les pouvoirs suprêmes (irréversible).";
        } else {
            godDesc.innerHTML = "Aucun God n'existe. Cochez pour lui <strong>donner</strong> les pouvoirs suprêmes.";
        }
    } else if (isCurrentUserGod && targetUser.role === 'admin' && targetUser.id !== currentUid) {
        // Le God actuel veut transférer son pouvoir à un autre admin
        godContainer.style.display = 'block';
        godCheckbox.disabled = false;
        godDesc.innerHTML = "⚠️ En cochant cette case, vous lui <strong>transférez</strong> vos pouvoirs suprêmes. Vous les perdrez définitivement.";
    }

    // B. LOGIQUE DE VERROUILLAGE DES DROITS DE SUPPRESSION
    if (targetUser.isGod) {
        deleteZone.style.display = 'none';
        roleSelect.disabled = true;
        statutSelect.disabled = true;
    } else if (targetUser.role === 'admin' && !isCurrentUserGod) {
        deleteZone.style.display = 'none';
    } else if (targetUser.id === currentUid) {
        deleteZone.style.display = 'none';
    }

    document.getElementById('edit-user-modal').style.display = 'flex';
};

const initModalLogic = () => {
    const modal = document.getElementById('edit-user-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const form = document.getElementById('edit-user-form');
    const deleteBtn = document.getElementById('delete-user-btn');
    const resetPwdBtn = document.getElementById('reset-pwd-btn');
    const godCheckbox = document.getElementById('edit-user-isgod');
    const godLabelWrapper = godCheckbox.parentElement;

    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

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
        const targetUser = allUsersData.find(u => u.id === userId);
        
        const updates = {
            prenom: document.getElementById('edit-user-prenom').value.trim(),
            nom: document.getElementById('edit-user-nom').value.trim(),
        };

        if (!document.getElementById('edit-user-role').disabled) {
            updates.role = document.getElementById('edit-user-role').value;
            updates.statut = document.getElementById('edit-user-statut').value;
        }

        // C. LOGIQUE DE SAUVEGARDE GOD MODE
        const godExists = allUsersData.some(u => u.isGod === true);
        
        if (godCheckbox.checked && godLabelWrapper.style.display !== 'none') {
            // Seul le God actuel (ou n'importe qui si le trône est vide) peut valider ce choix
            if (isCurrentUserGod || !godExists) {
                updates.isGod = true;
                
                // Si y avait un ancien God, on le rétrograde
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

// --- INITIALISATION GLOBALE EN ATTENDANT L'AUTHENTIFICATION ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilters();
    initUserCreation();
    initModalLogic(); 

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            fetchUsers(); 
        }
    });
});
