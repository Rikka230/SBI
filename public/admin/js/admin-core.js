/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

/* --- 1.1 INITIALISATION OUTILS DE BASE --- */
import { logoutUser } from '/js/auth.js';
import { db, auth, app } from '/js/firebase-init.js';
import { doc, setDoc, collection, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const functionsInstance = getFunctions(app);

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


/* --- 3. AFFICHAGE ET RECHERCHE DES UTILISATEURS --- */
const fetchUsers = async () => {
    const container = document.getElementById('users-list-container');
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsersData = []; 
        
        querySnapshot.forEach((doc) => {
            allUsersData.push({ id: doc.id, ...doc.data() });
        });

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
            <div style="background: #0a0a0c; padding: 1.2rem 1.5rem; border: 1px solid #222; border-radius: 8px; margin-bottom: 0.8rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between; opacity: ${user.statut === 'suspendu' ? '0.6' : '1'}; transition: transform 0.2s, box-shadow 0.2s;">
                <div style="display: flex; align-items: center; gap: 1.5rem; flex-grow: 1; min-width: 250px;">
                    <div style="min-width: 100px;">${roleBadge}</div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="color: white; font-weight: bold; font-size: 1.05rem; letter-spacing: 0.5px;">${displayName}</span>
                        <span style="color: #9ca3af; font-size: 0.9rem; margin-top: 0.2rem;">${user.email}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2rem;">
                    <div style="font-size: 0.9rem; min-width: 80px; text-align: center;">${statusLabel}</div>
                    <button class="btn-secondary btn-edit-user" data-id="${user.id}" style="padding: 0.6rem 1.5rem; font-size: 0.85rem; font-weight: bold; background: rgba(138, 180, 248, 0.1); border: 1px solid rgba(138, 180, 248, 0.4); color: var(--accent-blue); border-radius: 6px; cursor: pointer; transition: all 0.2s;">Éditer</button>
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
const generateRandomPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";
    let password = "";
    for (let i = 0; i < 10; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

const formatNom = (str) => str.toUpperCase();
const formatPrenom = (str) => {
    return str.toLowerCase().replace(/(^|\s|-)\S/g, letter => letter.toUpperCase());
};

const initUserCreation = () => {
    const form = document.getElementById('create-user-form');
    const msgBox = document.getElementById('user-creation-msg');
    const pwdInput = document.getElementById('new-user-password');
    const regenBtn = document.getElementById('btn-regen-pwd');

    if (!form) return;

    if (pwdInput) pwdInput.value = generateRandomPassword();

    if (regenBtn) {
        regenBtn.addEventListener('click', () => {
            pwdInput.value = generateRandomPassword();
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        msgBox.className = 'sys-msg'; 
        msgBox.textContent = 'Création en cours...';
        msgBox.style.display = 'block';

        const rawPrenom = document.getElementById('new-user-prenom').value.trim();
        const rawNom = document.getElementById('new-user-nom').value.trim();
        
        const prenom = formatPrenom(rawPrenom);
        const nom = formatNom(rawNom);
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
            msgBox.textContent = `✅ Compte créé pour ${prenom} ${nom} ! Un email a été envoyé.`;
            
            form.reset(); 
            pwdInput.value = generateRandomPassword();
            fetchUsers(); 

        } catch (error) {
            console.error("Erreur création:", error);
            msgBox.classList.add('error');
            msgBox.textContent = "❌ Erreur : " + error.message;
        }
    });
};


/* --- 5. MODALE D'EDITION ET SUPPRESSION (CLOUD FUNCTIONS) --- */
const openEditModal = (userId) => {
    const targetUser = allUsersData.find(u => u.id === userId);
    if(!targetUser) return;

    const prenomInput = document.getElementById('edit-user-prenom');
    const nomInput = document.getElementById('edit-user-nom');
    const emailInput = document.getElementById('edit-user-email');
    const roleSelect = document.getElementById('edit-user-role');
    const statutSelect = document.getElementById('edit-user-statut');
    
    const godContainer = document.getElementById('god-mode-container');
    const godCheckbox = document.getElementById('edit-user-isgod');
    const godLabelWrapper = godCheckbox.parentElement;
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
    resetPwdBtn.style.display = 'block';
    submitBtn.style.display = 'block';
    deleteZone.style.display = 'block';
    
    godContainer.style.display = 'none';
    godCheckbox.checked = false;
    godLabelWrapper.style.display = 'flex';
    godDesc.style.marginTop = '0.5rem';

    const godExists = allUsersData.some(u => u.isGod === true);

    if (targetUser.isGod && !isCurrentUserGod) {
        prenomInput.disabled = true;
        nomInput.disabled = true;
        roleSelect.disabled = true;
        statutSelect.disabled = true;
        resetPwdBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        deleteZone.style.display = 'none'; 
        
        godContainer.style.display = 'block';
        godLabelWrapper.style.display = 'none';
        godDesc.style.marginTop = '0';
        godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Cet utilisateur est l'Administrateur Suprême (Lecture seule).</span>";
    } 
    else if (targetUser.isGod && isCurrentUserGod) {
        deleteZone.style.display = 'none'; 
        roleSelect.disabled = true; 
        statutSelect.disabled = true; 

        godContainer.style.display = 'block';
        godLabelWrapper.style.display = 'none';
        godDesc.style.marginTop = '0';
        godDesc.innerHTML = "<span style='color: #ffd700; font-size: 1.1rem; font-weight: bold;'>👑 Vous êtes l'Administrateur Suprême de la plateforme.</span>";
    }
    else if (!targetUser.isGod && targetUser.role === 'admin') {
        if (!godExists) {
            godContainer.style.display = 'block';
            godCheckbox.disabled = false;
            if (targetUser.id === currentUid) {
                godDesc.innerHTML = "Aucun God n'existe. Cochez pour <strong>réclamer</strong> les pouvoirs suprêmes (irréversible).";
                deleteZone.style.display = 'none'; 
            } else {
                godDesc.innerHTML = "Aucun God n'existe. Cochez pour lui <strong>donner</strong> les pouvoirs suprêmes.";
            }
        } else if (isCurrentUserGod) {
            godContainer.style.display = 'block';
            godCheckbox.disabled = false;
            godDesc.innerHTML = "⚠️ En cochant cette case, vous lui <strong>transférez</strong> vos pouvoirs suprêmes. Vous les perdrez définitivement.";
        }
    }

    if (targetUser.id === currentUid && !targetUser.isGod) {
        deleteZone.style.display = 'none';
    }

    if (targetUser.role === 'admin' && !isCurrentUserGod && targetUser.id !== currentUid) {
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
        const userId = document.getElementById('edit-user-id').value;
        const targetUser = allUsersData.find(u => u.id === userId);

        if (targetUser.isGod && !isCurrentUserGod) {
            alert("❌ Accès refusé : Impossible de réinitialiser le mot de passe de l'Administrateur Suprême.");
            return;
        }

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

        if (targetUser.isGod && !isCurrentUserGod) {
            alert("❌ Accès refusé : Vous ne pouvez pas modifier le profil de l'Administrateur Suprême.");
            return;
        }
        
        const updates = {};
        
        if (!document.getElementById('edit-user-prenom').disabled) {
            const rawPrenom = document.getElementById('edit-user-prenom').value.trim();
            updates.prenom = formatPrenom(rawPrenom);
        }
        if (!document.getElementById('edit-user-nom').disabled) {
            const rawNom = document.getElementById('edit-user-nom').value.trim();
            updates.nom = formatNom(rawNom);
        }
        
        if (!document.getElementById('edit-user-role').disabled) {
            updates.role = document.getElementById('edit-user-role').value;
            updates.statut = document.getElementById('edit-user-statut').value;
        }

        const godExists = allUsersData.some(u => u.isGod === true);
        if (godCheckbox.checked && godLabelWrapper.style.display !== 'none') {
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
            console.error("Erreur mise à jour:", error);
            alert("Erreur lors de la mise à jour des données.");
        }
    });

    // --- APPEL AU SERVEUR (Nettoyé pour la V2) ---
    deleteBtn.addEventListener('click', async () => {
        const userId = document.getElementById('edit-user-id').value;
        const targetUser = allUsersData.find(u => u.id === userId);

        if (targetUser.isGod) {
            alert("❌ Accès refusé : Le compte Suprême ne peut pas être supprimé.");
            return;
        }

        const confirmMsg = "🛑 DANGER ABSOLU : Le compte va être intégralement détruit (Base de données ET accès Firebase Auth).\n\nConfirmer la suppression définitive ?";
        
        if(confirm(confirmMsg)) {
            deleteBtn.textContent = "⏳ Suppression en cours...";
            deleteBtn.disabled = true;

            try {
                if (!auth.currentUser) {
                    throw new Error("Session expirée. Veuillez vous reconnecter.");
                }

                // Appel propre à la Cloud Function V2 (plus besoin d'injecter manuellement le token)
                const deleteUserAccount = httpsCallable(functionsInstance, 'deleteUserAccount');
                const result = await deleteUserAccount({ uid: userId });
                
                alert(`✅ Succès : ${result.data.message}`);
                modal.style.display = 'none';
                fetchUsers(); 
            } catch (error) {
                console.error("Détails erreur:", error);
                alert("❌ Erreur serveur : " + error.message);
            } finally {
                deleteBtn.textContent = "⚠️ Supprimer le compte définitivement";
                deleteBtn.disabled = false;
            }
        }
    });
};

// --- INITIALISATION GLOBALE EN ATTENDANT L'AUTHENTIFICATION ---
document.addEventListener('DOMContentLoaded', () => {
    // La ligne initNavigation() a été supprimée d'ici !
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
