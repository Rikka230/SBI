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
            
            // Déterminer le rôle
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
            initCropperEngine();

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
            
            // 1. IDENTITÉ
            const displayName = `${data.prenom || ''} ${data.nom || ''}`.trim() || "Utilisateur Sans Nom";
            const nameEl = document.getElementById('prof-name');
            if(nameEl) {
                if (document.getElementById('prof-badge-zone')) {
                    nameEl.innerHTML = `${displayName} <span id="prof-badge-zone"></span>`;
                } else {
                    nameEl.textContent = displayName;
                }
            }

            if(document.getElementById('prof-bio-display')) document.getElementById('prof-bio-display').textContent = data.bio || 'Élève de la plateforme SBI';
            if(document.getElementById('prof-bio')) document.getElementById('prof-bio').value = data.bio || '';

            // 2. AVATAR UNIFIÉ
            const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;
            const avatarImg = document.getElementById('prof-avatar-img');
            if(avatarImg) avatarImg.src = avatarUrl;
            
            // SYNCHRONISATION TOP BAR (Étudiant)
            const topName = document.getElementById('top-user-name');
            if (topName && isOwner) topName.textContent = displayName;
            const topAvatar = document.getElementById('top-user-avatar');
            if (topAvatar && isOwner) topAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;

            // 3. STATUT EN LIGNE (Admin Uniquement)
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

            // 4. BADGES DE RÔLE (Admin Uniquement)
            const badgeZone = document.getElementById('prof-badge-zone');
            if(badgeZone) {
                if (data.isGod) badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle; display:inline-flex; align-items:center; gap:4px;"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9 8H3l5 5-2 7 6-4 6 4-2-7 5-5h-6z"/></svg> SUPRÊME</span>`;
                else if (data.role === 'admin') badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ADMIN</span>`;
                else if (data.role === 'teacher') badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">PROFESSEUR</span>`;
                else badgeZone.innerHTML = `<span style="background:rgba(0,255,163,0.15); color:#00ffa3; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ÉLÈVE</span>`;
            }

            // 5. GAMIFICATION
            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            
            if(document.getElementById('prof-level')) document.getElementById('prof-level').textContent = level;
            const topLevel = document.getElementById('top-user-level');
            if (topLevel && isOwner) topLevel.textContent = `Niveau ${level}`;
            
            const xpEls = [document.getElementById('prof-xp'), document.getElementById('prof-xp-text')];
            xpEls.forEach(el => {
                if(el) {
                    el.innerHTML = `${xp}`;
                    // Ajout d'une icône d'édition claire pour l'admin
                    if(isAdmin) {
                        el.innerHTML = `${xp} <svg width="14" height="14" style="cursor:pointer; vertical-align:middle; fill:currentColor; opacity:0.6; margin-left:4px;" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
                        el.style.cursor = 'pointer';
                        el.title = "Cliquez pour modifier l'XP";
                        el.onclick = async () => {
                            const newXp = prompt(`Modifier l'XP de cet élève (Actuel : ${xp}) :`, xp);
                            if (newXp !== null && !isNaN(newXp) && newXp.trim() !== "") {
                                await updateDoc(doc(db, "users", uid), { xp: parseInt(newXp) });
                                loadProfileData(uid);
                            }
                        };
                    }
                }
            });

            if(document.getElementById('prof-xp-fill')) document.getElementById('prof-xp-fill').style.width = Math.min((xp / 1000) * 100, 100) + '%';

            if(level >= 2 && document.getElementById('badge-bronze')) document.getElementById('badge-bronze').classList.add('unlocked');
            if(level >= 4 && document.getElementById('badge-silver')) document.getElementById('badge-silver').classList.add('unlocked');
            if(level >= 6 && document.getElementById('badge-gold')) document.getElementById('badge-gold').classList.add('unlocked');
            if(level >= 10 && document.getElementById('badge-diamond')) document.getElementById('badge-diamond').classList.add('unlocked');

            // 6. DONNÉES PRIVÉES ET ACTIVITÉ
            if (isOwner || isAdmin) {
                const emailEl = document.getElementById('prof-email');
                if(emailEl) {
                    emailEl.tagName === 'INPUT' ? emailEl.value = data.email || '' : emailEl.textContent = data.email || '';
                }
                if(document.getElementById('prof-phone')) document.getElementById('prof-phone').value = data.privateData?.phone || '';
                if(document.getElementById('prof-address')) document.getElementById('prof-address').value = data.privateData?.address || '';
                
                if(document.getElementById('prof-time')) {
                    const t = data.totalConnectionTime || 0;
                    document.getElementById('prof-time').textContent = `${Math.floor(t/3600)}h ${Math.floor((t%3600)/60)}m`;
                }
            }

            if(document.getElementById('prof-activity-list')) {
                document.getElementById('prof-activity-list').innerHTML = `<li>Création du compte : ${data.dateCreation ? new Date(data.dateCreation).toLocaleDateString() : 'Date inconnue'}</li>`;
            }

            loadUserFormations(uid);

        } else {
            console.warn("Utilisateur introuvable.");
        }
    } catch(e) { console.error("Erreur", e); }
}

