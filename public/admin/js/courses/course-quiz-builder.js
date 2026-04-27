export function addQuizQuestion() {
    const container = document.getElementById('quiz-questions-container');
    if (!container) return;

    const qIndex = container.children.length;

    const qHTML = `
        <div class="quiz-question-block" data-qindex="${qIndex}" style="background: var(--bg-card, #111); padding: 1.5rem; border: 1px solid var(--border-color, #333); border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" class="editor-action-btn" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red, #ff4a4a); cursor: pointer; font-size: 1.2rem;">&times;</button>
            <input type="text" class="q-title editor-input" placeholder="Votre question..." style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: var(--text-main, white); border: none; border-bottom: 1px solid var(--border-color, #555); outline: none; margin-bottom: 1rem;">
            <div class="q-options-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                    <input type="checkbox" class="q-correct-cb editor-input" value="0" checked>
                    <input type="text" class="q-opt editor-input" placeholder="Réponse 1" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                    <input type="checkbox" class="q-correct-cb editor-input" value="1">
                    <input type="text" class="q-opt editor-input" placeholder="Réponse 2" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                </label>
            </div>
            <button type="button" onclick="window.addOptionToQuestion(this)" class="editor-action-btn" style="margin-top:0.8rem; background:none; border:none; color:var(--accent-blue); cursor:pointer; font-size:0.85rem;">+ Ajouter un choix</button>
            <div style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; border-top: 1px solid var(--border-color, #333); padding-top: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez <strong>les</strong> bonnes réponses.</span>
                <input type="number" class="q-points editor-input" value="1" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', qHTML);
}

export function addOptionToQuestion(btn) {
    const container = btn.previousElementSibling;
    const optIndex = container.children.length;

    const html = `
        <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
            <input type="checkbox" class="q-correct-cb editor-input" value="${optIndex}">
            <input type="text" class="q-opt editor-input" placeholder="Nouvelle réponse" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
            <button type="button" onclick="this.parentElement.remove()" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer; padding: 0 5px;">&times;</button>
        </label>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

export function gatherQuizQuestions() {
    const questions = [];
    document.querySelectorAll('.quiz-question-block').forEach((block) => {
        const title = block.querySelector('.q-title').value.trim();
        const points = parseInt(block.querySelector('.q-points').value) || 1;
        const options = Array.from(block.querySelectorAll('.q-opt')).map(inp => inp.value.trim());
        const correctIndices = Array.from(block.querySelectorAll('.q-correct-cb:checked')).map(cb => parseInt(cb.value));

        if (title && options.length >= 2) questions.push({ question: title, options, correctIndices, points });
    });
    return questions;
}

export function renderQuizBuilder(questions) {
    const container = document.getElementById('quiz-questions-container');
    if (!container) return;

    container.innerHTML = '';

    questions.forEach((q, index) => {
        const indices = q.correctIndices || (q.correctIndex !== undefined ? [q.correctIndex] : []);
        const optionsHTML = q.options.map((opt, i) => `
            <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted, #aaa);">
                <input type="checkbox" class="q-correct-cb editor-input" value="${i}" ${indices.includes(i) ? 'checked' : ''}>
                <input type="text" class="q-opt editor-input" value="${opt}" placeholder="Réponse ${i + 1}" style="flex-grow:1; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.5rem; color: var(--text-main, white); border-radius:4px; outline:none;">
                ${i > 1 ? `<button type="button" onclick="this.parentElement.remove()" class="editor-action-btn" style="background:none; border:none; color:var(--accent-red, #ff4a4a); cursor:pointer;">&times;</button>` : ''}
            </label>
        `).join('');

        const qHTML = `
        <div class="quiz-question-block" data-qindex="${index}" style="background: var(--bg-card, #111); padding: 1.5rem; border: 1px solid var(--border-color, #333); border-radius: 6px; position: relative;">
            <button onclick="this.parentElement.remove()" class="editor-action-btn" style="position: absolute; right: 10px; top: 10px; background: none; border: none; color: var(--accent-red, #ff4a4a); cursor: pointer; font-size: 1.2rem;">&times;</button>
            <input type="text" class="q-title editor-input" value="${q.question}" style="width: 100%; font-size: 1.1rem; padding: 0.8rem; background: transparent; color: var(--text-main, white); border: none; border-bottom: 1px solid var(--border-color, #555); outline: none; margin-bottom: 1rem;">
            <div class="q-options-container" style="display: flex; flex-direction: column; gap: 0.5rem;">${optionsHTML}</div>
            <button type="button" onclick="window.addOptionToQuestion(this)" class="editor-action-btn" style="margin-top:0.8rem; background:none; border:none; color:var(--accent-blue); cursor:pointer; font-size:0.85rem;">+ Ajouter un choix</button>
            <div style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; border-top: 1px solid var(--border-color, #333); padding-top: 1rem;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Cochez <strong>les</strong> bonnes réponses.</span>
                <input type="number" class="q-points editor-input" value="${q.points}" min="1" style="width: 60px; background: var(--bg-body, #222); border: 1px solid var(--border-color, #444); padding: 0.4rem; color: var(--text-main, white); border-radius: 4px;">
                <span style="color: var(--text-muted); font-size: 0.85rem;">Point(s)</span>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', qHTML);
    });
}
