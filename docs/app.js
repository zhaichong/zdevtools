// ztools Official Landing Page Interactive Logic

document.addEventListener('DOMContentLoaded', () => {
    // --- Interactive Workflow Tabs ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const stepId = button.getAttribute('data-step');

            // 1. Remove active state from all buttons and set it on the clicked button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 2. Hide all tab content panes and display the one corresponding to the stepId
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `step-${stepId}`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // --- Simple Scroll Animation Trigger (Opacity Fade In) ---
    const featureCards = document.querySelectorAll('.feature-card');
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    featureCards.forEach(card => {
        // Initialize animation states via JavaScript
        card.style.opacity = '0';
        card.style.transform = 'translateY(25px)';
        card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        scrollObserver.observe(card);
    });
});
