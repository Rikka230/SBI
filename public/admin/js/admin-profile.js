/**
 * =======================================================================
 * ADMIN PROFILE - Gestion Complète, Gamification et Moteur PFP
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { logoutUser } from '/js/auth.js';

let currentProfileId = null;
let currentProfileData = null;
let currentUid = null;

document.addEventListener('DOMContentLoaded', () => {
    
    // Assignation des boutons de la barre latérale qui n'étaient pas gérés
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', logoutUser);
    
    const cacheBtn = document.getElementById('btn-clear-cache');
    if(cacheBtn) cacheBtn.addEventListener('click', () => {
        if(confirm('Vider le cache local ? Cela rechargera la page.')) {
            localStorage.clear(); sessionStorage.clear(); window.location.reload(true);
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('id');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;

            // Rendre le bouton "Mon Profil" fonctionnel sur cette page
            const myProfileBtn = document.getElementById('btn-my-profile');
            if(myProfileBtn) {
                myProfileBtn.addEventListener('click', () => {
                    window.location.href = `admin-profile.html?id=${currentUid}`;
                });
            }

            if (profileId) {
                currentProfileId = profileId;
                loadFullProfile(profileId);
            } else {
                window.location.replace('index.html?tab=view-users');
            }
        } else {
            window.location.replace('/login.html');
        }
    });

    document.querySelectorAll('.p-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.p-tab-content').forEach(c => c.classList.remove('active'));
            
            e.currentTarget.classList.add('active');
            document.getElementById(e.currentTarget.getAttribute('data-ptarget')).classList.add('active');
        });
    });

    document.getElementById('btn-save-public').addEventListener('click', async () => {
        if(!currentProfileId) return;
        const bio = document.getElementById('prof-bio').value;
        await updateDoc(doc(db, "users", currentProfileId), { bio: bio });
        alert("Profil public mis à jour !");
    });

    document.getElementById('btn-save-private').addEventListener('click', async () => {
        if(!currentProfileId) return;
        const phone = document.getElementById('prof-phone').value;
        const address = document.getElementById('prof-address').value;
        await updateDoc(doc(db, "users", currentProfileId), { 
            privateData: { phone: phone, address: address } 
        });
        alert("Données privées sécurisées !");
    });

    initCropperEngine();
});

async function loadFullProfile(userId) {
    try {
        const snap = await getDoc(doc(db, "users", userId));
        if (snap.exists()) {
            currentProfileData = snap.data();
            renderProfile(currentProfileData);
        } else {
            alert("Utilisateur introuvable.");
            window.location.href = 'index.html?tab=view-users';
        }
    } catch(err) {
        console.error(err);
        alert("Impossible de charger le profil complet.");
    }
}

function renderProfile(user) {
    const displayName = (user.prenom || user.nom) ? `${user.prenom || ''} ${user.nom || ''}`.trim() : "Utilisateur Sans Nom";
    document.getElementById('prof-name').innerHTML = `${displayName} <span id="prof-badge-zone"></span>`;
    
    document.getElementById('prof-avatar-img').src = user.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;

    const dot = document.getElementById('prof-online-dot');
    const statusText = document.getElementById('prof-status-text');
    if (user.statut === 'suspendu') {
        dot.className = 'online-dot offline';
        statusText.textContent = "Compte Suspendu";
    } else {
        dot.className = 'online-dot';
        statusText.textContent = "Actif";
    }

    const badgeZone = document.getElementById('prof-badge-zone');
    document.getElementById('prof-gamification').style.display = 'none';

    if (user.isGod) {
        badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle; display:inline-flex; align-items:center; gap:4px;"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9 8H3l5 5-2 7 6-4 6 4-2-7 5-5h-6z"/></svg> SUPRÊME</span>`;
    } else if (user.role === 'admin') {
        badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ADMIN</span>`;
    } else if (user.role === 'teacher') {
        badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">PROFESSEUR</span>`;
    } else {
        badgeZone.innerHTML = `<span style="background:rgba(0,255,163,0.15); color:#00ffa3; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ÉLÈVE</span>`;
        renderGamification(user);
    }

    document.getElementById('prof-bio').value = user.bio || '';
    document.getElementById('prof-email').textContent = user.email || 'Non renseigné';
    document.getElementById('prof-time').textContent = user.totalConnectionTime ? `${Math.floor(user.totalConnectionTime / 60)} Heures` : '0 Heure';
    
    if(user.privateData) {
        document.getElementById('prof-phone').value = user.privateData.phone || '';
        document.getElementById('prof-address').value = user.privateData.address || '';
    } else {
        document.getElementById('prof-phone').value = '';
        document.getElementById('prof-address').value = '';
    }

    document.getElementById('prof-activity-list').innerHTML = `
        <li style="margin-bottom: 0.5rem;">Création du compte : ${user.dateCreation ? new Date(user.dateCreation).toLocaleDateString() : 'Date inconnue'}</li>
    `;
    
    loadUserFormations(currentProfileId);
}

async function loadUserFormations(uid) {
    const list = document.getElementById('prof-formations-list');
    list.innerHTML = 'Recherche des modules...';
    try {
        const snap = await getDocs(collection(db, "formations"));
        let assigned = [];
        snap.forEach(d => {
            const f = d.data();
            if ((f.profs && f.profs.includes(uid)) || (f.students && f.students.includes(uid))) {
                assigned.push(f.titre);
            }
        });
        
        if (assigned.length > 0) {
            list.innerHTML = assigned.map(a => `<span style="color: white;">📁 ${a}</span>`).join('');
        } else {
            list.innerHTML = 'Aucune formation assignée pour le moment.';
        }
    } catch(e) {
        list.innerHTML = 'Erreur de lecture des formations.';
    }
}

function renderGamification(user) {
    document.getElementById('prof-gamification').style.display = 'block';
    
    const xp = user.xp || 350; 
    const maxXp = 1000;
    const level = Math.floor(xp / 100) + 1;
    const percent = Math.min((xp / maxXp) * 100, 100);

    document.getElementById('prof-level').textContent = level;
    document.getElementById('prof-xp-text').textContent = xp;
    
    setTimeout(() => { document.getElementById('prof-xp-fill').style.width = percent + '%'; }, 100);

    if(level >= 2) document.getElementById('badge-bronze').classList.add('unlocked');
    if(level >= 4) document.getElementById('badge-silver').classList.add('unlocked');
    if(level >= 6) document.getElementById('badge-gold').classList.add('unlocked');
    if(level >= 10) document.getElementById('badge-diamond').classList.add('unlocked');
}

function initCropperEngine() {
    const modal = document.getElementById('crop-modal');
    const btnOpen = document.getElementById('btn-trigger-crop');
    const btnCancel = document.getElementById('btn-cancel-crop');
    const btnSave = document.getElementById('btn-save-crop');
    const zoomSlider = document.getElementById('crop-zoom');
    
    const zone = document.getElementById('crop-zone');
    const input = document.getElementById('pfp-file-input');
    const img = document.getElementById('crop-image');
    const placeholder = document.getElementById('crop-placeholder');

    let isDragging = false;
    let startX, startY, currentX = 0, currentY = 0;
    
    let baseWidth = 0;
    let baseHeight = 0;
    let currentZoom = 1;

    btnOpen.addEventListener('click', () => { modal.style.display = 'flex'; });
    btnCancel.addEventListener('click', () => { modal.style.display = 'none'; });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent-blue)'; });
    zone.addEventListener('dragleave', e => { e.preventDefault(); zone.style.borderColor = 'var(--text-muted)'; });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = 'var(--text-muted)';
        if(e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => {
        if(e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) return alert("Format invalide.");
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            img.onload = () => {
                zone.hasImage = true;
                placeholder.style.display = 'none';
                img.style.display = 'block';
                
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio > 1) { 
                    baseHeight = 300;
                    baseWidth = 300 * ratio;
                } else { 
                    baseWidth = 300;
                    baseHeight = 300 / ratio;
                }
                
                currentZoom = 1;
                if(zoomSlider) zoomSlider.value = 1;
                
                updateImageSize();
                currentX = 0; currentY = 0;
                updateImagePosition();
            }
        };
        reader.readAsDataURL(file);
    }

    if(zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            currentZoom = parseFloat(e.target.value);
            updateImageSize();
            checkBounds(); 
            updateImagePosition();
        });
    }

    function updateImageSize() {
        img.style.width = (baseWidth * currentZoom) + 'px';
        img.style.height = (baseHeight * currentZoom) + 'px';
    }

    function updateImagePosition() {
        img.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    function checkBounds() {
        const boundsX = zone.clientWidth - (baseWidth * currentZoom);
        const boundsY = zone.clientHeight - (baseHeight * currentZoom);

        if(currentX > 0) currentX = 0;
        if(currentY > 0) currentY = 0;
        if(currentX < boundsX) currentX = boundsX;
        if(currentY < boundsY) currentY = boundsY;
    }

    zone.addEventListener('mousedown', e => {
        if(!zone.hasImage) return;
        isDragging = true;
        startX = e.clientX - currentX;
        startY = e.clientY - currentY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
        if(!isDragging || !zone.hasImage) return;
        currentX = e.clientX - startX;
        currentY = e.clientY - startY;

        checkBounds();
        updateImagePosition();
    });

    btnSave.addEventListener('click', async () => {
        if(!zone.hasImage || !currentProfileId) return;
        
        btnSave.textContent = "Compression...";
        
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext('2d');

        // On calcule la taille réelle affichée avec le zoom, ramenée sur du 200px
        const ratioZoneCanvas = 200 / 300; 
        const renderW = baseWidth * currentZoom * ratioZoneCanvas;
        const renderH = baseHeight * currentZoom * ratioZoneCanvas;
        const renderX = currentX * ratioZoneCanvas;
        const renderY = currentY * ratioZoneCanvas;

        ctx.drawImage(img, renderX, renderY, renderW, renderH);

        const webpData = canvas.toDataURL('image/webp', 0.8);

        try {
            await updateDoc(doc(db, "users", currentProfileId), { photoURL: webpData });
            document.getElementById('prof-avatar-img').src = webpData;
            modal.style.display = 'none';
        } catch(e) {
            alert("Erreur réseau.");
        } finally {
            btnSave.textContent = "Appliquer";
        }
    });
}
