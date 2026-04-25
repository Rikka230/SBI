/**
 * =======================================================================
 * LOGIQUE FRONT-OFFICE PUBLIC (Vanilla JS)
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    /* --- SECTION 1 : ANIMATION D'APPARITION AU SCROLL (Intersection Observer) --- */
    const initScrollAnimations = () => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.10 // Se déclenche quand 10% de l'élément est visible
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target); // Stoppe l'observation une fois animé
                }
            });
        }, observerOptions);

        // Applique l'observateur sur tous les éléments avec la classe .fade-in
        const elementsToAnimate = document.querySelectorAll('.fade-in');
        elementsToAnimate.forEach(el => observer.observe(el));
    };

    /* --- SECTION 2 : EFFET DE HOVER SUR LES CARTES (Optionnel, renforce l'UX) --- */
    // Ajoute une lueur dynamique suivant la position de la souris si nécessaire plus tard.
    const initCardInteractions = () => {
        const cards = document.querySelectorAll('.parcours-card');
        
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'rgba(0, 81, 255, 0.4)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'var(--border-color)';
            });
        });
    };

    /* --- SECTION 3 : INITIALISATION GLOBALE --- */
    initScrollAnimations();
    initCardInteractions();

    // La logique de coloration de la 2ème lettre (formatSbiTitles) a été supprimée
    // car le nouveau design utilise des mots entiers ciblés en bleu via HTML/CSS.
});
