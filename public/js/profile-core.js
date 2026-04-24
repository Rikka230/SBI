/**
 * =======================================================================
 * PROFILE CORE - Moteur Unique (Admin & Étudiant) + CROPPER.JS + TRACKING
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getUserLearningProgress, resetCourseProgress, updateQuizScore } from '/js/course-engine.js';

let currentProfileId = null;
let currentProfileData = null;
let loggedInUserId = null;
let isOwner = false;
let isAdmin = false;
let isEditMode = false;
let cropperInstance = null;

const SVG_RESET = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
const SVG_EDIT = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

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
            initCropperEngine();

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

            const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=111&color=fff&size=150`;
            const avatarImg = document.getElementById('prof-avatar-img');
            if(avatarImg) avatarImg.src = avatarUrl;
            
            const topName = document.getElementById('top-user-name');
            if (topName && isOwner) topName.textContent = displayName;
            const topAvatar = document.getElementById('top-user-avatar');
            if (topAvatar && isOwner) topAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;

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

            const badgeZone = document.getElementById('prof-badge-zone');
            if(badgeZone) {
                if (data.isGod) badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle; display:inline-flex; align-items:center; gap:4px;"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9 8H3l5 5-2 7 6-4 6 4-2-7 5-5h-6z"/></svg> SUPRÊME</span>`;
                else if (data.role === 'admin') badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ADMIN</span>`;
                else if (data.role === 'teacher') badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">PROFESSEUR</span>`;
                else badgeZone.innerHTML = `<span style="background:rgba(0,255,163,0.15); color:#00ffa3; padding:4px 8px; border-radius:4px; font-size:0.7rem; vertical-align:middle;">ÉLÈVE</span>`;
            }

            const xp = data.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            
            if(document.getElementById('prof-level')) document.getElementById('prof-level').textContent = level;
            const topLevel = document.getElementById('top-user-level');
            if (topLevel && isOwner) topLevel.textContent = `Niveau ${level}`;
            
            const xpEls = [document.getElementById('prof-xp'), document.getElementById('prof-xp-text')];
            xpEls.forEach(el => {
                if(el) {
                    el.innerHTML = `${xp}`;
                    if(isAdmin) {
                        el.innerHTML = `${xp} ${SVG_EDIT}`;
                        el.style.cursor = 'pointer';
                        el.title = "Cliquez pour modifier l'XP brute";
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

            if (isOwner || isAdmin) {
                const emailEl = document.getElementById('prof-email');
                if(emailEl) {
                    emailEl.tagName === 'INPUT' ? emailEl.value = data.email || '' : emailEl.textContent = data.email || '';
                }

                // FIX : AFFICHER LE BOUTON D'ÉDITION D'EMAIL UNIQUEMENT POUR LE PROPRIÉTAIRE
                if (isOwner) {
                    const btnChangeAdmin = document.getElementById('btn-change-email-admin');
                    if (btnChangeAdmin) btnChangeAdmin.style.display = 'block';
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

            if (document.getElementById('prof-tracking-list')) {
                loadLearningTracking(uid);
            }

        } else {
            console.warn("Utilisateur introuvable.");
        }
    } catch(e) { console.error("Erreur", e); }
}

async function loadLearningTracking(uid) {
    const list = document.getElementById('prof-tracking-list');
    list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">Chargement du dossier...</p>';
    
    try {
        const progress = await getUserLearningProgress(uid);
        
        const userSnap = await getDoc(doc(db, "users", uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        
        const formSnap = await getDocs(collection(db, "formations"));
        const assignedFormIds = [];
        const assignedFormTitles = [];
        formSnap.forEach(d => {
            const f = d.data();
            if (f.students && f.students.includes(uid)) {
                assignedFormIds.push(d.id);
                assignedFormTitles.push(f.titre);
            }
        });

        const courseSnap = await getDocs(collection(db, "courses"));
        const allCourses = {};
        const coursesToShow = new Set();

        courseSnap.forEach(d => {
            const c = d.data();
            allCourses[d.id] = c;
            
            if (c.actif && c.formations && c.formations.some(f => assignedFormIds.includes(f) || assignedFormTitles.includes(f))) {
                coursesToShow.add(d.id);
            }
        });

        Object.keys(progress.courses || {}).forEach(cId => {
            if (allCourses[cId]) coursesToShow.add(cId);
        });

        if (coursesToShow.size === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Aucun cours assigné ou commencé.</p>';
            return;
        }

        list.innerHTML = '';
        const isStudentUI = !window.location.pathname.includes('admin');

        Array.from(coursesToShow).forEach(cId => {
            const courseData = allCourses[cId];
            const pData = (progress.courses && progress.courses[cId]) ? progress.courses[cId] : { status: 'todo', completedChapters: [] };
            
            const completedCount = pData.completedChapters ? pData.completedChapters.length : 0;
            const totalCount = courseData.chapitres ? courseData.chapitres.length : 0;
            
            let statusBadge = '';
            if (pData.status === 'done') {
                statusBadge = `<span style="background: ${isStudentUI ? 'rgba(16, 185, 129, 0.1)' : 'rgba(46, 213, 115, 0.1)'}; color: var(--accent-green); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Terminé</span>`;
            } else if (pData.status === 'in_progress') {
                statusBadge = '<span style="background: rgba(251, 188, 4, 0.1); color: var(--accent-yellow); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">En cours</span>';
            } else {
                statusBadge = `<span style="background: ${isStudentUI ? '#f3f4f6' : 'rgba(255, 255, 255, 0.1)'}; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">À faire</span>`;
            }

            let quizHtml = '';
            if (courseData.chapitres) {
                courseData.chapitres.forEach(chap => {
                    if (chap.type === 'quiz') {
                        const totalPossible = chap.questions ? chap.questions.reduce((sum, q) => sum + (q.points || 1), 0) : 0;
                        const scoreObtained = (pData.quizScores && pData.quizScores[chap.id] !== undefined) ? pData.quizScores[chap.id] : 0;
                        
                        let editBtnHtml = '';
                        if (isAdmin) {
                            editBtnHtml = `<button class="action-btn btn-edit-grade" data-course="${cId}" data-chapter="${chap.id}" data-current="${scoreObtained}" data-max="${totalPossible}" style="width: auto; margin: 0; padding: 4px 8px; font-size: 0.75rem; background: #333; color: white; border: none;">${SVG_EDIT} Éditer</button>`;
                        }

                        quizHtml += `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: ${isStudentUI ? '#f9fafb' : 'rgba(0,0,0,0.2)'}; padding: 0.5rem 1rem; border-radius: 6px; margin-top: 0.8rem; border: 1px solid ${isStudentUI ? 'var(--border-color)' : 'transparent'};">
                                <span style="font-size: 0.85rem; color: var(--text-muted);">${chap.titre}</span>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 0.85rem; font-weight: bold; color: ${scoreObtained === totalPossible && totalPossible > 0 ? 'var(--accent-green)' : 'var(--text-main)'};">Score: ${scoreObtained} / ${totalPossible}</span>
                                    ${editBtnHtml}
                                </div>
                            </div>
                        `;
                    }
                });
            }

            let resetBtnHtml = '';
            if (isAdmin) {
                resetBtnHtml = `<button class="action-btn btn-reset-course danger" data-course="${cId}" style="width: auto; margin: 0; padding: 6px 10px; font-size: 0.8rem;">${SVG_RESET} Réinitialiser</button>`;
            }

            const html = `
                <div class="tracking-item" style="background: ${isStudentUI ? 'white' : '#111'}; border: 1px solid ${isStudentUI ? 'var(--border-color)' : '#333'}; border-radius: 8px; padding: 1rem; box-shadow: ${isStudentUI ? '0 2px 10px rgba(0,0,0,0.02)' : 'none'};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div>
                            <h5 class="tracking-title" style="margin: 0 0 0.5rem 0; color: var(--accent-blue); font-size: 1rem;">${courseData.titre}</h5>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                ${statusBadge}
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Étapes: ${completedCount} / ${totalCount}</span>
                            </div>
                        </div>
                        ${resetBtnHtml}
                    </div>
                    ${quizHtml}
                </div>
            `;
            list.insertAdjacentHTML('beforeend', html);
        });

        const searchInput = document.getElementById('search-tracking-admin');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.tracking-item').forEach(item => {
                    const title = item.querySelector('.tracking-title').textContent.toLowerCase();
                    item.style.display = title.includes(term) ? 'block' : 'none';
                });
            };
        }

        if (isAdmin) {
            document.querySelectorAll('.btn-reset-course').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const cId = e.currentTarget.getAttribute('data-course');
                    if (confirm("⚠️ Réinitialiser ce cours ? L'élève perdra sa progression et l'XP liée aux QCM de ce cours. Cette action est irréversible.")) {
                        e.currentTarget.disabled = true;
                        e.currentTarget.textContent = "Reset...";
                        const success = await resetCourseProgress(uid, cId);
                        if (success) {
                            loadProfileData(uid); 
                        } else {
                            alert("Erreur lors de la réinitialisation.");
                            e.currentTarget.disabled = false;
                        }
                    }
                });
            });

            document.querySelectorAll('.btn-edit-grade').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const cId = e.currentTarget.getAttribute('data-course');
                    const chapId = e.currentTarget.getAttribute('data-chapter');
                    const currentScore = e.currentTarget.getAttribute('data-current');
                    const maxScore = e.currentTarget.getAttribute('data-max');

                    const newScoreStr = prompt(`Modifier la note (Max: ${maxScore}).\nActuelle: ${currentScore}\n\nNote : Cela modifiera automatiquement l'XP globale de l'élève !`, currentScore);
                    
                    if (newScoreStr !== null) {
                        const newScore = parseInt(newScoreStr);
                        if (!isNaN(newScore) && newScore >= 0 && newScore <= parseInt(maxScore)) {
                            e.currentTarget.disabled = true;
                            e.currentTarget.textContent = "Sauvegarde...";
                            const success = await updateQuizScore(uid, cId, chapId, newScore);
                            if (success) {
                                loadProfileData(uid); 
                            } else {
                                alert("Erreur lors de la mise à jour.");
                                e.currentTarget.disabled = false;
                            }
                        } else {
                            alert("Note invalide.");
                        }
                    }
                });
            });
        }

    } catch (err) {
        console.error(err);
        list.innerHTML = '<p style="color: var(--accent-red); font-size: 0.9rem;">Erreur de chargement du suivi.</p>';
    }
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
    const imageElement = document.getElementById('crop-image');
    if(!modal || !input || !imageElement) return;

    let originalImageDataUrl = null;

    function compressImage(file, maxWidth, callback) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height *= maxWidth / width));
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                callback(canvas.toDataURL('image/webp', 0.9));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    function launchCropper(src) {
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        
        imageElement.crossOrigin = "anonymous";
        imageElement.src = src;
        
        setTimeout(() => {
            cropperInstance = new Cropper(imageElement, {
                aspectRatio: 1,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 1,
                cropBoxMovable: false,
                cropBoxResizable: false,
                guides: false,
                highlight: false,
                background: true
            });
        }, 150);
    }

    const openTrigger = document.getElementById('btn-trigger-crop');
    if(openTrigger) {
        openTrigger.addEventListener('click', () => {
            modal.style.display = 'flex';
            
            const imageToLoad = (currentProfileData && currentProfileData.photoOriginal) 
                                ? currentProfileData.photoOriginal 
                                : (currentProfileData && currentProfileData.photoURL ? currentProfileData.photoURL : null);
            
            if (imageToLoad) {
                originalImageDataUrl = imageToLoad;
                launchCropper(imageToLoad);
            } else {
                input.click();
            }
        });
    }

    document.getElementById('btn-upload-new')?.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
        if(e.target.files && e.target.files.length > 0) {
            modal.style.display = 'flex'; 
            
            const btnSave = document.getElementById('btn-save-crop');
            const originalText = btnSave.textContent;
            btnSave.textContent = "Traitement...";
            btnSave.disabled = true;

            compressImage(e.target.files[0], 800, (compressedBase64) => {
                originalImageDataUrl = compressedBase64;
                launchCropper(compressedBase64);
                input.value = ''; 
                btnSave.textContent = originalText;
                btnSave.disabled = false;
            });
        }
    });

    document.getElementById('btn-cancel-crop')?.addEventListener('click', () => {
        modal.style.display = 'none';
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        imageElement.src = '';
    });

    document.getElementById('btn-save-crop')?.addEventListener('click', async () => {
        if(!cropperInstance || !currentProfileId || !originalImageDataUrl) return;
        
        const btnSave = document.getElementById('btn-save-crop');
        btnSave.textContent = "Mise à jour...";
        btnSave.disabled = true;
        
        const croppedCanvas = cropperInstance.getCroppedCanvas({ width: 200, height: 200 });
        const croppedWebpData = croppedCanvas.toDataURL('image/webp', 0.8);

        try {
            await updateDoc(doc(db, "users", currentProfileId), { 
                photoURL: croppedWebpData,
                photoOriginal: originalImageDataUrl
            });
            loadProfileData(currentProfileId); 
            
            modal.style.display = 'none';
            if (cropperInstance) {
                cropperInstance.destroy();
                cropperInstance = null;
            }
            imageElement.src = '';
        } catch(e) { 
            console.error(e);
            alert("Erreur réseau ou fichier trop lourd."); 
        } finally { 
            btnSave.textContent = "Appliquer";
            btnSave.disabled = false;
        }
    });
}
