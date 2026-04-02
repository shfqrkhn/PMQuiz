// Immediately Invoked Function Expression to prevent global namespace pollution
(function() {
    try {
        const THEME_KEY = 'pm-cert-quiz-theme';
        const saved = localStorage.getItem(THEME_KEY);
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const isDarkMode = saved === 'dark' || (!saved && systemDark);

        // If saved is 'dark', or if no saved preference and system is dark
        if (isDarkMode) {
            document.documentElement.classList.add('dark-mode');
        }

        // Palette: Consolidate meta theme-color tags to enforce single source of truth, regardless of saved preference
        const metas = document.querySelectorAll('meta[name="theme-color"]');
        if (metas.length > 0) {
            const primary = metas[0];
            primary.content = isDarkMode ? '#000000' : '#f8f9fa';
            primary.removeAttribute('media');

            // Sentinel: Remove duplicate/conflicting meta tags
            for (let i = 1; i < metas.length; i++) {
                metas[i].remove();
            }
        }
    } catch (e) {
        // Fail silently if localStorage access is blocked or other errors occur
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            console.error('Theme initialization error:', e);
        } else {
            console.error('Theme initialization error.');
        }
    }
})();
