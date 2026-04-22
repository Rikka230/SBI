/**
 * =======================================================================
 * STUDENT HUB - Logique du tableau de bord étudiant
 * =======================================================================
 */

// Mise à jour des chemins : on remonte de 2 dossiers (../../) pour trouver le js/ racine
import { db, auth } from '../../js/firebase-init.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // Vérification de la connexion
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loadStudentData(user.uid);
        } else {
            window.location.replace('../../login.html'); // Remonte aussi pour le login
        }
    });

});

async function loadStudentData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            
            // 1. Mise à jour de la Top Bar
            const name = data.prenom || data.nom || "Étudiant";
            document.getElementById('top-user-name').textContent = name;
            
            if(data.photoURL) {
                document.getElementById('top-user-avatar').innerHTML = `<img src="${data.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                document.getElementById('top-user-avatar').textContent = name.charAt(0).toUpperCase();
            }

            // 2. Logique de Gamification / XP
            const xp = data.xp || 150; // XP par défaut pour le test
            const level = Math.floor(xp / 100) + 1;
            const percent = Math.min((xp / 1000) * 100, 100);

            document.getElementById('top-user-level').textContent = `Niveau ${level}`;
            document.getElementById('hub-level').textContent = level;
            document.getElementById('hub-xp').textContent = xp;
            
            // Animation fluide de la barre
            setTimeout(() => { 
                const xpFill = document.getElementById('hub-xp-fill');
                if(xpFill) xpFill.style.width = percent + '%'; 
            }, 300);

            // 3. Récupération des Formations Assignées par l'Admin
            const formationsSnap = await getDocs(collection(db, "formations"));
            const formationsList = document.getElementById('assigned-formations-list');
            let assigned = [];
            
            formationsSnap.forEach(docSnap => {
                const f = docSnap.data();
                if (f.students && f.students.includes(uid)) {
                    assigned.push(f.titre);
                }
            });

            // Affichage des catégories débloquées
            if (assigned.length > 0) {
                formationsList.innerHTML = assigned.map(a => `
                    <div style="padding: 1rem; background: #0a0a0c; border: 1px solid #222; border-radius: 6px; color: white; display: flex; align-items: center; gap: 0.8rem; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent-green)'" onmouseout="this.style.borderColor='#222'">
                        <div style="width: 8px; height: 8px; background: var(--accent-green); border-radius: 50%;"></div>
                        ${a}
                    </div>
                `).join('');
            } else {
                formationsList.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Aucun module ne vous a été assigné par l\'équipe pédagogique.</p>';
            }
        }
    } catch(e) {
        console.error("Erreur de chargement du Hub Étudiant", e);
    }
}
