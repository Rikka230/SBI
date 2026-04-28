export function getAccessibleFormations(state) {
    if (!state.currentUserProfile) return [];

    if (state.currentUserProfile.role === 'admin' || state.currentUserProfile.isGod) {
        return state.allFormationsData;
    }

    return state.allFormationsData.filter(form => form.profs && form.profs.includes(state.currentUid));
}

export function setupFormationSearch() {
    const searchProfs = document.getElementById('search-profs');

    if (searchProfs) {
        searchProfs.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#formation-profs-list .compact-user-row').forEach(row => {
                const nameSpan = row.querySelector('span');
                if (nameSpan) row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
            });
        });
    }

    const searchStudents = document.getElementById('search-students');

    if (searchStudents) {
        searchStudents.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#formation-students-list .compact-user-row').forEach(row => {
                const nameSpan = row.querySelector('span');
                if (nameSpan) row.style.display = nameSpan.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
            });
        });
    }
}

export function renderFormationsList(state) {
    const container = document.getElementById('formations-list-container');
    if (!container) return;

    container.innerHTML = '';
    const visibleFormations = getAccessibleFormations(state);

    if (visibleFormations.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1;">Aucune catégorie disponible pour votre compte.</p>';
        return;
    }

    visibleFormations.forEach(form => {
        const pCount = form.profs ? form.profs.length : 0;
        const sCount = form.students ? form.students.length : 0;
        let authorName = "Système";

        if (form.auteurId && state.allUsersForAccess.length > 0) {
            const authorObj = state.allUsersForAccess.find(u => u.id === form.auteurId);
            if (authorObj) {
                authorName = (authorObj.prenom || authorObj.nom)
                    ? `${authorObj.prenom || ''} ${authorObj.nom || ''}`.trim()
                    : authorObj.email;
            }
        }

        const html = `
            <div style="background: var(--bg-card); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;">
                <div style="margin-bottom: 1rem;">
                    <h3 style="margin-top: 0; margin-bottom: 0.2rem; color: var(--accent-blue);">${form.titre}</h3>
                    <p style="font-size: 0.75rem; color: #666; margin: 0 0 1rem 0; font-style: italic;">Créé par ${authorName}</p>

                    <p style="font-size: 0.85rem; color: var(--text-muted); margin:0; line-height: 1.4;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 4px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span style="vertical-align: middle;">${pCount} prof(s) assigné(s)</span>
                    </p>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin:0; margin-top: 6px;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                        <span style="vertical-align: middle;">${sCount} élève(s) inscrit(s)</span>
                    </p>
                </div>
                <button class="action-btn btn-edit-formation" data-id="${form.id}" style="margin-bottom:0; justify-content:center;">Modifier les accès</button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.btn-edit-formation').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            state.openFormationModal(e.currentTarget.dataset.id);
        });
    });
}

export function openFormationModal(state, formationId) {
    const modal = document.getElementById('formation-modal');
    if (!modal) {
        console.warn('[SBI Courses] Modal #formation-modal introuvable. Vérifier injection PJAX du node route.');
        return;
    }

    const profsContainer = document.getElementById('formation-profs-list');
    const studentsContainer = document.getElementById('formation-students-list');

    profsContainer.innerHTML = '';
    studentsContainer.innerHTML = '';

    document.getElementById('search-profs').value = '';
    document.getElementById('search-students').value = '';

    const targetForm = formationId ? state.allFormationsData.find(f => f.id === formationId) : null;

    document.getElementById('edit-formation-id').value = formationId || '';
    document.getElementById('formation-titre').value = targetForm ? targetForm.titre : '';
    document.getElementById('formation-modal-title').textContent = targetForm ? "Modifier la Catégorie" : "Créer une Catégorie";
    document.getElementById('delete-formation-zone').style.display = targetForm ? 'block' : 'none';

    state.allUsersForAccess.forEach(u => {
        if (u.role === 'admin' || u.isGod) return;

        const isChecked = targetForm && (
            (u.role === 'teacher' && targetForm.profs && targetForm.profs.includes(u.id)) ||
            (u.role === 'student' && targetForm.students && targetForm.students.includes(u.id))
        ) ? 'checked' : '';

        const name = (u.prenom || u.nom) ? `${u.prenom || ''} ${u.nom || ''}`.trim() : u.email;

        const checkboxHtml = `
            <div class="compact-user-row" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding-right: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1; margin: 0; cursor: pointer; overflow: hidden;">
                    <input type="checkbox" class="cb-formation-user compact-cb" data-uid="${u.id}" data-role="${u.role}" ${isChecked}>
                    <span style="font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;">
                        ${name}
                    </span>
                </label>
            </div>
        `;

        if (u.role === 'teacher') profsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
        else if (u.role === 'student') studentsContainer.insertAdjacentHTML('beforeend', checkboxHtml);
    });

    modal.style.display = 'flex';
}

export function renderFormationsPillsAndFilters(state) {
    const visibleFormations = getAccessibleFormations(state);
    const selector = document.getElementById('formations-selector');

    if (selector) {
        selector.innerHTML = '';

        visibleFormations.forEach(form => {
            selector.insertAdjacentHTML('beforeend', `<span class="formation-pill" data-val="${form.id}">${form.titre}</span>`);
        });

        document.querySelectorAll('.formation-pill').forEach(pill => {
            pill.addEventListener('click', (e) => e.target.classList.toggle('selected'));
        });
    }

    const filter = document.getElementById('library-formation-filter');

    if (filter) {
        filter.innerHTML = '<option value="all">Toutes les Catégories</option>';

        visibleFormations.forEach(form => {
            filter.insertAdjacentHTML('beforeend', `<option value="${form.id}">${form.titre}</option>`);
        });
    }
}

export function refreshBlocsList(state) {
    const select = document.getElementById('course-bloc-select');
    if (!select) return;

    const currentVal = select.value;
    const blocsSet = new Set();

    state.allCoursesData.forEach(c => {
        if (c.bloc) blocsSet.add(c.bloc);
    });

    select.innerHTML = '<option value="">-- Aucun Bloc --</option>';

    Array.from(blocsSet).sort().forEach(bloc => {
        const opt = document.createElement('option');
        opt.value = bloc;
        opt.textContent = bloc;
        select.appendChild(opt);
    });

    if (currentVal && blocsSet.has(currentVal)) {
        select.value = currentVal;
    }
}
