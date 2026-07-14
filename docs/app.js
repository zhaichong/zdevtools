// ztools Premium Landing Page Scroll Reveal & Interactions

document.addEventListener('DOMContentLoaded', () => {
    // Apple-style Scroll Reveal Observer
    const revealElements = document.querySelectorAll('.scroll-reveal');
    
    const observerOptions = {
        root: null,
        rootMargin: '-50px 0px', // Trigger slightly before the element fully enters
        threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Trigger only once
            }
        });
    }, observerOptions);

    revealElements.forEach(element => {
        revealObserver.observe(element);
    });
});