async function loadUserFormations(uid) {
    const list = document.getElementById('prof-formations-list');
    if(!list) return;
    list.innerHTML = 'Recherche...';
    try {
        const snap = await getDocs(collection(db, "formations"));
        let res = [];
        snap.forEach(d => { 
            const f = d.data();
            if(f.students?.includes(uid) || f.profs?.includes(uid)) res.push(f.titre); 
        });
        if (res.length > 0) {
            if (window.location.pathname.includes('admin')) {
                list.innerHTML = res.map(a => `<span style="color: white; display:block; margin-bottom:5px;">📁 ${a}</span>`).join('');
            } else {
                list.innerHTML = res.map(a => `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;"><div style="width:8px; height:8px; background:var(--accent-green); border-radius:50%; flex-shrink:0;"></div>${a}</div>`).join('');
            }
        } else {
            list.innerHTML = 'Aucune formation assignée.';
        }
    } catch(e) { list.innerHTML = 'Erreur.'; }
}

function setupSecurityAndEditMode() {
    const btnToggleEdit = document.getElementById('btn-toggle-edit');
    if (isOwner || isAdmin) {
        document.querySelectorAll('.private-section').forEach(el => el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-flex');
        
        if (btnToggleEdit && isOwner) {
            btnToggleEdit.addEventListener('click', () => {
                isEditMode = !isEditMode;
                document.body.classList.toggle('editing', isEditMode);
                const span = btnToggleEdit.querySelector('span');
                
                if (isEditMode) {
                    if(span) span.textContent = 'Quitter édition';
                    btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
                    btnToggleEdit.style.color = 'var(--accent-red)';
                    btnToggleEdit.style.borderColor = 'transparent';
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'flex');
                    ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).disabled = false; });
                } else {
                    if(span) span.textContent = 'Modifier mon profil';
                    btnToggleEdit.style.background = 'white';
                    btnToggleEdit.style.color = 'var(--text-main)';
                    btnToggleEdit.style.borderColor = 'var(--border-color)';
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'none');
                    ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).disabled = true; });
                }
            });
        }
    } else {
        ['prof-bio', 'prof-phone', 'prof-address'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).disabled = true; });
    }
}

function setupSaveButtons() {
    document.getElementById('btn-save-public')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
        await updateDoc(doc(db, "users", currentProfileId), { bio: document.getElementById('prof-bio').value });
        alert("Profil public mis à jour !");
        loadProfileData(currentProfileId);
    });

    document.getElementById('btn-save-private')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
        await updateDoc(doc(db, "users", currentProfileId), { 
            privateData: { phone: document.getElementById('prof-phone').value, address: document.getElementById('prof-address').value } 
        });
        alert("Données privées sécurisées !");
    });
}

