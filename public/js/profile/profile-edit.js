import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

function showElementForProfileAccess(el) {
  if (!el) return;

  if (el.classList.contains('student-sub-nav-item')) {
    el.style.display = 'flex';
    return;
  }

  if (el.tagName === 'BUTTON') {
    el.style.display = 'inline-flex';
    return;
  }

  el.style.display = el.tagName === 'DIV' ? 'block' : 'inline-flex';
}

export function setupSecurityAndEditMode({ context }) {
  const btnToggleEdit = document.getElementById('btn-toggle-edit');

  if (context.isOwner || context.isAdmin) {
    document.querySelectorAll('.private-section').forEach(showElementForProfileAccess);

    if (btnToggleEdit && context.isOwner && btnToggleEdit.dataset.bound !== 'true') {
      btnToggleEdit.dataset.bound = 'true';
      btnToggleEdit.addEventListener('click', () => {
        context.isEditMode = !context.isEditMode;
        document.body.classList.toggle('editing', context.isEditMode);
        const span = btnToggleEdit.querySelector('span');

        if (context.isEditMode) {
          if (span) span.textContent = 'Quitter édition';
          btnToggleEdit.style.background = 'rgba(255, 74, 74, 0.1)';
          btnToggleEdit.style.color = 'var(--accent-red)';
          btnToggleEdit.style.borderColor = 'transparent';
          document.querySelectorAll('.edit-mode-only').forEach((el) => { el.style.display = 'flex'; });
          ['prof-bio', 'prof-phone', 'prof-address'].forEach((id) => {
            const field = document.getElementById(id);
            if (field) field.disabled = false;
          });
        } else {
          if (span) span.textContent = 'Modifier mon profil';
          btnToggleEdit.style.background = 'white';
          btnToggleEdit.style.color = 'var(--text-main)';
          btnToggleEdit.style.borderColor = 'var(--border-color)';
          document.querySelectorAll('.edit-mode-only').forEach((el) => { el.style.display = 'none'; });
          ['prof-bio', 'prof-phone', 'prof-address'].forEach((id) => {
            const field = document.getElementById(id);
            if (field) field.disabled = true;
          });
        }
      });
    }
  } else {
    ['prof-bio', 'prof-phone', 'prof-address'].forEach((id) => {
      const field = document.getElementById(id);
      if (field) field.disabled = true;
    });
  }
}

export function setupSaveButtons({ db, context, reloadProfile }) {
  const publicButton = document.getElementById('btn-save-public');
  if (publicButton && publicButton.dataset.bound !== 'true') {
    publicButton.dataset.bound = 'true';
    publicButton.addEventListener('click', async () => {
      if (!context.isOwner && !context.isAdmin) return;
      const bio = document.getElementById('prof-bio')?.value || '';
      await updateDoc(doc(db, 'users', context.currentProfileId), { bio });
      alert('Profil public mis à jour !');
      await reloadProfile(context.currentProfileId);
    });
  }

  const privateButton = document.getElementById('btn-save-private');
  if (privateButton && privateButton.dataset.bound !== 'true') {
    privateButton.dataset.bound = 'true';
    privateButton.addEventListener('click', async () => {
      if (!context.isOwner && !context.isAdmin) return;
      await updateDoc(doc(db, 'users', context.currentProfileId), {
        privateData: {
          phone: document.getElementById('prof-phone')?.value || '',
          address: document.getElementById('prof-address')?.value || ''
        }
      });
      alert('Données privées sécurisées !');
    });
  }
}
