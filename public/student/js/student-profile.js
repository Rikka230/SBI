/**
 * =======================================================================
 * STUDENT PROFILE - Logique d'affichage et de sécurité du profil
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentProfileId = null;
let currentProfileData = null;
let isOwner = false;
let isEditMode = false;

document.addEventListener('DOMContentLoaded', () => {
    
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id'); 

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentProfileId = targetId ? targetId : user.uid;
            isOwner = (currentProfileId === user.uid);
            
            loadProfileData(currentProfileId);
            
            // LOGIQUE DE SÉCURITÉ ET MODE ÉDITION
            if (isOwner) {
                // Rendre les onglets/boutons privés visibles
                document.querySelectorAll('.private-section').forEach(el => {
                    el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-block';
                });
                
                // Activer le bouton de Mode Édition
                const btnToggleEdit = document.getElementById('btn-toggle-edit');
                btnToggleEdit.addEventListener('click', () => {
                    isEditMode = !isEditMode;
                    
                    if (isEditMode) {
                        btnToggleEdit.innerHTML = '❌ Quitter le mode édition';
                        btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
                        btnToggleEdit.style.color = 'var(--accent-red)';
                        document.body.classList.add('editing');
                        document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'block');
                        
                        // Déverrouiller les champs (sauf l'email)
                        document.getElementById('prof-bio').disabled = false;
                        document.getElementById('prof-phone').disabled = false;
                        document.getElementById('prof-address').disabled = false;
                        
                        // Rendre l'avatar cliquable
                        document.getElementById('prof-avatar').style.cursor = 'pointer';
                        document.getElementById('prof-avatar').onclick = () => document.getElementById('crop-modal').style.display = 'flex';
                    } else {
                        btnToggleEdit.innerHTML = '✏️ Modifier mon profil';
                        btnToggleEdit.style.background = 'white';
                        btnToggleEdit.style.color = 'var(--text-main)';
                        document.body.classList.remove('editing');
                        document.querySelectorAll('.edit-mode-only').forEach(el => el.style.display = 'none');
                        
                        // Reverrouiller les champs
                        document.getElementById('prof-bio').disabled = true;
                        document.getElementById('prof-phone').disabled = true;
                        document.getElementById('prof-address').disabled = true;
                        
                        document.getElementById('prof-avatar').style.cursor = 'default';
                        document.getElementById('prof-avatar').onclick = null;
                    }
                });

            } else {
                // Si visiteur, tout reste verrouillé.
                document.getElementById('prof-bio').disabled = true;
            }

        } else {
            window.location.replace('/login.html');
        }
    });

    // SAUVEGARDE PUBLIQUE
    document.getElementById('btn-save-public').addEventListener('click', async () => {
        if(!isOwner || !currentProfileId) return;
        const bio = document.getElementById('prof-bio').value;
        try {
            await updateDoc(doc(db, "users", currentProfileId), { bio: bio });
            document.getElementById('prof-bio-display').textContent = bio || 'Élève de la plateforme SBI';
            alert("✅ Profil public mis à jour !");
        } catch(e) { alert("❌ Erreur de sauvegarde."); }
    });

    // SAUVEGARDE PRIVÉE
    document.getElementById('btn-save-private').addEventListener('click', async () => {
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

    initCropperEngine();
});

async function loadProfileData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            currentProfileData = snap.data();
            const data = currentProfileData;
            
            // IDENTITÉ
            const name = (data.prenom || '') + ' ' + (data.nom || '');
            document.getElementById('prof-name').textContent = name.trim() || "Étudiant Inconnu";
            
            if (data.bio) {
                document.getElementById('prof-bio-display').textContent = data.bio;
                document.getElementById('prof-bio').value = data.bio;
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

            // DONNÉES PRIVÉES
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

// MOTEUR DE RECADRAGE PHOTO
function initCropperEngine() {
    const modal = document.getElementById('crop-modal');
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
    
    btnCancel.addEventListener('click', () => { modal.style.display = 'none'; });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent-green)'; });
    zone.addEventListener('dragleave', e => { e.preventDefault(); zone.style.borderColor = 'var(--border-color)'; });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border-color)';
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
                if (ratio > 1) { baseHeight = 300; baseWidth = 300 * ratio; } 
                else { baseWidth = 300; baseHeight = 300 / ratio; }
                
                currentZoom = 1; zoomSlider.value = 1;
                updateImageSize(); currentX = 0; currentY = 0; updateImagePosition();
            }
        };
        reader.readAsDataURL(file);
    }

    zoomSlider.addEventListener('input', (e) => {
        currentZoom = parseFloat(e.target.value);
        updateImageSize(); checkBounds(); updateImagePosition();
    });

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

    btnSave.addEventListener('click', async () => {
        if(!zone.hasImage || !currentProfileId) return;
        btnSave.textContent = "Compression...";
        
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext('2d');

        const ratioZoneCanvas = 200 / 300; 
        const renderW = baseWidth * currentZoom * ratioZoneCanvas;
        const renderH = baseHeight * currentZoom * ratioZoneCanvas;
        const renderX = currentX * ratioZoneCanvas;
        const renderY = currentY * ratioZoneCanvas;

        ctx.drawImage(img, renderX, renderY, renderW, renderH);
        const webpData = canvas.toDataURL('image/webp', 0.8);

        try {
            await updateDoc(doc(db, "users", currentProfileId), { photoURL: webpData });
            document.getElementById('prof-avatar').innerHTML = `<img src="${webpData}">`;
            
            // Met aussi à jour l'avatar de la Top Bar si c'est notre propre profil !
            if(isOwner && document.getElementById('top-user-avatar')) {
                document.getElementById('top-user-avatar').innerHTML = `<img src="${webpData}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            
            modal.style.display = 'none';
        } catch(e) { alert("Erreur réseau."); } 
        finally { btnSave.textContent = "Appliquer"; }
    });
}