function initCropperEngine() {
    const modal = document.getElementById('crop-modal');
    const input = document.getElementById('pfp-file-input');
    const img = document.getElementById('crop-image');
    const zone = document.getElementById('crop-zone');
    const zoomSlider = document.getElementById('crop-zoom');
    if(!modal || !input || !img || !zone) return;

    let isDragging = false;
    let startX, startY, currentX = 0, currentY = 0;
    let baseWidth = 0, baseHeight = 0, currentZoom = 1;

    // Création d'un bouton d'upload clair (évite le conflit avec le drag)
    if (!document.getElementById('btn-upload-new')) {
        const uploadBtn = document.createElement('button');
        uploadBtn.id = 'btn-upload-new';
        uploadBtn.textContent = "Importer une nouvelle image";
        uploadBtn.style.cssText = "display:block; width:100%; padding:0.8rem; background:#f3f4f6; color:var(--text-main); border:1px solid var(--border-color); border-radius:8px; margin-bottom:1rem; cursor:pointer; font-weight:bold; transition:0.2s;";
        uploadBtn.onmouseover = () => uploadBtn.style.background = "#e5e7eb";
        uploadBtn.onmouseout = () => uploadBtn.style.background = "#f3f4f6";
        uploadBtn.onclick = () => input.click();
        zone.parentNode.insertBefore(uploadBtn, zone);
    }

    // On s'assure que la zone ne déclenche plus l'input au clic
    zone.onclick = null;
    zone.style.cursor = 'grab';

    const openTrigger = document.getElementById('btn-trigger-crop');
    if(openTrigger) {
        openTrigger.addEventListener('click', () => {
            modal.style.display = 'flex';
            if (currentProfileData && currentProfileData.photoURL && !zone.hasImage) {
                img.crossOrigin = "anonymous";
                img.src = currentProfileData.photoURL;
                img.onload = () => setupImage();
            }
        });
    }

    document.getElementById('btn-cancel-crop')?.addEventListener('click', () => modal.style.display = 'none');

    input.onchange = (e) => {
        if(e.target.files.length > 0) {
            modal.style.display = 'flex';
            const reader = new FileReader();
            reader.onload = (re) => {
                img.src = re.target.result;
                img.onload = () => setupImage();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    function setupImage() {
        zone.hasImage = true;
        const ph = document.getElementById('crop-placeholder');
        if(ph) ph.style.display = 'none';
        img.style.display = 'block';
        
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio > 1) { baseHeight = 300; baseWidth = 300 * ratio; } 
        else { baseWidth = 300; baseHeight = 300 / ratio; }
        
        currentZoom = 1;
        if(zoomSlider) zoomSlider.value = 1;
        
        // Centrage initial automatique
        currentX = (300 - baseWidth) / 2;
        currentY = (300 - baseHeight) / 2;
        
        updateImageSize();
        updateImagePosition();
    }

    if(zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            const newZoom = parseFloat(e.target.value);
            const oldWidth = baseWidth * currentZoom;
            const oldHeight = baseHeight * currentZoom;
            const newWidth = baseWidth * newZoom;
            const newHeight = baseHeight * newZoom;
            
            // Ajustement de X et Y pour zoomer depuis le centre et non le bord
            currentX -= (newWidth - oldWidth) / 2;
            currentY -= (newHeight - oldHeight) / 2;
            
            currentZoom = newZoom;
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
        const minX = 300 - (baseWidth * currentZoom);
        const minY = 300 - (baseHeight * currentZoom);
        
        if(currentX > 0) currentX = 0; 
        if(currentY > 0) currentY = 0;
        if(currentX < minX) currentX = minX; 
        if(currentY < minY) currentY = minY;
    }

    zone.addEventListener('mousedown', e => {
        if(!zone.hasImage) return;
        isDragging = true;
        zone.style.cursor = 'grabbing';
        e.preventDefault(); // Bloque le drag'n'drop natif de l'image
        startX = e.clientX - currentX; 
        startY = e.clientY - currentY;
    });
    
    window.addEventListener('mouseup', () => { 
        isDragging = false; 
        zone.style.cursor = 'grab'; 
    });
    
    window.addEventListener('mousemove', e => {
        if(!isDragging || !zone.hasImage) return;
        currentX = e.clientX - startX; 
        currentY = e.clientY - startY;
        checkBounds(); 
        updateImagePosition();
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
            loadProfileData(currentProfileId); 
            modal.style.display = 'none';
        } catch(e) { alert("Erreur réseau."); } 
        finally { btnSave.textContent = "Appliquer"; }
    });
}
