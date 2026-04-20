/**
 * =======================================================================
 * LOGIQUE FRONT-OFFICE PUBLIC (Vanilla JS)
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    /* --- 1. DA : LA DEUXIÈME LETTRE EN BLEU --- */
    // On cible tous les éléments portant la classe 'sbi-title'
    const formatSbiTitles = () => {
        const titles = document.querySelectorAll('.sbi-title');
        
        titles.forEach(title => {
            const text = title.textContent.trim();
            // Si le titre a au moins 2 caractères
            if (text.length >= 2) {
                // On isole le 1er caractère, on wrappe le 2ème dans un span bleu, puis on recolle le reste
                const newHtml = text[0] + '<span class="text-blue">' + text[1] + '</span>' + text.substring(2);
                title.innerHTML = newHtml;
            }
        });
    };

    /* --- 2. UX : ANIMATION D'APPARITION AU SCROLL --- */
    const initScrollAnimations = () => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15 // Se déclenche quand 15% de l'élément est visible
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target); // On arrête d'observer une fois affiché
                }
            });
        }, observerOptions);

        // On applique l'observateur sur toutes les classes .fade-in
        const elementsToAnimate = document.querySelectorAll('.fade-in');
        elementsToAnimate.forEach(el => observer.observe(el));
    };

    // Initialisation
    formatSbiTitles();
    initScrollAnimations();
});