/**
 * =======================================================================
 * STUDENT HUB - Logique du tableau de bord étudiant
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loadStudentData(user.uid);
        } else {
            // Sécurité avec chemin absolu : renvoi vers la racine
            window.location.replace('/login.html'); 
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
            const topUserName = document.getElementById('top-user-name');
            if(topUserName) topUserName.textContent = name;
            
            const topUserAvatar = document.getElementById('top-user-avatar');
            if(topUserAvatar) {
                if(data.photoURL) {
                    topUserAvatar.innerHTML = `<img src="${data.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
                } else {
                    topUserAvatar.textContent = name.charAt(0).toUpperCase();
                }
            }

            // 2. Logique de Gamification / XP : Lecture depuis la BDD (0 par défaut)
            const xp = data.xp || 0; 
            const level = Math.floor(xp / 100) + 1;
            const percent = Math.min((xp / 1000) * 100, 100);

            const topUserLevel = document.getElementById('top-user-level');
            if(topUserLevel) topUserLevel.textContent = `Niveau ${level}`;
            
            const hubLevel = document.getElementById('hub-level');
            if(hubLevel) hubLevel.textContent = level;
            
            const hubXp = document.getElementById('hub-xp');
            if(hubXp) hubXp.textContent = xp;
            
            setTimeout(() => { 
                const xpFill = document.getElementById('hub-xp-fill');
                if(xpFill) xpFill.style.width = percent + '%'; 
            }, 300);

            // 3. Récupération des Formations Assignées
            const formationsSnap = await getDocs(collection(db, "formations"));
            const formationsList = document.getElementById('assigned-formations-list');
            let assigned = [];
            
            formationsSnap.forEach(docSnap => {
                const f = docSnap.data();
                // N'oublions pas que les admins et les God ont aussi accès à tout pour tester
                if ((f.students && f.students.includes(uid)) || data.role === 'admin' || data.isGod) {
                    assigned.push(f.titre);
                }
            });

            if(formationsList) {
                if (assigned.length > 0) {
                    formationsList.innerHTML = assigned.map(a => `
                        <div style="padding: 1rem; background: #0a0a0c; border: 1px solid #222; border-radius: 6px; color: white; display: flex; align-items: center; gap: 0.8rem; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent-green)'" onmouseout="this.style.borderColor='#222'">
                            <div style="width: 8px; height: 8px; background: var(--accent-green); border-radius: 50%; flex-shrink: 0;"></div>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a}</span>
                        </div>
                    `).join('');
                } else {
                    formationsList.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Aucun module ne vous a été assigné par l\'équipe pédagogique.</p>';
                }
            }
        }
    } catch(e) {
        console.error("Erreur de chargement du Hub Étudiant", e);
    }
}
