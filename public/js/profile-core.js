/**
 * =======================================================================
 * PROFILE CORE - Moteur Unique (Admin & Étudiant)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentProfileId = null;
let currentProfileData = null;
let loggedInUserId = null;
let isOwner = false;
let isAdmin = false;
let isEditMode = false;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loggedInUserId = user.uid;
            const mySnap = await getDoc(doc(db, "users", loggedInUserId));
            if (mySnap.exists()) {
                const myData = mySnap.data();
                isAdmin = (myData.role === 'admin' || myData.isGod === true);
            }

            currentProfileId = targetId ? targetId : loggedInUserId;
            isOwner = (currentProfileId === loggedInUserId);
            
            await loadProfileData(currentProfileId);
            setupSecurityAndEditMode();
            setupSaveButtons();
            initCropperEngine(); // Initialisation unique du moteur photo
        } else {
            window.location.replace('/login.html');
        }
    });
});

async function loadProfileData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            currentProfileData = snap.data();
            const data = currentProfileData;
            
            // 1. IDENTITÉ
            const displayName = `${data.prenom || ''} ${data.nom || ''}`.trim() || "Utilisateur Inconnu";
            const nameEl = document.getElementById('prof-name');
            if(nameEl) nameEl.innerHTML = nameEl.id === 'prof-name' && isAdmin ? `${displayName} <span id=\"prof-badge-zone\"></span>` : displayName;
            
            if(document.getElementById('prof-bio')) document.getElementById('prof-bio').value = data.bio || '';
            if(document.getElementById('prof-bio-display')) document.getElementById('prof-bio-display').textContent = data.bio || 'Élève SBI';

            // 2. AVATAR
            const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;
            if(document.getElementById('prof-avatar-img')) document.getElementById('prof-avatar-img').src = avatarUrl;
            if(document.getElementById('prof-avatar')) {
                const badge = document.getElementById('prof-avatar').querySelector('.edit-avatar-badge');
                document.getElementById('prof-avatar').innerHTML = `<img src=\"${avatarUrl}\" style=\"width:100%; height:100%; object-fit:cover;\">`;
                if(badge) document.getElementById('prof-avatar').appendChild(badge);
            }

            // 3. XP & NIVEAU
            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            if(document.getElementById('prof-level')) document.getElementById('prof-level').textContent = level;
            
            const xpTarget = document.getElementById('prof-xp') || document.getElementById('prof-xp-text');
            if(xpTarget) {
                xpTarget.textContent = xp;
                if(isAdmin) {
                    xpTarget.style.cursor = 'pointer';
                    xpTarget.classList.add('admin-xp-editable');
                    xpTarget.onclick = async () => {
                        const newXp = prompt(`Modifier l'XP de ${displayName} :`, xp);
                        if (newXp !== null && !isNaN(newXp)) {
                            await updateDoc(doc(db, "users", uid), { xp: parseInt(newXp) });
                            loadProfileData(uid);
                        }
                    };
                }
            }
            if(document.getElementById('prof-xp-fill')) document.getElementById('prof-xp-fill').style.width = Math.min((xp / 1000) * 100, 100) + '%';

            // 4. DONNÉES PRIVÉES (Si autorisé)
            if (isOwner || isAdmin) {
                if(document.getElementById('prof-email')) {
                    const emailEl = document.getElementById('prof-email');
                    emailEl.tagName === 'INPUT' ? emailEl.value = data.email || '' : emailEl.textContent = data.email || '';
                }
                if(document.getElementById('prof-phone')) document.getElementById('prof-phone').value = data.privateData?.phone || '';
                if(document.getElementById('prof-address')) document.getElementById('prof-address').value = data.privateData?.address || '';
                
                if(document.getElementById('prof-time')) {
                    const t = data.totalConnectionTime || 0;
                    document.getElementById('prof-time').textContent = `${Math.floor(t/3600)}h ${Math.floor((t%3600)/60)}m`;
                }
            }
            loadUserFormations(uid);
        }
    } catch(e) { console.error(e); }
}

async function loadUserFormations(uid) {
    const list = document.getElementById('prof-formations-list');
    if(!list) return;
    try {
        const snap = await getDocs(collection(db, "formations"));
        let res = [];
        snap.forEach(d => { if(d.data().students?.includes(uid) || d.data().profs?.includes(uid)) res.push(d.data().titre); });
        list.innerHTML = res.length > 0 ? res.map(t => `<div class=\"formation-item\">📁 ${t}</div>`).join('') : 'Aucune formation.';
    } catch(e) { list.innerHTML = 'Erreur chargement.'; }
}

function setupSecurityAndEditMode() {
    const btnEdit = document.getElementById('btn-toggle-edit');
    if (btnEdit && isOwner) {
        btnEdit.addEventListener('click', () => {
            isEditMode = !isEditMode;
            document.body.classList.toggle('editing', isEditMode);
            btnEdit.innerHTML = isEditMode ? '❌ Quitter édition' : '✏️ Modifier mon profil';
            ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => {
                if(document.getElementById(id)) document.getElementById(id).disabled = !isEditMode;
            });
        });
    }
}

function setupSaveButtons() {
    ['public', 'private'].forEach(type => {
        document.getElementById(`btn-save-${type}`)?.addEventListener('click', async () => {
            const updates = type === 'public' ? { bio: document.getElementById('prof-bio').value } 
                : { privateData: { phone: document.getElementById('prof-phone').value, address: document.getElementById('prof-address').value } };
            await updateDoc(doc(db, "users", currentProfileId), updates);
            alert("Sauvegardé !");
            loadProfileData(currentProfileId);
        });
    });
}

function initCropperEngine() {
    const modal = document.getElementById('crop-modal');
    const input = document.getElementById('pfp-file-input');
    if(!modal || !input) return;

    const openTrigger = document.getElementById('btn-trigger-crop') || document.querySelector('.edit-avatar-badge');
    openTrigger?.addEventListener('click', () => {
        modal.style.display = 'flex';
        if(currentProfileData?.photoURL) {
            const img = document.getElementById('crop-image');
            img.src = currentProfileData.photoURL;
            img.style.display = 'block';
            document.getElementById('crop-placeholder').style.display = 'none';
        }
    });

    document.getElementById('btn-cancel-crop')?.addEventListener('click', () => modal.style.display = 'none');
    
    input.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (re) => {
            const img = document.getElementById('crop-image');
            img.src = re.target.result;
            img.style.display = 'block';
            document.getElementById('crop-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(e.target.files[0]);
    };

    document.getElementById('btn-save-crop')?.addEventListener('click', async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const img = document.getElementById('crop-image');
        canvas.getContext('2d').drawImage(img, 0, 0, 200, 200);
        const webp = canvas.toDataURL('image/webp', 0.8);
        await updateDoc(doc(db, "users", currentProfileId), { photoURL: webp });
        modal.style.display = 'none';
        loadProfileData(currentProfileId);
    });
}
