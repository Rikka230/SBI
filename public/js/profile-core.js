/**
 * =======================================================================
 * PROFILE CORE - Moteur Unique (Admin & Student)
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentProfileId = null;
let currentProfileData = null;
let loggedInUserId = null;
let loggedInUserRole = null;
let isOwner = false;
let isAdmin = false;
let isEditMode = false;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loggedInUserId = user.uid;
            
            // Vérifier qui est connecté (pour savoir s'il est Admin/God)
            const mySnap = await getDoc(doc(db, "users", loggedInUserId));
            if (mySnap.exists()) {
                const myData = mySnap.data();
                loggedInUserRole = myData.role;
                isAdmin = (myData.role === 'admin' || myData.isGod === true);
            }

            currentProfileId = targetId ? targetId : loggedInUserId;
            isOwner = (currentProfileId === loggedInUserId);
            
            await loadProfileData(currentProfileId);
            setupSecurityAndEditMode();
            setupSaveButtons();

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
            
            // 1. IDENTITÉ & BIO
            const name = (data.prenom || '') + ' ' + (data.nom || '');
            const nameEl = document.getElementById('prof-name');
            if(nameEl) nameEl.innerHTML = name.trim() || "Utilisateur Inconnu";
            
            const bioDisplay = document.getElementById('prof-bio-display');
            const bioInput = document.getElementById('prof-bio');
            if (data.bio) {
                if(bioDisplay) bioDisplay.textContent = data.bio;
                if(bioInput) bioInput.value = data.bio;
            }

            // 2. AVATAR (Gère les deux HTML : Admin et Student)
            const avatarImgAdmin = document.getElementById('prof-avatar-img');
            const avatarContainerStudent = document.getElementById('prof-avatar');
            
            if (data.photoURL) {
                if(avatarImgAdmin) avatarImgAdmin.src = data.photoURL;
                if(avatarContainerStudent) {
                    // On garde le badge d'édition SVG s'il existe dans le HTML
                    const badge = avatarContainerStudent.querySelector('.edit-avatar-badge');
                    avatarContainerStudent.innerHTML = `<img src="${data.photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
                    if(badge) avatarContainerStudent.appendChild(badge);
                }
            } else {
                const initial = data.prenom ? data.prenom.charAt(0).toUpperCase() : 'U';
                if(avatarImgAdmin) avatarImgAdmin.src = `https://ui-avatars.com/api/?name=${initial}&background=111&color=fff&size=150`;
                if(avatarContainerStudent) {
                    const badge = avatarContainerStudent.querySelector('.edit-avatar-badge');
                    avatarContainerStudent.innerHTML = `<span>${initial}</span>`;
                    if(badge) avatarContainerStudent.appendChild(badge);
                }
            }

            // 3. NIVEAU & XP
            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            const lvlEl = document.getElementById('prof-level');
            const xpEl = document.getElementById('prof-xp');
            
            if(lvlEl) lvlEl.textContent = level;
            if(xpEl) {
                xpEl.textContent = xp;
                
                // NOUVEAU : L'admin peut modifier l'XP en cliquant dessus !
                if (isAdmin) {
                    xpEl.style.cursor = 'pointer';
                    xpEl.style.textDecoration = 'underline';
                    xpEl.title = "Modifier l'XP de l'élève";
                    xpEl.onclick = async () => {
                        const newXp = prompt(`Modifier l'XP de ${name.trim()} (Actuel : ${xp}) :`, xp);
                        if (newXp !== null && !isNaN(newXp) && newXp.trim() !== "") {
                            await updateDoc(doc(db, "users", uid), { xp: parseInt(newXp) });
                            loadProfileData(uid); // Recharger
                        }
                    };
                }
            }

            // 4. DONNÉES PRIVÉES (Sécurité)
            if (isOwner || isAdmin) {
                const emailEl = document.getElementById('prof-email');
                const phoneEl = document.getElementById('prof-phone');
                const addressEl = document.getElementById('prof-address');
                
                if(emailEl) emailEl.value = data.email || '';
                if(emailEl && emailEl.tagName === 'SPAN') emailEl.textContent = data.email || ''; // Cas Admin
                
                if(data.privateData) {
                    if(phoneEl) phoneEl.value = data.privateData.phone || '';
                    if(addressEl) addressEl.value = data.privateData.address || '';
                }
            }

            // 5. Initialiser le recadrage avec la photo actuelle
            initCropperEngine(data.photoURL);
        }
    } catch(e) { console.error("Erreur de chargement", e); }
}

function setupSecurityAndEditMode() {
    const btnToggleEdit = document.getElementById('btn-toggle-edit'); // Spécifique au Student
    const privateSections = document.querySelectorAll('.private-section');

    if (isOwner || isAdmin) {
        // Rendre les onglets/boutons privés visibles
        privateSections.forEach(el => {
            el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-block';
        });

        // Si on a un bouton "Activer l'édition" (Design Etudiant)
        if (btnToggleEdit && isOwner) {
            btnToggleEdit.addEventListener('click', () => {
                isEditMode = !isEditMode;
                if (isEditMode) {
                    btnToggleEdit.innerHTML = '❌ Quitter édition';
                    btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
                    btnToggleEdit.style.color = 'var(--accent-red)';
                    document.body.classList.add('editing');
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'block');
                    
                    document.getElementById('prof-bio').disabled = false;
                    document.getElementById('prof-phone').disabled = false;
                    document.getElementById('prof-address').disabled = false;
                } else {
                    btnToggleEdit.innerHTML = '✏️ Modifier mon profil';
                    btnToggleEdit.style.background = 'white';
                    btnToggleEdit.style.color = 'var(--text-main)';
                    document.body.classList.remove('editing');
                    document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'none');
                    
                    document.getElementById('prof-bio').disabled = true;
                    document.getElementById('prof-phone').disabled = true;
                    document.getElementById('prof-address').disabled = true;
                }
            });
        }
    } else {
        // Visiteur simple : tout reste verrouillé
        const bioEl = document.getElementById('prof-bio');
        if(bioEl) bioEl.disabled = true;
    }
}

function setupSaveButtons() {
    document.getElementById('btn-save-public')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
        const bio = document.getElementById('prof-bio').value;
        await updateDoc(doc(db, "users", currentProfileId), { bio: bio });
        alert("✅ Profil public mis à jour !");
        loadProfileData(currentProfileId);
    });

    document.getElementById('btn-save-private')?.addEventListener('click', async () => {
        if(!isOwner && !isAdmin) return;
        const phone = document.getElementById('prof-phone').value;
        const address = document.getElementById('prof-address').value;
        await updateDoc(doc(db, "users", currentProfileId), { 
            privateData: { phone: phone, address: address } 
        });
        alert("✅ Données privées sécurisées !");
    });
}

// MOTEUR DE RECADRAGE (Fonctionne pour Admin et Étudiant)
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

    // Déclencheur Admin (Bouton caméra)
    const btnAdminCrop = document.getElementById('btn-trigger-crop');
    if (btnAdminCrop) btnAdminCrop.onclick = openCropper;

    // Déclencheur Etudiant (Clic sur l'avatar en mode édition)
    const avatarStudent = document.getElementById('prof-avatar');
    if (avatarStudent) {
        avatarStudent.onclick = () => {
            if (document.body.classList.contains('editing') || isAdmin) openCropper();
        };
    }

    function openCropper() {
        modal.style.display = 'flex';
        // Charger l'ancienne photo dans le recadreur si elle existe !
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

    // Drag & Drop
    zone.addEventListener('dragover', e => e.preventDefault());
    zone.addEventListener('drop', e => {
        e.preventDefault();
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
            loadProfileData(currentProfileId); // Recharge tout l'UI proprement
            
            // Maj Avatar Top Bar si c'est nous-même
            if(isOwner && document.getElementById('top-user-avatar')) {
                document.getElementById('top-user-avatar').innerHTML = `<img src="${webpData}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            modal.style.display = 'none';
        } catch(e) { alert("Erreur réseau."); } 
        finally { btnSave.textContent = "Appliquer"; }
    });
}
