## 2024-10-18 - [Palette] - Timer Accessibility Spam
**Insight:** High-frequency updates (1Hz) with `aria-live` create unusable auditory interfaces for screen readers.
**Protocol:** Timers updating at intervals < 5s must use `role="timer"` and avoid `aria-live` regions.

## 2024-05-22 - [Sentinel] - Unbounded Client-Side Parsing
**Insight:** Allowing unrestricted file uploads for client-side parsing (JSON.parse) invites DoS via memory exhaustion.
**Protocol:** All client-side file inputs must enforce a strict size limit (e.g., 5MB) before reading into memory.

## 2024-05-22 - [Bolt] - Hollow Offline Promise
**Insight:** Caching the app shell (HTML/CSS) is insufficient for "Offline" features if content is fetched dynamically.
**Protocol:** All dynamic content essential for core functionality must use a Runtime Caching strategy (e.g., Stale-While-Revalidate).

## 2024-10-24 - [Sentinel] - Unchecked Remote Fetch
**Insight:** Fetching remote content (via `fetch().text()`) without size limits allows large malicious files to crash the browser tab (OOM).
**Protocol:** Use `Response.body.getReader()` to stream and enforce a byte limit (e.g., 5MB) on all external data fetches.

## 2024-10-25 - [Sentinel] - Remote Fetch Size Limit
**Insight:** Unchecked remote fetches expose the application to DoS attacks via memory exhaustion (OOM).
**Protocol:** Implemented a 5MB strict limit on all `fetch` operations using `response.body.getReader()` to stream and count bytes before parsing.

## 2024-10-26 - [Sentinel] - Dynamic Text Rendering
**Insight:** Reliance on `innerHTML` and custom sanitization for dynamic content (questions/choices) is fragile and prone to XSS bypasses.
**Protocol:** Dynamic text rendering must exclusively use `document.createElement` and `textContent` to neutralize XSS vectors.

## 2026-01-25 - [Bolt] - Runtime Font Caching
**Insight:** Service Worker activation events often aggressively prune "unknown" caches. If runtime caches (like ) are not explicitly whitelisted, they are deleted on every app update, defeating the purpose of offline persistence.
**Protocol:** All Service Worker cache cleanup logic ( handler) must explicitly whitelist known runtime cache prefixes to ensure data persistence across version updates.

## 2026-01-25 - [Bolt] - Persistent Runtime Caches
**Insight:** Service Worker activation events often aggressively prune "unknown" caches. If runtime caches (like `selfquiz-data-v1`) are not explicitly whitelisted, they are deleted on every app update, defeating the purpose of offline persistence.
**Protocol:** All Service Worker cache cleanup logic (`activate` handler) must explicitly whitelist known runtime cache prefixes to ensure data persistence across version updates.

## 2026-01-25 - [Palette] - Semantic Loading States
**Insight:** Loading indicators without ARIA roles are invisible to screen readers, leaving users in silence during async operations.
**Protocol:** All loading indicators must use `role="status"` (implicit `aria-live="polite"`) to ensure state changes are announced.

## 2026-01-28 - [Palette] - Mobile Physics
**Insight:** Default touch interactions on mobile browsers often include a 300ms delay to detect double-taps, making rapid UI interactions feel sluggish and causing unintended zooming.
**Protocol:** All interactive elements (buttons, inputs) must explicitly set `touch-action: manipulation` to disable double-tap zooming and ensure instant response.

## 2026-01-29 - [Bolt] - Self-Contained Content
**Insight:** Reliance on external URLs (even within the same repo) for core content prevents offline access via Service Workers and breaks fork portability.
**Protocol:** All core application content must be referenced via relative paths to ensure it is served from the same origin and cacheable.

## 2026-02-03 - [Sentinel] - CSS Hygiene
**Insight:** Inline `style` attributes block strict CSP (`style-src 'self'`). JS `element.style` manipulation does not.
**Protocol:** Eliminate `style="..."` attributes; use utility classes or ID-based CSS rules to enable strict Content Security Policy.
