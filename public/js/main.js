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

    /* --- SECTION 2 : INITIALISATION GLOBALE --- */
    initScrollAnimations();
});
