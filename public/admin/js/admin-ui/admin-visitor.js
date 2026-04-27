import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

export function initAdminVisitorShortcut() {
    const path = window.location.pathname;
    const isRoleSpace = path.startsWith('/teacher/') || path.startsWith('/student/');

    if (!isRoleSpace || !document.querySelector('.admin-return-link')) {
        document.body.classList.remove('sbi-admin-visitor');
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            document.body.classList.remove('sbi-admin-visitor');
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const userData = userSnap.exists() ? userSnap.data() : null;
            const canReturnToAdmin = userData?.isGod === true || userData?.role === 'admin';
            document.body.classList.toggle('sbi-admin-visitor', canReturnToAdmin);
        } catch (error) {
            console.warn('[SBI UI] Impossible de vérifier le raccourci admin :', error);
            document.body.classList.remove('sbi-admin-visitor');
        }
    });
}
