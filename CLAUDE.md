# CLAUDE.md - AI Assistant Guide for PMQuiz

## Project Overview

**PM Certification Quiz** is a free, open-source Progressive Web App (PWA) for project management certification exam preparation. It provides practice quizzes covering all 8 PMP performance domains with offline support, timed questions, and detailed explanations.

- **Live Demo**: https://shfqrkhn.github.io/PMQuiz/
- **Current Version**: v1.3.42
- **License**: Open Source (see LICENSE file)

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Styling**: Bootstrap 5.3.0, Bootstrap Icons 1.11.3, Inter font (Google Fonts)
- **PWA**: Service Workers with cache-first strategy
- **No build system**: Direct deployment of source files to GitHub Pages

## Project Structure

```
PMQuiz/
├── index.html              # Main HTML file with inline CSS
├── app.js                  # Main application logic (QuizManager class)
├── service-worker.js       # PWA caching and offline support
├── json-worker.js          # Web Worker for JSON parsing (off-main-thread)
├── manifest.webmanifest    # PWA manifest
├── QuestionBanks/          # JSON question bank files (8 performance domains)
│   ├── PMP_1_StakeholderPerformance.json
│   ├── PMP_2_TeamPerformance.json
│   ├── PMP_3_DevelopmentApproach_and_LifeCyclePerformance.json
│   ├── PMP_4_PlanningPerformance.json
│   ├── PMP_5_ProjectWorkPerformance.json
│   ├── PMP_6_DeliveryPerformance.json
│   ├── PMP_7_MeasurementPerformance.json
│   └── PMP_8_UncertaintyPerformance.json
├── icons/                  # PWA icons (192x192 and 512x512)
├── .jules/steward.md       # Development learnings and protocols
├── README.md               # User-facing documentation
├── LICENSE                 # License file
├── .gitignore              # Git ignore rules
└── .nojekyll               # Disable Jekyll processing on GitHub Pages
```

## Key Files

### app.js (Main Application)
- **QuizManager class**: Core quiz logic including state management, DOM manipulation, event handling
- **QUIZ_CONFIG**: Frozen configuration object with CSS classes, timing, file limits, and question bank URLs
- **Theme Toggle**: Light/dark mode with localStorage persistence
- **Service Worker Registration**: PWA installation

### service-worker.js
- **Cache versioning**: `selfquiz-cache-v{VERSION}` pattern
- **Caching strategies**:
  - Static assets: Cache first
  - JSON data: Cache first with network fallback (`selfquiz-data-v1`)
  - Fonts: Cache first (`selfquiz-fonts-v1`)
- **LRU cache eviction**: Limits cached items to prevent unbounded growth

### json-worker.js
- Web Worker for processing JSON streams off the main thread
- Enforces 5MB size limit using TransformStream
- Chunks large question arrays to prevent UI blocking

## Question Bank JSON Format

```json
{
  "topic": "Domain Name Quiz",
  "questions": [
    {
      "questionText": "Question text here",
      "choices": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Explanation of the correct answer",
      "time": 75
    }
  ]
}
```

**Validation rules**:
- `topic`: Optional string
- `questions`: Required non-empty array
- `questionText`: Required non-empty string
- `choices`: Required array with minimum 2 non-empty strings, no duplicates
- `correctAnswer`: Required number (0-indexed, must be valid index)
- `explanation`: Required non-empty string
- `time`: Optional positive number (defaults to 60 seconds)

## Development Patterns

### DOM Manipulation
- Use `textContent` instead of `innerHTML` to prevent XSS
- Cache DOM elements in `this.dom` object for performance
- Use DocumentFragment for batch DOM insertions
- Event delegation on container elements (e.g., `questionContainer`)

### Security Protocols (from .jules/steward.md)
1. **File Size Limits**: All file inputs and fetches enforce 5MB limit
2. **XSS Prevention**: Use `document.createElement` and `textContent` exclusively
3. **Streaming Validation**: Use `Response.body.getReader()` for size-limited fetches

### Accessibility (a11y)
- ARIA roles and labels on interactive elements
- Focus management after state changes
- `role="timer"` for countdown (avoid `aria-live` on frequent updates)
- `role="status"` for loading indicators
- WCAG AA compliant color contrast

### Mobile Optimization
- `touch-action: manipulation` on interactive elements to prevent double-tap zoom
- Responsive design with Bootstrap grid

### Performance
- `content-visibility: auto` for review cards (virtual rendering)
- `will-change: transform` on progress bars
- Web Worker for JSON parsing
- In-memory quiz cache (Map) with 5-item limit

## Version Management

Version appears in multiple locations that must stay in sync:
1. `index.html` footer: `<footer>v1.3.25</footer>`
2. `service-worker.js`: `CACHE_NAME = 'selfquiz-cache-v1.3.25'`
3. `README.md`: Version badge

## Commit Message Convention

Based on git history, the project uses this format:
```
[Category] (Feature/Area) (vX.X.X)
```

Categories observed:
- `[Enhancement]` - New features
- `[Optimization]` - Performance improvements
- `[Critical Fix]` - Bug fixes
- `Merge pull request` - PR merges

Examples:
- `[Optimization] (Asset Preloading) (v1.3.15)`
- `[Critical Fix] (Sentinel Checks) (v1.3.13)`

## Testing

No automated tests. Manual testing checklist:
1. Load quiz from dropdown selection
2. Load quiz from file upload
3. Answer questions (correct/incorrect/timeout)
4. Review answers after completion
5. Test offline functionality (disconnect network, reload)
6. Test dark/light mode toggle
7. Test PWA installation
8. Test on mobile devices

## Common Tasks

### Update Version
1. Update version in `index.html` footer
2. Update `CACHE_NAME` in `service-worker.js`
3. Update version badge in `README.md`

### Add New Question Bank
1. Create JSON file in `QuestionBanks/` following the schema
2. Add entry to `QUIZ_CONFIG.QUESTION_BANKS` in `app.js`
3. Update service worker cache version

### Modify Styling
- CSS is extracted to `style.css`
- Use CSS custom properties (`:root` / `.dark-mode`)
- Bootstrap utility classes available

## Security Considerations

- Content Security Policy (CSP) configured in `<meta>` tag
- Only allowed external sources: Bootstrap CDN, Google Fonts, GitHub raw content
- No server-side processing - fully client-side
- No cookies or external tracking

## Deployment

- Hosted on GitHub Pages
- Direct push to main branch triggers deployment
- `.nojekyll` file prevents Jekyll processing
- All paths are relative for subdirectory compatibility

## Important Notes for AI Assistants

1. **No build system**: Changes go directly to source files
2. **Version sync**: Always update all version locations together
3. **CSS**: Styles are in `style.css`
4. **Security first**: Follow XSS prevention patterns (textContent, not innerHTML)
5. **Accessibility**: Maintain ARIA attributes and focus management
6. **Cache versioning**: Increment cache version when updating cached assets
7. **Steward.md**: Check `.jules/steward.md` for documented learnings and protocols
