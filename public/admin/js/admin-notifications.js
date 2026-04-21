/**
 * =======================================================================
 * NOTIFICATIONS - Écoute temps réel et Interface du panneau
 * =======================================================================
 */

import { db, auth } from '/js/firebase-init.js';
import { collection, query, onSnapshot, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUid = null;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUid = user.uid;
            initNotificationsRealtime();
        }
    });

    // Bascule entre le Profil et les Notifications dans le panneau droit
    const bellBtn = document.getElementById('notif-bell-btn');
    const profileSection = document.getElementById('profile-section');
    const notifSection = document.getElementById('notifications-section');
    const titleNotif = document.getElementById('notif-panel-title');

    if(bellBtn) {
        bellBtn.addEventListener('click', () => {
            if(notifSection.style.display === 'none') {
                profileSection.style.display = 'none';
                notifSection.style.display = 'block';
                titleNotif.style.display = 'block';
                bellBtn.querySelector('svg').style.fill = 'var(--accent-blue)';
            } else {
                profileSection.style.display = 'block';
                notifSection.style.display = 'none';
                titleNotif.style.display = 'none';
                bellBtn.querySelector('svg').style.fill = 'var(--text-muted)';
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
            // On n'affiche la notif que si tu n'es pas l'auteur de l'action
            if (data.auteurId !== currentUid) {
                notifs.push({ id: docSnap.id, ...data });
                if (!data.readBy || !data.readBy.includes(currentUid)) unreadCount++;
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
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem;">Aucune nouvelle notification.</p>';
        return;
    }

    // Trie par date (les plus récentes en haut)
    notifs.sort((a,b) => (b.dateCreation?.toMillis() || 0) - (a.dateCreation?.toMillis() || 0));

    notifs.forEach(notif => {
        const isUnread = !notif.readBy || !notif.readBy.includes(currentUid);
        const dotIndicator = isUnread ? `<div style="width:8px; height:8px; background:var(--accent-red); border-radius:50%; flex-shrink:0; margin-top: 5px;"></div>` : '';
        
        const html = `
            <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" data-course="${notif.courseId}">
                ${dotIndicator}
                <div>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-main); font-weight:bold;">Validation Requise</p>
                    <p style="margin:0.3rem 0 0 0; font-size:0.8rem; color:var(--text-muted); line-height: 1.4;">
                        <strong>${notif.auteurName}</strong> a soumis le cours "<span style="color:white;">${notif.courseTitle}</span>" pour validation.
                    </p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    // Action au clic sur une notification
    document.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const notifId = e.currentTarget.getAttribute('data-id');
            const courseId = e.currentTarget.getAttribute('data-course');
            
            // Marque comme lu en base de données
            await updateDoc(doc(db, "notifications", notifId), {
                readBy: arrayUnion(currentUid)
            });

            // Ouvre le cours pour validation si on est sur la page des cours
            if(window.location.pathname.includes('formations-cours.html')) {
                if(typeof window.editCourse === 'function') window.editCourse(courseId);
            } else {
                // Redirection si on est sur l'index
                window.location.href = `formations-cours.html?edit=${courseId}`;
            }
        });
    });
}
