/**
 * =======================================================================
 * NOTIFICATIONS - Écoute temps réel et Interface du panneau
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, query, onSnapshot, doc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
        }
    });

    const bellBtn = document.getElementById('notif-bell-btn');
    const profileSection = document.getElementById('profile-section');
    const notifSection = document.getElementById('notifications-section');
    const titleNotif = document.getElementById('notif-panel-title');

    // Sécurisation : on vérifie que les éléments existent (utile pour le teacherindex)
    if(bellBtn && notifSection) {
        bellBtn.addEventListener('click', () => {
            if(notifSection.style.display === 'none') {
                if (profileSection) profileSection.style.display = 'none';
                notifSection.style.display = 'block';
                if (titleNotif) titleNotif.style.display = 'block';
                bellBtn.querySelector('svg').style.fill = 'var(--accent-blue)';
            } else {
                if (profileSection) profileSection.style.display = 'block';
                notifSection.style.display = 'none';
                if (titleNotif) titleNotif.style.display = 'none';
                bellBtn.querySelector('svg').style.fill = '#9ca3af';
            }
        });
    }
});

function initNotificationsRealtime() {
    const q = query(collection(db, "notifications"));
    
    onSnapshot(q, (snapshot) => {
        const notifs = [];
        let unreadCount = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            if (data.destinataireId) {
                if (data.destinataireId === currentUid) {
                    notifs.push({ id: docSnap.id, ...data });
                    if (!data.readBy || !data.readBy.includes(currentUid)) unreadCount++;
                }
            } 
            else if (currentUserProfile && (currentUserProfile.role === 'admin' || currentUserProfile.isGod)) {
                if (data.auteurId !== currentUid) {
                    notifs.push({ id: docSnap.id, ...data });
                    if (!data.readBy || !data.readBy.includes(currentUid)) unreadCount++;
                }
            }
        });

        updateRedBadges(unreadCount);
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
    
    if (notifs.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af; font-size:0.9rem; text-align:center; padding: 2rem;">Aucune nouvelle notification.</p>';
        return;
    }

    notifs.sort((a,b) => (b.dateCreation?.toMillis() || 0) - (a.dateCreation?.toMillis() || 0));

    notifs.forEach(notif => {
        const isUnread = !notif.readBy || !notif.readBy.includes(currentUid);
        const dotIndicator = isUnread ? `<div class="unread-dot" style="width:8px; height:8px; background:#ff4a4a; border-radius:50%; flex-shrink:0; margin-top: 5px;"></div>` : '';
        
        let titleText = "";
        let bodyText = "";
        let iconSvg = "";
        
        if (notif.type === 'course_approved') {
            titleText = "🎉 Cours Validé !";
            bodyText = `Votre cours "<span style="color:white;">${notif.courseTitle}</span>" a été validé et publié.`;
            iconSvg = `<svg width="20" height="20" fill="#2ed573" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        } else {
            titleText = "Validation Requise";
            bodyText = `<strong>${notif.auteurName}</strong> a soumis le cours "<span style="color:white;">${notif.courseTitle}</span>".`;
            iconSvg = `<svg width="20" height="20" fill="#fbbc04" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        }

        // On injecte le style en dur pour s'assurer que ça marche même sans CSS externe poussé
        const html = `
            <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" data-course="${notif.courseId}" style="display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; border-bottom: 1px solid #333; cursor: pointer; transition: background 0.2s; background: ${isUnread ? 'rgba(42, 87, 255, 0.05)' : 'transparent'};">
                ${dotIndicator}
                <div style="flex-shrink:0;">${iconSvg}</div>
                <div>
                    <p style="margin:0; font-size:0.85rem; color:#fff; font-weight:bold;">${titleText}</p>
                    <p style="margin:0.3rem 0 0 0; font-size:0.8rem; color:#9ca3af; line-height: 1.4;">
                        ${bodyText}
                    </p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const notifId = e.currentTarget.getAttribute('data-id');
            const courseId = e.currentTarget.getAttribute('data-course');
            
            // Marque comme lu en BDD
            await updateDoc(doc(db, "notifications", notifId), {
                readBy: arrayUnion(currentUid)
            });

            // Retrait visuel immédiat de l'état non lu
            e.currentTarget.style.background = 'transparent';
            const dot = e.currentTarget.querySelector('.unread-dot');
            if(dot) dot.style.display = 'none';

            // Comportement au clic selon le rôle
            if (currentUserProfile && currentUserProfile.role === 'teacher') {
                alert("Votre cours est désormais validé et accessible aux élèves !");
            } else {
                if(window.location.pathname.includes('formations-cours.html')) {
                    if(typeof window.editCourse === 'function') window.editCourse(courseId);
                } else {
                    window.location.href = `formations-cours.html?tab=tab-editor&edit=${courseId}`;
                }
            }
        });
    });
}
