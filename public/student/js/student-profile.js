/**
 * =======================================================================
 * STUDENT PROFILE - Logique d'affichage et de sécurité du profil
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentProfileId = null;
let isOwner = false;

document.addEventListener('DOMContentLoaded', () => {
    
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id'); // Si on visite le profil d'un autre élève

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentProfileId = targetId ? targetId : user.uid;
            isOwner = (currentProfileId === user.uid);
            
            loadProfileData(currentProfileId);
            
            // Si c'est notre profil, on affiche les sections privées et les boutons d'édition
            if (isOwner) {
                document.querySelectorAll('.private-section').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.edit-buttons').forEach(el => el.style.display = 'block');
            } else {
                // Si on visite quelqu'un d'autre, on désactive les champs publics
                document.getElementById('prof-bio').disabled = true;
                // On enlève l'événement de clic sur l'avatar
                document.getElementById('prof-avatar').style.cursor = 'default';
                document.getElementById('prof-avatar').onclick = null;
            }

        } else {
            window.location.replace('/login.html');
        }
    });

    // SAUVEGARDE PUBLIQUE
    const btnSavePublic = document.getElementById('btn-save-public');
    if (btnSavePublic) {
        btnSavePublic.addEventListener('click', async () => {
            if(!isOwner || !currentProfileId) return;
            const bio = document.getElementById('prof-bio').value;
            try {
                await updateDoc(doc(db, "users", currentProfileId), { bio: bio });
                document.getElementById('prof-bio-display').textContent = bio || 'Élève de la plateforme SBI';
                alert("✅ Profil public mis à jour !");
            } catch(e) { alert("❌ Erreur de sauvegarde."); }
        });
    }

    // SAUVEGARDE PRIVÉE
    const btnSavePrivate = document.getElementById('btn-save-private');
    if (btnSavePrivate) {
        btnSavePrivate.addEventListener('click', async () => {
            if(!isOwner || !currentProfileId) return;
            const phone = document.getElementById('prof-phone').value;
            const address = document.getElementById('prof-address').value;
            try {
                await updateDoc(doc(db, "users", currentProfileId), { 
                    privateData: { phone: phone, address: address } 
                });
                alert("✅ Données privées sécurisées !");
            } catch(e) { alert("❌ Erreur de sauvegarde."); }
        });
    }
});

async function loadProfileData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            
            // IDENTITÉ
            const name = (data.prenom || '') + ' ' + (data.nom || '');
            document.getElementById('prof-name').textContent = name.trim() || "Étudiant Inconnu";
            
            const bioDisplay = document.getElementById('prof-bio-display');
            const bioInput = document.getElementById('prof-bio');
            if (data.bio) {
                bioDisplay.textContent = data.bio;
                bioInput.value = data.bio;
            }

            // AVATAR
            const avatarContainer = document.getElementById('prof-avatar');
            if (data.photoURL) {
                avatarContainer.innerHTML = `<img src="${data.photoURL}">`;
            } else {
                avatarContainer.innerHTML = `<span>${(data.prenom ? data.prenom.charAt(0) : 'U').toUpperCase()}</span>`;
            }

            // NIVEAU & XP
            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            document.getElementById('prof-level').textContent = level;
            document.getElementById('prof-xp').textContent = xp;

            // DONNÉES PRIVÉES (Remplies uniquement si on a l'autorisation de les voir)
            if (isOwner || data.role === 'admin' || data.isGod) {
                document.getElementById('prof-email').value = data.email || '';
                if(data.privateData) {
                    document.getElementById('prof-phone').value = data.privateData.phone || '';
                    document.getElementById('prof-address').value = data.privateData.address || '';
                }
            }
        }
    } catch(e) {
        console.error("Erreur de chargement", e);
    }
}
