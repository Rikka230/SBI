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
            
            // 1. Déterminer si l'utilisateur actuel est Admin ou God
            const mySnap = await getDoc(doc(db, "users", loggedInUserId));
            if (mySnap.exists()) {
                const myData = mySnap.data();
                isAdmin = (myData.role === 'admin' || myData.isGod === true);
            }

            // 2. Déterminer quel profil on regarde
            currentProfileId = targetId ? targetId : loggedInUserId;
            isOwner = (currentProfileId === loggedInUserId);
            
            await loadProfileData(currentProfileId);
            setupSecurityAndEditMode();
            setupSaveButtons();

            // Boutons spécifiques Admin
            const myProfileBtn = document.getElementById('btn-my-profile');
            if(myProfileBtn) myProfileBtn.addEventListener('click', () => window.location.href = `admin-profile.html?id=${loggedInUserId}`);

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
            
            // --- 1. IDENTITÉ ET BIO ---
            const name = (data.prenom || '') + ' ' + (data.nom || '');
            const displayName = name.trim() || "Utilisateur Sans Nom";
            
            const nameEl = document.getElementById('prof-name');
            if(nameEl) {
                // Si on est sur l'admin, on garde la zone de badge à côté du nom
                if(document.getElementById('prof-badge-zone')) {
                    nameEl.innerHTML = `${displayName} <span id="prof-badge-zone"></span>`;
                } else {
                    nameEl.textContent = displayName;
                }
            }
            
            const bioDisplay = document.getElementById('prof-bio-display');
            const bioInput = document.getElementById('prof-bio');
            if (data.bio) {
                if(bioDisplay) bioDisplay.textContent = data.bio;
                if(bioInput) bioInput.value = data.bio;
            }

            // --- 2. AVATAR (Gère l'Admin <img> et l'Étudiant <div>) ---
            const avatarImgAdmin = document.getElementById('prof-avatar-img');
            const avatarContainerStudent = document.getElementById('prof-avatar');
            const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;
            const finalAvatarUrl = data.photoURL || defaultAvatarUrl;

            if(avatarImgAdmin) avatarImgAdmin.src = finalAvatarUrl;
            
            if(avatarContainerStudent) {
                const badge = avatarContainerStudent.querySelector('.edit-avatar-badge');
                avatarContainerStudent.innerHTML = `<img src="${finalAvatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                if(badge) avatarContainerStudent.appendChild(badge); // On remet le bouton d'édition par dessus
            }

            // --- 3. STATUT EN LIGNE (Admin Uniquement) ---
            const dot = document.getElementById('prof-online-dot');
            const statusText = document.getElementById('prof-status-text');
            if(dot && statusText) {
                if (data.statut === 'suspendu') {
                    dot.className = 'online-dot offline'; statusText.textContent = "Compte Suspendu";
                } else if (data.isOnline) {
                    dot.className = 'online-dot'; statusText.textContent = "En Ligne";
                } else {
                    dot.className = 'online-dot offline'; statusText.textContent = "Hors Ligne";
                }
            }

            // --- 4. BADGES DE RÔLE (Admin Uniquement) ---
            const badgeZone = document.getElementById('prof-badge-zone');
            if(badgeZone) {
                if (data.isGod) {
                    badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle; display:inline-flex; align-items:center; gap:4px;"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9 8H3l5 5-2 7 6-4 6 4-2-7 5-5h-6z"/></svg> SUPRÊME</span>`;
                } else if (data.role === 'admin') {
                    badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ADMIN</span>`;
                } else if (data.role === 'teacher') {
                    badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">PROFESSEUR</span>`;
                } else {
                    badgeZone.innerHTML = `<span style="background:rgba(0,255,163,0.15); color:#00ffa3; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ÉLÈVE</span>`;
                }
            }

            // --- 5. GAMIFICATION (Niveau, XP, Badges) ---
            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            const percent = Math.min((xp / 1000) * 100, 100);

            const lvlEl = document.getElementById('prof-level');
            const xpEl = document.getElementById('prof-xp');
            const xpFill = document.getElementById('prof-xp-fill');
            const xpTextAdmin = document.getElementById('prof-xp-text'); // L'admin a un span différent
            
            if(lvlEl) lvlEl.textContent = level;
            if(xpEl) xpEl.textContent = xp;
            if(xpTextAdmin) xpTextAdmin.textContent = xp;
            
            if(xpFill) setTimeout(() => { xpFill.style.width = percent + '%'; }, 100);

            // L'ADMIN PEUT MODIFIER L'XP EN CLIQUANT !
            const clickableXpTarget = xpEl || xpTextAdmin;
            if (clickableXpTarget && isAdmin) {
                clickableXpTarget.style.cursor = 'pointer';
                clickableXpTarget.style.textDecoration = 'underline';
                clickableXpTarget.title = "Cliquez pour modifier l'XP";
                clickableXpTarget.onclick = async () => {
                    const newXp = prompt(`Modifier l'XP de cet élève (Actuel : ${xp}) :`, xp);
                    if (newXp !== null && !isNaN(newXp) && newXp.trim() !== "") {
                        await updateDoc(doc(db, "users", uid), { xp: parseInt(newXp) });
                        loadProfileData(uid); // Recharger les données
                    }
                };
            }

            // Déblocage des badges
            if(level >= 2 && document.getElementById('badge-bronze')) document.getElementById('badge-bronze').classList.add('unlocked');
            if(level >= 4 && document.getElementById('badge-silver')) document.getElementById('badge-silver').classList.add('unlocked');
            if(level >= 6 && document.getElementById('badge-gold')) document.getElementById('badge-gold').classList.add('unlocked');
            if(level >= 10 && document.getElementById('badge-diamond')) document.getElementById('badge-diamond').classList.add('unlocked');

            // --- 6. DONNÉES PRIVÉES (Sécurisées) ---
            if (isOwner || isAdmin) {
                const emailEl = document.getElementById('prof-email');
                const phoneEl = document.getElementById('prof-phone');
                const addressEl = document.getElementById('prof-address');
                
                // Admin utilise un span pour l'email, Etudiant utilise un input disabled
                if(emailEl) {
                    if (emailEl.tagName === 'INPUT') emailEl.value = data.email || '';
                    else emailEl.textContent = data.email || 'Non renseigné';
                }
                
                if(data.privateData) {
                    if(phoneEl) phoneEl.value = data.privateData.phone || '';
                    if(addressEl) addressEl.value = data.privateData.address || '';
                }

                // Temps de connexion
                const timeEl = document.getElementById('prof-time');
                if (timeEl) {
                    if (data.totalConnectionTime) {
                        const hours = Math.floor(data.totalConnectionTime / 3600);
                        const mins = Math.floor((data.totalConnectionTime % 3600) / 60);
                        timeEl.textContent = `${hours}h ${mins}m`;
                    } else {
                        timeEl.textContent = '0h 0m';
                    }
                }
            }

            // --- 7. ACTIVITÉ & FORMATIONS ---
            const activityList = document.getElementById('prof-activity-list');
            if(activityList) {
                activityList.innerHTML = `<li style="margin-bottom: 0.5rem;">Création du compte : ${data.dateCreation ? new Date(data.dateCreation).toLocaleDateString() : 'Date inconnue'}</li>`;
            }

            loadUserFormations(uid);

            // --- 8. INITIALISATION DU CROPPER ---
            initCropperEngine(data.photoURL);
            
        } else {
            alert("Utilisateur introuvable.");
        }
    } catch(e) { console.error("Erreur de chargement", e); }
}

