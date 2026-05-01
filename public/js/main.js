/**
 * =======================================================================
 * LOGIQUE FRONT-OFFICE PUBLIC (Vanilla JS)
 * =======================================================================
 */

(function () {
    const initScrollAnimations = (root = document) => {
        const elementsToAnimate = root.querySelectorAll('.fade-in');
        if (!elementsToAnimate.length || !('IntersectionObserver' in window)) {
            elementsToAnimate.forEach((el) => el.classList.add('visible'));
            return;
        }

        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.10
        };

        const observer = new IntersectionObserver((entries, observerInstance) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observerInstance.unobserve(entry.target);
                }
            });
        }, observerOptions);

        elementsToAnimate.forEach((el) => {
            if (el.dataset.sbiFadeBound === 'true') return;
            el.dataset.sbiFadeBound = 'true';
            observer.observe(el);
        });
    };

    const initParallax = () => {
        if (window.__SBI_PUBLIC_PARALLAX_BOUND__) {
            window.dispatchEvent(new Event('sbi:public-parallax:refresh'));
            return;
        }

        window.__SBI_PUBLIC_PARALLAX_BOUND__ = true;

        const lineSpeed = 0.12;
        const fieldSpeed = 0.045;
        let ticking = false;

        const updateParallax = () => {
            const parallaxLines = document.getElementById('parallax-lines');
            const parallaxField = document.getElementById('parallax-field');
            const scrolled = window.scrollY;

            if (parallaxLines) {
                parallaxLines.style.transform = `translate3d(0, ${scrolled * lineSpeed}px, 0)`;
            }

            if (parallaxField) {
                parallaxField.style.transform = `translate3d(0, ${scrolled * fieldSpeed}px, 0)`;
            }

            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }, { passive: true });

        window.addEventListener('sbi:public-parallax:refresh', updateParallax);
        updateParallax();
    };

    const initSignals = (root = document) => {
        const signals = root.querySelectorAll('.sbi-signal');
        if (!signals.length) return;

        const visibleState = new WeakMap();
        const timers = new WeakMap();

        const clearSignalTimers = (signal) => {
            const signalTimers = timers.get(signal);

            if (signalTimers) {
                signalTimers.forEach(timer => window.clearTimeout(timer));
            }

            timers.set(signal, []);
        };

        const addSignalTimer = (signal, timer) => {
            const signalTimers = timers.get(signal) || [];
            signalTimers.push(timer);
            timers.set(signal, signalTimers);
        };

        const revealSignal = (signal, duration = 3600, delay = 0) => {
            clearSignalTimers(signal);

            const openTimer = window.setTimeout(() => {
                signal.classList.add('is-revealed', 'is-attention');

                const attentionTimer = window.setTimeout(() => {
                    signal.classList.remove('is-attention');
                }, 1100);

                const closeTimer = window.setTimeout(() => {
                    if (!signal.matches(':hover') && !signal.matches(':focus-within')) {
                        signal.classList.remove('is-revealed', 'is-attention');
                    }
                }, duration);

                addSignalTimer(signal, attentionTimer);
                addSignalTimer(signal, closeTimer);
            }, delay);

            addSignalTimer(signal, openTimer);
        };

        const signalObserver = 'IntersectionObserver' in window
            ? new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const signal = entry.target;
                    const wasVisible = visibleState.get(signal) === true;

                    if (entry.isIntersecting && !wasVisible) {
                        visibleState.set(signal, true);

                        const isHeroSignal = signal.classList.contains('sbi-signal-hero');
                        const isLoginSignal = signal.classList.contains('sbi-signal-login');
                        const delay = isHeroSignal ? 1900 : (isLoginSignal ? 500 : 1500);
                        const duration = isHeroSignal ? 3900 : (isLoginSignal ? 5400 : 3700);

                        revealSignal(signal, duration, delay);
                    }

                    if (!entry.isIntersecting && wasVisible) {
                        visibleState.set(signal, false);
                        signal.classList.remove('is-revealed', 'is-attention');
                        clearSignalTimers(signal);
                    }
                });
            }, {
                root: null,
                rootMargin: '-10% 0px -20% 0px',
                threshold: 0.4
            })
            : null;

        signals.forEach(signal => {
            if (signal.dataset.sbiSignalBound === 'true') return;
            signal.dataset.sbiSignalBound = 'true';
            visibleState.set(signal, false);

            if (signalObserver) {
                signalObserver.observe(signal);
            } else {
                revealSignal(signal, 3600, 650);
            }

            signal.addEventListener('mouseenter', () => {
                clearSignalTimers(signal);
                signal.classList.add('is-revealed');
            });

            signal.addEventListener('mouseleave', () => {
                signal.classList.remove('is-revealed', 'is-attention');
            });

            signal.addEventListener('focusin', () => {
                clearSignalTimers(signal);
                signal.classList.add('is-revealed');
            });

            signal.addEventListener('focusout', () => {
                signal.classList.remove('is-revealed', 'is-attention');
            });
        });
    };

    const initPublicFrontOffice = (root = document) => {
        initScrollAnimations(root);
        initParallax();
        initSignals(root);
        return true;
    };

    window.SBI_MAIN_INIT = initPublicFrontOffice;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initPublicFrontOffice(document), { once: true });
    } else {
        initPublicFrontOffice(document);
    }
})();
