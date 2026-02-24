// Immediately Invoked Function Expression to prevent global namespace pollution
(function() {
    try {
        const THEME_KEY = 'pm-cert-quiz-theme';
        const saved = localStorage.getItem(THEME_KEY);
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        // If saved is 'dark', or if no saved preference and system is dark
        if (saved === 'dark' || (!saved && systemDark)) {
            document.documentElement.classList.add('dark-mode');
        }

        // Palette: Force meta theme-color if user has a saved preference, overriding CSS media queries
        if (saved) {
             const metas = document.querySelectorAll('meta[name="theme-color"]');
             if (metas.length > 0) {
                 const primary = metas[0];
                 primary.content = saved === 'dark' ? '#000000' : '#f8f9fa';
                 primary.removeAttribute('media');

                 // Sentinel: Remove duplicate/conflicting meta tags to enforce single source of truth
                 for (let i = 1; i < metas.length; i++) {
                     metas[i].remove();
                 }
             }
        }
    } catch (e) {
        // Fail silently if localStorage access is blocked or other errors occur
        console.error('Theme initialization error:', e);
    }
})();