async function loadUserFormations(uid) {
    const list = document.getElementById('prof-formations-list');
    if(!list) return;
    
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
            // S'adapte au design sombre (Admin) ou clair (Étudiant)
            if (window.location.pathname.includes('admin')) {
                list.innerHTML = assigned.map(a => `<span style="color: white;">📁 ${a}</span>`).join('');
            } else {
                list.innerHTML = assigned.map(a => `<div style="display:flex; align-items:center; gap:8px;"><div style="width:8px; height:8px; background:var(--accent-green); border-radius:50%; flex-shrink:0;"></div>${a}</div>`).join('');
            }
        } else {
            list.innerHTML = 'Aucune formation assignée pour le moment.';
        }
    } catch(e) {
        list.innerHTML = 'Erreur de lecture des formations.';
    }
}

function setupSecurityAndEditMode() {
    // Mode Édition (Spécifique au Profil Étudiant)
    const btnToggleEdit = document.getElementById('btn-toggle-edit');
    const btnSpan = btnToggleEdit ? btnToggleEdit.querySelector('span') : null;
    const privateSections = document.querySelectorAll('.private-section');

    if (isOwner || isAdmin) {
        // Afficher les sections cachées
        privateSections.forEach(el => {
            el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-block';
        });

        if (btnToggleEdit && isOwner) {
            btnToggleEdit.addEventListener('click', () => {
                isEditMode = !isEditMode;
                if (isEditMode) {
                    if(btnSpan) btnSpan.textContent = 'Quitter édition';
                    btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
                    btnToggleEdit.style.color = 'var(--accent-red)';
                    btnToggleEdit.style.borderColor = 'transparent';
                    document.body.classList.add('editing');
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'block');
                    
                    document.getElementById('prof-bio').disabled = false;
                    document.getElementById('prof-phone').disabled = false;
                    document.getElementById('prof-address').disabled = false;
                } else {
                    if(btnSpan) btnSpan.textContent = 'Modifier mon profil';
                    btnToggleEdit.style.background = 'white';
                    btnToggleEdit.style.color = 'var(--text-main)';
                    btnToggleEdit.style.borderColor = 'var(--border-color)';
                    document.body.classList.remove('editing');
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'none');
                    
                    document.getElementById('prof-bio').disabled = true;
                    document.getElementById('prof-phone').disabled = true;
                    document.getElementById('prof-address').disabled = true;
                }
            });
        }
    } else {
        // Bloquer l'édition pour les visiteurs
        const bioInput = document.getElementById('prof-bio');
        if(bioInput) bioInput.disabled = true;
    }
}

