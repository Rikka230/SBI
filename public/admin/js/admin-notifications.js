/**
 * =======================================================================
 * NOTIFICATIONS & SEARCH - Écoute temps réel, Moteur de Recherche Global
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, query, onSnapshot, doc, deleteDoc, getDoc, getDocs, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;
let currentUserProfile = null;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            const userSnap = await getDoc(doc(db, "users", currentUid));
            if(userSnap.exists()) currentUserProfile = userSnap.data();
            initNotificationsRealtime();
            setupGlobalSearch(); // Active le moteur de recherche
        }
    });

    const bellBtn = document.getElementById('notif-bell-btn');
    const profileSection = document.getElementById('profile-section');
    const notifSection = document.getElementById('notifications-section');
    const titleNotif = document.getElementById('notif-panel-title');

    if(bellBtn && notifSection) {
        bellBtn.addEventListener('click', () => {
            if(notifSection.style.display === 'none') {
                if (profileSection) profileSection.style.display = 'none';
                notifSection.style.display = 'block';
                if (titleNotif) titleNotif.style.display = 'block';
                bellBtn.querySelector('svg').style.fill = 'var(--accent-green)';
            } else {
                if (profileSection) profileSection.style.display = 'block';
                notifSection.style.display = 'none';
                if (titleNotif) titleNotif.style.display = 'none';
                bellBtn.querySelector('svg').style.fill = 'var(--text-muted)';
            }
        });
    }
});

function initNotificationsRealtime() {
    const q = query(collection(db, "notifications"));
    
    onSnapshot(q, (snapshot) => {
        const notifs = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Si la notif cible un étudiant spécifique (Nouveau cours)
            if (data.targetStudents && data.targetStudents.includes(currentUid)) {
                notifs.push({ id: docSnap.id, ...data });
            }
            else if (data.destinataireId && data.destinataireId === currentUid) {
                notifs.push({ id: docSnap.id, ...data });
            } 
            else if (currentUserProfile && (currentUserProfile.role === 'admin' || currentUserProfile.isGod)) {
                if (data.auteurId !== currentUid && !data.targetStudents) {
                    notifs.push({ id: docSnap.id, ...data });
                }
            }
        });

        updateRedBadges(notifs.length);
        renderNotificationsList(notifs);
    });
}

function updateRedBadges(count) {
    const bellBadge = document.getElementById('bell-badge');
    const avatarBadge = document.getElementById('avatar-badge');
    
    if (count > 0) {
        const displayCount = count > 9 ? '9+' : count;
        if(bellBadge) { bellBadge.textContent = displayCount; bellBadge.style.display = 'flex'; }
        if(avatarBadge) { avatarBadge.textContent = displayCount; avatarBadge.style.display = 'flex'; }
    } else {
        if(bellBadge) bellBadge.style.display = 'none';
        if(avatarBadge) avatarBadge.style.display = 'none';
    }
}

function renderNotificationsList(notifs) {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    
    container.innerHTML = '';
    const isStudent = currentUserProfile && currentUserProfile.role !== 'admin' && currentUserProfile.role !== 'teacher' && !currentUserProfile.isGod;
    
    if (notifs.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem;">Aucune nouvelle notification.</p>`;
        return;
    }

    notifs.sort((a,b) => (b.dateCreation?.toMillis() || 0) - (a.dateCreation?.toMillis() || 0));

    notifs.forEach(notif => {
        const dotIndicator = `<div style="width:8px; height:8px; background:var(--accent-red, #ff4a4a); border-radius:50%; flex-shrink:0; margin-top: 5px;"></div>`;
        let titleText = ""; let bodyText = ""; let iconSvg = "";
        
        if (notif.type === 'new_course_published') {
            titleText = "Nouveau cours disponible !";
            bodyText = `Le cours <strong>${notif.courseTitle}</strong> est maintenant disponible dans vos formations.`;
            iconSvg = `<svg width="20" height="20" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>`;
        } else if (notif.type === 'course_approved') {
            titleText = "🎉 Cours Validé !";
            bodyText = `Votre cours "<strong>${notif.courseTitle}</strong>" a été publié.`;
            iconSvg = `<svg width="20" height="20" fill="var(--accent-green)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        } else {
            titleText = "Validation Requise";
            bodyText = `<strong>${notif.auteurName}</strong> a soumis "<strong>${notif.courseTitle}</strong>".`;
            iconSvg = `<svg width="20" height="20" fill="var(--accent-yellow)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        }

        const html = `
            <div class="notif-item" data-id="${notif.id}" data-type="${notif.type}" data-course="${notif.courseId}" style="display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--border-color, #333); cursor: pointer; transition: background 0.2s; background: rgba(16, 185, 129, 0.05);">
                ${dotIndicator}
                <div style="flex-shrink:0;">${iconSvg}</div>
                <div>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-main, #fff); font-weight:bold;">${titleText}</p>
                    <p style="margin:0.3rem 0 0 0; font-size:0.8rem; color:var(--text-muted, #9ca3af); line-height: 1.4;">${bodyText}</p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const notifId = e.currentTarget.getAttribute('data-id');
            const notifType = e.currentTarget.getAttribute('data-type');
            const courseId = e.currentTarget.getAttribute('data-course');
            
            e.currentTarget.style.display = 'none';

            try {
                if (notifType === 'new_course_published') {
                    // Pour un étudiant, on le retire simplement de la liste des cibles
                    await updateDoc(doc(db, "notifications", notifId), {
                        targetStudents: arrayRemove(currentUid)
                    });
                } else {
                    await deleteDoc(doc(db, "notifications", notifId));
                }
            } catch(err) { console.error(err); }

            const nSection = document.getElementById('notifications-section');
            if(nSection) nSection.style.display = 'none';

            // Redirection intelligente
            if (notifType === 'new_course_published') {
                window.location.assign(`/student/cours-viewer.html?id=${courseId}`);
            } 
            else if (currentUserProfile && currentUserProfile.role === 'teacher') {
                alert("Génial ! Votre cours est maintenant en ligne !");
            } 
            else {
                if(window.location.pathname.includes('formations-cours.html')) {
                    if(typeof window.editCourse === 'function') window.editCourse(courseId);
                    else window.location.assign(`formations-cours.html?edit=${courseId}`);
                } else {
                    window.location.assign(`formations-cours.html?edit=${courseId}`);
                }
            }
        });
    });
}

// MOTEUR DE RECHERCHE GLOBAL
function setupGlobalSearch() {
    const searchInputs = document.querySelectorAll('.global-search-input');
    
    searchInputs.forEach(input => {
        const resultsContainer = input.nextElementSibling;
        
        input.addEventListener('focus', async () => {
            if (!window.searchDataCache) {
                // Mise en cache des données au premier clic pour des performances instantanées
                const [uSnap, cSnap] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'courses'))]);
                window.searchDataCache = { users: [], courses: [] };
                uSnap.forEach(d => window.searchDataCache.users.push({id: d.id, ...d.data()}));
                cSnap.forEach(d => window.searchDataCache.courses.push({id: d.id, ...d.data()}));
            }
        });

        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (term.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }
            
            let html = '';
            const isStudent = currentUserProfile && currentUserProfile.role !== 'admin' && currentUserProfile.role !== 'teacher' && !currentUserProfile.isGod;

            // 1. Recherche dans les Cours
            const matchedCourses = window.searchDataCache.courses.filter(c => c.titre && c.titre.toLowerCase().includes(term) && (isStudent ? c.actif : true)).slice(0, 5);
            
            if (matchedCourses.length > 0) {
                html += `<div style="padding: 6px 15px; font-size: 0.75rem; color: var(--text-muted, #888); background: rgba(0,0,0,0.05); font-weight: bold;">COURS PÉDAGOGIQUES</div>`;
                matchedCourses.forEach(c => {
                    const link = isStudent ? `/student/cours-viewer.html?id=${c.id}` : `/admin/formations-cours.html?edit=${c.id}`;
                    html += `
                        <div class="search-result-item" onclick="window.location.href='${link}'">
                            <svg width="18" height="18" fill="var(--accent-blue, #2A57FF)" viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3z"/></svg>
                            <div>
                                <div class="search-result-title">${c.titre}</div>
                            </div>
                        </div>
                    `;
                });
            }

            // 2. Recherche dans les Utilisateurs (Admins uniquement)
            if (!isStudent) {
                const matchedUsers = window.searchDataCache.users.filter(u => {
                    const name = `${u.prenom || ''} ${u.nom || ''}`.toLowerCase();
                    return name.includes(term) || (u.email && u.email.toLowerCase().includes(term));
                }).slice(0, 5);

                if (matchedUsers.length > 0) {
                    html += `<div style="padding: 6px 15px; font-size: 0.75rem; color: var(--text-muted, #888); background: rgba(0,0,0,0.05); font-weight: bold;">UTILISATEURS</div>`;
                    matchedUsers.forEach(u => {
                        html += `
                            <div class="search-result-item" onclick="window.location.href='/admin/admin-profile.html?id=${u.id}'">
                                <svg width="18" height="18" fill="var(--accent-green, #10b981)" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                                <div>
                                    <div class="search-result-title">${u.prenom || ''} ${u.nom || ''}</div>
                                    <div class="search-result-sub">${u.email}</div>
                                </div>
                            </div>
                        `;
                    });
                }
            }

            if (html === '') {
                html = `<div style="padding: 15px; color: var(--text-muted, #888); text-align: center; font-size: 0.85rem;">Aucun résultat pour "${term}"</div>`;
            }

            resultsContainer.innerHTML = html;
            resultsContainer.style.display = 'block';
        });
        
        // Ferme la liste si on clique en dehors
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    });
}
