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
             const meta = document.querySelector('meta[name="theme-color"]');
             if (meta) {
                 meta.content = saved === 'dark' ? '#000000' : '#f8f9fa';
                 meta.removeAttribute('media');
             }
        }
    } catch (e) {
        // Fail silently if localStorage access is blocked or other errors occur
        console.error('Theme initialization error:', e);
    }
})();
