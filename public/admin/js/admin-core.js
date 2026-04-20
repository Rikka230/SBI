/**
 * =======================================================================
 * LOGIQUE DU BACK-OFFICE ADMIN (Vanilla JS)
 * =======================================================================
 */

/* --- 1.1 INITIALISATION OUTILS DE BASE --- */
import { logoutUser } from '/js/auth.js';
import { db, auth } from '/js/firebase-init.js';
import { doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Action : Bouton de déconnexion
document.getElementById('logout-btn').addEventListener('click', logoutUser);

// Action : Bouton Vidage de Cache
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

// Variable globale pour stocker la liste des utilisateurs et filtrer sans recharger
let allUsersData = [];


/* --- 2. NAVIGATION INTERNE (Système d'onglets) --- */
const initNavigation = () => {
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });
};


/* --- 3. AFFICHAGE ET RECHERCHE DES UTILISATEURS --- */

// Récupérer les données depuis Firestore
const fetchUsers = async () => {
    const container = document.getElementById('users-list-container');
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsersData = []; // Réinitialise le tableau
        
        querySnapshot.forEach((doc) => {
            allUsersData.push({ id: doc.id, ...doc.data() });
        });
        
        renderUsersList(allUsersData);
    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs:", error);
        container.innerHTML = `<div class="sys-msg error" style="display:block;">Impossible de charger les utilisateurs.</div>`;
    }
};

// Dessiner le HTML de la liste
const renderUsersList = (usersToRender) => {
    const container = document.getElementById('users-list-container');
    container.innerHTML = ''; // On vide le conteneur

    if (usersToRender.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun compte trouvé.</div>';
        return;
    }

    usersToRender.forEach(user => {
        // Sécurité si les anciens comptes n'ont pas la structure nom/prenom
        const displayName = (user.prenom && user.nom) ? `${user.prenom} ${user.nom}` : (user.nom || "Utilisateur sans nom");
        const statusLabel = user.statut === 'actif' ? '<span style="color: #2ed573;">● Actif</span>' : '<span style="color: #9ca3af;">● Inconnu</span>';

        // Traduction visuelle des rôles
        let roleBadge = '';
        if(user.role === 'admin') roleBadge = '<span style="background: rgba(255, 74, 74, 0.2); color: #ff4a4a; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">Admin</span>';
        if(user.role === 'teacher') roleBadge = '<span style="background: rgba(42, 87, 255, 0.2); color: var(--sbi-blue); padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">Enseignant</span>';
        if(user.role === 'student') roleBadge = '<span style="background: rgba(46, 213, 115, 0.2); color: #2ed573; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">Étudiant</span>';

        const userCardHTML = `
            <div style="background: #0a0a0c; padding: 1rem; border: 1px solid #222; border-radius: 4px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0 0 0.2rem 0;">${displayName} ${roleBadge}</h4>
                    <p style="margin: 0; font-size: 0.85rem; color: #9ca3af;">${user.email} | ${statusLabel}</p>
                </div>
                <button class="btn-secondary" style="padding: 0.4rem 1rem; font-size: 0.85rem;">Éditer</button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', userCardHTML);
    });
};

// Logique de Filtrage
const initFilters = () => {
    const searchInput = document.getElementById('search-user');
    const roleFilter = document.getElementById('filter-role');

    const filterData = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const roleTerm = roleFilter.value;

        const filteredUsers = allUsersData.filter(user => {
            const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
            const email = (user.email || '').toLowerCase();
            
            // Vérifie la recherche texte
            const matchesSearch = fullName.includes(searchTerm) || email.includes(searchTerm);
            // Vérifie le rôle
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
            // 1. Création silencieuse
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            // 2. Enregistrement Base de données
            await setDoc(doc(db, "users", newUid), {
                prenom: prenom,
                nom: nom,
                email: email,
                role: role,
                statut: "actif", // Statut par défaut
                dateCreation: new Date().toISOString(),
                formationsAcces: [] 
            });

            // 3. Déconnexion instance secondaire
            await secondaryAuth.signOut();

            // 4. Envoi de l'email de réinitialisation via l'instance principale
            await sendPasswordResetEmail(auth, email);

            // Succès
            msgBox.classList.add('success');
            msgBox.textContent = `✅ Compte créé ! Un email de configuration a été envoyé à ${prenom}.`;
            form.reset(); 
            
            // Met à jour la liste en direct
            fetchUsers();

        } catch (error) {
            console.error("Erreur création:", error);
            msgBox.classList.add('error');
            
            if (error.code === 'auth/email-already-in-use') {
                msgBox.textContent = "❌ Cet email est déjà utilisé.";
            } else if (error.code === 'auth/weak-password') {
                msgBox.textContent = "❌ Le mot de passe doit faire au moins 6 caractères.";
            } else {
                msgBox.textContent = "❌ Erreur : " + error.message;
            }
        }
    });
};

// --- INITIALISATION GLOBALE ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilters();
    fetchUsers(); // Charge la liste dès le démarrage
    initUserCreation();
});