function setupSaveButtons() {
    document.getElementById('btn-save-public')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
        const bio = document.getElementById('prof-bio').value;
        try {
            await updateDoc(doc(db, "users", currentProfileId), { bio: bio });
            const bioDisplay = document.getElementById('prof-bio-display');
            if(bioDisplay) bioDisplay.textContent = bio || 'Élève de la plateforme SBI';
            alert("✅ Profil public mis à jour !");
        } catch(e) { alert("❌ Erreur de sauvegarde."); }
    });

    document.getElementById('btn-save-private')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
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

function initCropperEngine(currentPhotoURL) {
    const modal = document.getElementById('crop-modal');
    if (!modal) return;
    
    const zone = document.getElementById('crop-zone');
    const input = document.getElementById('pfp-file-input');
    const img = document.getElementById('crop-image');
    const placeholder = document.getElementById('crop-placeholder');
    const zoomSlider = document.getElementById('crop-zoom');

    let isDragging = false;
    let startX, startY, currentX = 0, currentY = 0;
    let baseWidth = 0, baseHeight = 0, currentZoom = 1;

    // Déclencheur Admin (Bouton avec l'icône appareil photo)
    const btnAdminCrop = document.getElementById('btn-trigger-crop');
    if (btnAdminCrop) {
        btnAdminCrop.onclick = () => { openCropper(); };
    }

    // Déclencheur Étudiant (Clic caché qui active l'input file)
    input.addEventListener('change', e => {
        if(e.target.files.length > 0) {
            modal.style.display = 'flex';
            handleFile(e.target.files[0]);
        }
    });

    function openCropper() {
        modal.style.display = 'flex';
        if (currentPhotoURL && !zone.hasImage) {
            img.crossOrigin = "anonymous";
            img.src = currentPhotoURL;
            img.onload = () => {
                zone.hasImage = true;
                if(placeholder) placeholder.style.display = 'none';
                img.style.display = 'block';
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio > 1) { baseHeight = 300; baseWidth = 300 * ratio; } 
                else { baseWidth = 300; baseHeight = 300 / ratio; }
                currentZoom = 1; if(zoomSlider) zoomSlider.value = 1;
                updateImageSize(); currentX = 0; currentY = 0; updateImagePosition();
            };
        }
    }

    document.getElementById('btn-cancel-crop')?.addEventListener('click', () => modal.style.display = 'none');

    zone.addEventListener('dragover', e => e.preventDefault());
    zone.addEventListener('drop', e => {
        e.preventDefault();
        if(e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) return alert("Format invalide.");
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            img.onload = () => {
                zone.hasImage = true;
                if(placeholder) placeholder.style.display = 'none';
                img.style.display = 'block';
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio > 1) { baseHeight = 300; baseWidth = 300 * ratio; } 
                else { baseWidth = 300; baseHeight = 300 / ratio; }
                currentZoom = 1; if(zoomSlider) zoomSlider.value = 1;
                updateImageSize(); currentX = 0; currentY = 0; updateImagePosition();
            }
        };
        reader.readAsDataURL(file);
    }

    if(zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            currentZoom = parseFloat(e.target.value);
            updateImageSize(); checkBounds(); updateImagePosition();
        });
    }

    function updateImageSize() { img.style.width = (baseWidth * currentZoom) + 'px'; img.style.height = (baseHeight * currentZoom) + 'px'; }
    function updateImagePosition() { img.style.transform = `translate(${currentX}px, ${currentY}px)`; }
    function checkBounds() {
        const boundsX = zone.clientWidth - (baseWidth * currentZoom);
        const boundsY = zone.clientHeight - (baseHeight * currentZoom);
        if(currentX > 0) currentX = 0; if(currentY > 0) currentY = 0;
        if(currentX < boundsX) currentX = boundsX; if(currentY < boundsY) currentY = boundsY;
    }

    zone.addEventListener('mousedown', e => {
        if(!zone.hasImage) return;
        isDragging = true;
        startX = e.clientX - currentX; startY = e.clientY - currentY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
        if(!isDragging || !zone.hasImage) return;
        currentX = e.clientX - startX; currentY = e.clientY - startY;
        checkBounds(); updateImagePosition();
    });

    document.getElementById('btn-save-crop')?.addEventListener('click', async () => {
        if(!zone.hasImage || !currentProfileId) return;
        const btnSave = document.getElementById('btn-save-crop');
        btnSave.textContent = "Compression...";
        
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext('2d');
        const ratioZoneCanvas = 200 / 300; 
        ctx.drawImage(img, currentX * ratioZoneCanvas, currentY * ratioZoneCanvas, baseWidth * currentZoom * ratioZoneCanvas, baseHeight * currentZoom * ratioZoneCanvas);
        const webpData = canvas.toDataURL('image/webp', 0.8);

        try {
            await updateDoc(doc(db, "users", currentProfileId), { photoURL: webpData });
            loadProfileData(currentProfileId); // Recharge tout !
            
            // Maj Avatar Top Bar si c'est nous-même
            if(isOwner && document.getElementById('top-user-avatar')) {
                document.getElementById('top-user-avatar').innerHTML = `<img src="${webpData}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            modal.style.display = 'none';
        } catch(e) { alert("Erreur réseau."); } 
        finally { btnSave.textContent = "Appliquer"; }
    });
}
