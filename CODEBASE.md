# CODEBASE.md

## Scope
- **Apparent purpose**: Free, open-source Progressive Web App (PWA) for Project Management certification practice with timed questions, offline support, and detailed explanations.
- **Stack/languages/frameworks**: Vanilla JS (ES6+), HTML5, CSS3, Bootstrap 5.3.0.
- **Entry points**: `index.html` (UI), `service-worker.js` (PWA network interceptor), `app.js` (App logic).
- **Build/run/test systems**: No build system. Client-side static files directly deployed. No automated tests.
- **Architectural style**: Offline-first Static Web Application utilizing Web Workers for data processing and Service Workers for caching.
- **Major operational invariants**: Client-side execution only. Strict CSP limiting origins. Strict file size limits (5MB) on JSON data fetched or uploaded.

## Repository Map
```
.
├── app.js
├── index.html
├── json-worker.js
├── service-worker.js
├── style.css
├── theme.js
├── manifest.webmanifest
├── README.md
├── CLAUDE.md
├── .jules/
│   └── steward.md
├── QuestionBanks/    [8 JSON files excluded]
└── icons/            [2 PNG files excluded]
```

## Authoritative Review Summary
- **Core flows**:
  - App startup: `index.html` loads, `theme.js` blocks rendering to prevent FOUC, `app.js` instantiates `QuizManager`, registers Service Worker.
  - Data Loading: Fetch/upload -> `json-worker.js` streams, limits to 5MB, validates, returns chunks -> `app.js` populates memory.
  - Offline availability: Service worker intercepts requests, caches JSON with stale-while-revalidate, and shell/fonts with cache-first.
- **Important interfaces**: `QuizManager` DOM cache and event bindings. Web Worker `message` passing (`meta`, `chunk`, `done`, `error`).
- **Key configs**: `QUIZ_CONFIG` in `app.js` (5MB limits, question banks). `CACHE_NAME` in `service-worker.js`.
- **Major invariants**:
  - DOM manipulations must use `textContent`/`document.createElement` (no `innerHTML`) for XSS safety.
  - Data parsing uses streams and size constraints to prevent memory exhaustion (DoS).
  - Strict Content-Security-Policy.
- **Principal risks**:
  - Cache synchronization (stale data if Service Worker eviction behaves unexpectedly).
  - Worker messaging race conditions if user repeatedly clicks upload.
  - Accessibility gaps with frequent dynamic DOM updates.

## File Inventory
| Path | Role | Priority | Inclusion | Reason |
|---|---|---|---|---|
| `app.js` | Main Application Logic | Critical | Full | Core business logic, state, and UI bindings. |
| `index.html` | Entry Point / App Shell | Critical | Full | Network boundaries (CSP), layout, entry point. |
| `json-worker.js` | Background Data Processor | Critical | Full | Data validation, concurrency, DoS protection. |
| `service-worker.js` | PWA Offline Manager | Critical | Full | Caching strategies, network interceptor. |
| `style.css` | Global Styling | Important | Full | UX/accessibility, mobile physics, print styles. |
| `theme.js` | Theme Initialization | Important | Full | Anti-FOUC logic and visual invariants. |
| `manifest.webmanifest` | PWA Metadata | Important | Full | App installation context, shortcuts. |
| `.jules/steward.md` | Architecture Decisions | Important | Summary | Design principles, security insights, and operational rules. |
| `README.md` | Project Documentation | Context | Summary | User-facing summary and features. |
| `CLAUDE.md` | Developer Guidelines | Context | Summary | Development instructions and architectural overview. |
| `QuestionBanks/*.json` | Data Store | Context | Excluded | Repetitive data schemas represented elsewhere. |
| `icons/*` | Static Assets | Context | Excluded | Binary images with no behavioral significance. |
| `LICENSE` | Legal Boilerplate | Context | Excluded | Standard open-source license. |
| `.gitignore` | Git Configuration | Context | Excluded | Low-risk boilerplate. |
| `.nojekyll` | Hosting Config | Context | Excluded | Zero-byte flag file for GitHub Pages. |

## Embedded Critical Files

### `app.js`
- **Role**: Main Application Logic
- **Why it matters**: Core business logic, state, and UI bindings.
- **Inclusion mode**: Full

```js
// --- Configuration Object ---
const QUIZ_CONFIG = Object.freeze({
    CSS_CLASSES: {
        HIDDEN: 'd-none',
        CORRECT_ANSWER: 'correct-answer',
        INCORRECT_ANSWER: 'incorrect-answer',
        USER_SELECTED: 'user-selected',
        FADE_IN: 'fade-in',
    },
    DEFAULT_QUESTION_TIME: 60,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    CHAR_CODE_A: 65,
    TIMER_INTERVAL: 250,
    MIN_CHOICES_PER_QUESTION: 2,
    QUESTION_BANKS: [
        {
            name: "Stakeholder Performance Domain",
            url: "QuestionBanks/PMP_1_StakeholderPerformance.json"
        },
        {
            name: "Team Performance Domain",
            url: "QuestionBanks/PMP_2_TeamPerformance.json"
        },
        {
            name: "Development Approach & Life Cycle",
            url: "QuestionBanks/PMP_3_DevelopmentApproach_and_LifeCyclePerformance.json"
        },
        {
            name: "Planning Performance Domain",
            url: "QuestionBanks/PMP_4_PlanningPerformance.json"
        },
        {
            name: "Project Work Performance Domain",
            url: "QuestionBanks/PMP_5_ProjectWorkPerformance.json"
        },
        {
            name: "Delivery Performance Domain",
            url: "QuestionBanks/PMP_6_DeliveryPerformance.json"
        },
        {
            name: "Measurement Performance Domain",
            url: "QuestionBanks/PMP_7_MeasurementPerformance.json"
        },
        {
            name: "Uncertainty Performance Domain",
            url: "QuestionBanks/PMP_8_UncertaintyPerformance.json"
        }
    ]
});

// --- QuizManager Class ---
class QuizManager {
    constructor() {
        // Initialize state variables
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.timerInterval = null;
        this.timeLeft = 0;
        this.userAnswers = [];
        this.quizTopic = '';
        this.quizCache = new Map();
        this.isQuizActive = false;
        this.currentChoiceButtons = [];
        this.currentQuestionHeading = null;

        // Initialize worker for background processing
        this.worker = new Worker('json-worker.js');

        this._cacheDOMElements();
        this._populateQuestionBankDropdown();
        this._bindEvents();
        this._updateCacheStatus();
        this._handleShortcuts();
    }

    /**
     * Handles app shortcuts from manifest (e.g., ?shortcut=upload).
     */
    _handleShortcuts() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const shortcut = urlParams.get('shortcut');

            if (shortcut === 'upload' && this.dom.jsonFile) {
                // Use a small timeout to ensure UI is ready and transition is visible
                setTimeout(() => {
                    this.dom.jsonFile.focus();
                    this.dom.jsonFile.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            } else if (shortcut === 'select' && this.dom.questionBankSelect) {
                setTimeout(() => {
                    this.dom.questionBankSelect.focus();
                    this.dom.questionBankSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        } catch (e) {
            console.warn('Shortcut handling failed:', e);
        }
    }

    /**
     * Processes data using the worker.
     * @param {ReadableStream} stream - The data stream to process.
     * @returns {Promise<object>} The reconstructed quiz data object.
     */
    _processWithWorker(stream) {
        return new Promise((resolve, reject) => {
            const reconstructed = { questions: [] };

            const onMessage = (e) => {
                const { type, data, message } = e.data;
                if (type === 'meta') {
                    Object.assign(reconstructed, data);
                } else if (type === 'chunk') {
                    // Optimized: Use loop to avoid stack limit and reduce overhead
                    if (reconstructed.questions) {
                        const questions = reconstructed.questions;
                        for (let i = 0; i < data.length; i++) {
                            questions.push(data[i]);
                        }
                    }
                } else if (type === 'done') {
                    cleanup();
                    resolve(reconstructed);
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(message));
                }
            };

            const onError = (e) => {
                cleanup();
                reject(new Error("Worker error: " + e.message));
            };

            const cleanup = () => {
                this.worker.removeEventListener('message', onMessage);
                this.worker.removeEventListener('error', onError);
            };

            this.worker.addEventListener('message', onMessage);
            this.worker.addEventListener('error', onError);

            this.worker.postMessage({
                type: 'processStream',
                stream: stream,
                limit: QUIZ_CONFIG.MAX_FILE_SIZE,
                config: {
                    minChoices: QUIZ_CONFIG.MIN_CHOICES_PER_QUESTION
                }
            }, [stream]);
        });
    }

    /**
     * Caches frequently accessed DOM elements.
     */
    _cacheDOMElements() {
        this.dom = {
            uploadSection: document.getElementById('uploadSection'),
            quizInterface: document.getElementById('quizInterface'),
            resultsSection: document.getElementById('resultsSection'),
            reviewSection: document.getElementById('reviewSection'),

            selectBankForm: document.getElementById('selectBankForm'),
            questionBankSelect: document.getElementById('questionBankSelect'),
            startFromSelectBtn: document.getElementById('startFromSelectBtn'),
            selectHelp: document.getElementById('selectHelp'),

            uploadForm: document.getElementById('uploadForm'),
            jsonFile: document.getElementById('jsonFile'),
            startFromFileBtn: document.getElementById('startFromFileBtn'),

            loadError: document.getElementById('jsonLoadError'),
            loadingIndicator: document.getElementById('loadingIndicator'),

            quizTopic: document.getElementById('quizTopic'),
            currentScoreValue: document.getElementById('currentScoreValue'),
            totalQuestions: document.getElementById('totalQuestions'),
            currentScorePercentage: document.getElementById('currentScorePercentage'),
            progressBar: document.getElementById('progressBar'),
            currentQuestionNum: document.getElementById('currentQuestionNum'),
            totalQuestionsDisplay: document.getElementById('totalQuestionsDisplay'),
            questionProgressText: document.getElementById('questionProgressText'),
            timer: document.getElementById('timer'),

            finishQuizBtn: document.getElementById('finishQuizBtn'),
            resetQuizDuringQuizBtn: document.getElementById('resetQuizDuringQuizBtn'),

            questionContainer: document.getElementById('questionContainer'),
            explanationContainer: document.getElementById('explanationContainer'),
            finalScoreValue: document.getElementById('finalScoreValue'),
            finalTotalQuestions: document.getElementById('finalTotalQuestions'),
            finalScorePercentage: document.getElementById('finalScorePercentage'),
            finalPercentageBar: document.getElementById('finalPercentageBar'),
            finalPercentageText: document.getElementById('finalPercentageText'),
            reviewBtn: document.getElementById('reviewBtn'),
            reviewScoreValue: document.getElementById('reviewScoreValue'),
            reviewTotalQuestions: document.getElementById('reviewTotalQuestions'),
            reviewScorePercentage: document.getElementById('reviewScorePercentage'),
            reviewQuestionsContainer: document.getElementById('reviewQuestionsContainer'),
            restartQuizBtnResults: document.getElementById('restartQuizBtnResults'),
            restartQuizBtnReview: document.getElementById('restartQuizBtnReview'),

            reviewFilterAll: document.getElementById('reviewFilterAll'),
            reviewFilterIncorrect: document.getElementById('reviewFilterIncorrect'),
        };
    }

    /**
     * Checks availability of question banks in the cache and updates the dropdown.
     */
    async _updateCacheStatus() {
        if (!this.dom.questionBankSelect || !('caches' in window)) return;

        try {
            const isOnline = navigator.onLine;

            // Bolt: Parallelize cache checks using Promise.all to reduce latency
            const options = Array.from(this.dom.questionBankSelect.options);
            const statusPromises = options.map(async (option) => {
                const url = option.value;
                if (!url) return null; // Skip default option

                const cachedResponse = await caches.match(url);
                const isCached = !!cachedResponse;
                return { option, isCached };
            });

            const results = await Promise.all(statusPromises);

            results.forEach(result => {
                if (!result) return;
                const { option, isCached } = result;

                // Reset text to base name first (remove previous status indicators)
                const baseName = option.textContent.replace(/ ✓$/, '').replace(/ \(Offline\)$/, '');

                let newText = baseName;
                if (isCached) {
                    newText += ' ✓';
                } else if (!isOnline) {
                    newText += ' (Offline)';
                }

                option.textContent = newText;
                option.disabled = !isOnline && !isCached;
            });
        } catch (e) {
            console.warn('Cache check failed:', e);
        }
    }

    /**
     * Populates the question bank dropdown from the predefined list in QUIZ_CONFIG.
     */
    _populateQuestionBankDropdown() {
        if (!this.dom.questionBankSelect) return;

        this.dom.questionBankSelect.textContent = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Question Bank --";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        this.dom.questionBankSelect.appendChild(defaultOption);

        if (QUIZ_CONFIG.QUESTION_BANKS && QUIZ_CONFIG.QUESTION_BANKS.length > 0) {
            const fragment = document.createDocumentFragment();
            QUIZ_CONFIG.QUESTION_BANKS.forEach(bank => {
                const option = document.createElement('option');
                option.value = bank.url;
                option.textContent = bank.name;
                fragment.appendChild(option);
            });
            this.dom.questionBankSelect.appendChild(fragment);
            this.dom.questionBankSelect.disabled = false;
            if (this.dom.startFromSelectBtn) this.dom.startFromSelectBtn.disabled = false;
            if (this.dom.selectHelp) this.dom.selectHelp.textContent = "Choose a predefined question bank.";

        } else {
             if (this.dom.selectHelp) this.dom.selectHelp.textContent = "No predefined question banks available.";
             this.dom.questionBankSelect.disabled = true;
             if (this.dom.startFromSelectBtn) this.dom.startFromSelectBtn.disabled = true;
        }
    }

    /**
     * Binds event listeners to DOM elements.
     */
    _bindEvents() {
        if (this.dom.selectBankForm) this.dom.selectBankForm.addEventListener('submit', this._handleSelectSubmit.bind(this));
        if (this.dom.uploadForm) this.dom.uploadForm.addEventListener('submit', this._handleFileSubmit.bind(this));

        if (this.dom.finishQuizBtn) this.dom.finishQuizBtn.addEventListener('click', this.confirmAndEndQuiz.bind(this));
        if (this.dom.resetQuizDuringQuizBtn) this.dom.resetQuizDuringQuizBtn.addEventListener('click', this._handleResetRequest.bind(this));

        if (this.dom.reviewBtn) this.dom.reviewBtn.addEventListener('click', this.showReview.bind(this));
        if (this.dom.restartQuizBtnResults) this.dom.restartQuizBtnResults.addEventListener('click', this.confirmAndResetQuiz.bind(this));
        if (this.dom.restartQuizBtnReview) this.dom.restartQuizBtnReview.addEventListener('click', this.confirmAndResetQuiz.bind(this));

        if (this.dom.reviewFilterAll) this.dom.reviewFilterAll.addEventListener('click', () => this._filterReview('all'));
        if (this.dom.reviewFilterIncorrect) this.dom.reviewFilterIncorrect.addEventListener('click', () => this._filterReview('incorrect'));

        window.addEventListener('beforeunload', (e) => {
            if (this.isQuizActive) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        window.addEventListener('online', () => this._updateCacheStatus());
        window.addEventListener('offline', () => this._updateCacheStatus());

        // Palette: Keyboard navigation support
        document.addEventListener('keydown', this._handleKeyDown.bind(this));

        // Event delegation for choice buttons
        if (this.dom.questionContainer) {
            this.dom.questionContainer.addEventListener('click', (e) => {
                const button = e.target.closest('.choice-btn');
                if (button && !button.disabled) {
                    this.handleAnswer(parseInt(button.dataset.index));
                }
            });
        }
    }

    /**
     * Handles keyboard input for quiz navigation.
     * @param {KeyboardEvent} e - The keydown event.
     */
    _handleKeyDown(e) {
        if (!this.isQuizActive) return;

        // If feedback is shown, allow Enter/Space to continue
        const isFeedbackShown = this.dom.explanationContainer &&
                               !this.dom.explanationContainer.classList.contains(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);

        if (isFeedbackShown) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.nextQuestion();
            }
            return;
        }

        // Prevent interaction if question is already answered
        if (this.userAnswers.length > this.currentQuestionIndex) return;

        // Prevent interaction if timer is stopped (time expired) but feedback not yet fully processed
        if (this.timeLeft <= 0) return;

        // Handle Choice Selection (1-9)
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            this.handleAnswer(index);
            return;
        }

        // Handle Choice Selection (A-Z)
        if (/^[a-zA-Z]$/.test(e.key)) {
            const index = e.key.toLowerCase().charCodeAt(0) - 97; // 'a' is 97
            this.handleAnswer(index);
        }
    }

    /**
     * Handles the reset button click with confirmation dialog.
     * @param {Event} event - The click event.
     */
    _handleResetRequest(event) {
        if (confirm("Reset quiz and load new questions?")) {
            this.resetQuiz();
        }
    }

    /**
     * Handles quiz start from dropdown selection.
     * @param {Event} event - The form submission event.
     */
    async _handleSelectSubmit(event) {
        event.preventDefault();
        const selectedUrl = this.dom.questionBankSelect.value;
        this._setLoadError('');

        if (!selectedUrl) {
            this._setLoadError('Please select a question bank from the dropdown.');
            return;
        }
        await this._fetchAndProcessQuizData(selectedUrl, "dropdown selection");
    }

    /**
     * Handles quiz start from file upload.
     * @param {Event} event - The form submission event.
     */
    async _handleFileSubmit(event) {
        event.preventDefault();
        const file = this.dom.jsonFile.files[0];
        this._setLoadError('');

        if (!file) {
            this._setLoadError('Please select a JSON file to upload.');
            return;
        }

        if (file.size > QUIZ_CONFIG.MAX_FILE_SIZE) {
            this._setLoadError('File is too large. Maximum size is 5MB.');
            return;
        }

        this._setLoadingState(true);
        try {
            // Use worker stream instead of reading all text
            const jsonData = await this._processWithWorker(file.stream());
            this._processAndStartQuiz(jsonData, "file upload");
        } catch (error) {
            this._setLoadError(`Error reading file: ${error.message}`);
            console.error("File Reading Error:", error);
        } finally {
            this._setLoadingState(false);
            if (this.dom.uploadForm) this.dom.uploadForm.reset();
        }
    }

    /**
     * Fetches JSON data from a URL and processes it.
     * @param {string} sourceUrl - The URL to fetch JSON from.
     * @param {string} sourceType - A description of the source for error messages.
     */
    async _fetchAndProcessQuizData(sourceUrl, sourceType = "unknown") {
        this._setLoadingState(true);
        this._setLoadError('');

        // Check in-memory cache to prevent unnecessary network calls
        if (this.quizCache.has(sourceUrl)) {
            // Bolt: Implement true LRU by refreshing key order (delete and re-add)
            const data = this.quizCache.get(sourceUrl);
            this.quizCache.delete(sourceUrl);
            this.quizCache.set(sourceUrl, data);

            this._processAndStartQuiz(data, sourceType);
            this._setLoadingState(false);
            return;
        }

        try {
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch from ${sourceType}: ${response.status} ${response.statusText}`);
            }

            // Use Worker to process stream (handles size limit, parsing, and non-blocking return)
            const jsonData = await this._processWithWorker(response.body);

            this.quizCache.set(sourceUrl, jsonData);

            // Sentinel: Limit cache size to prevent memory leaks during long sessions
            if (this.quizCache.size > 5) {
                const oldestKey = this.quizCache.keys().next().value;
                this.quizCache.delete(oldestKey);
            }

            this._processAndStartQuiz(jsonData, sourceType);
        } catch (error) {
            this._setLoadError(`Error fetching or processing from ${sourceType}: ${error.message}`);
            console.error(`Error with ${sourceType}:`, error);
             this._showSection(this.dom.uploadSection); // Go back to upload on fetch error
        } finally {
            this._setLoadingState(false);
        }
    }

    /**
     * Parses JSON data (if string), loads questions, and starts the quiz.
     * @param {string|object} quizData - The JSON string or parsed object.
     * @param {string} sourceType - Description of the source for error/topic context.
     */
    _processAndStartQuiz(quizData, sourceType) {
        try {
            const jsonData = (typeof quizData === 'string') ? JSON.parse(quizData) : quizData;
            this.loadQuestions(jsonData);

            this._showSection(this.dom.quizInterface);
            this.dom.quizTopic.textContent = this.quizTopic || `Quiz: ${sourceType}`;
            if (this.dom.quizInterface) this.dom.quizInterface.focus();
            this.startQuiz();
        } catch (error) {
            this._setLoadError(`Error processing quiz data (from ${sourceType}): ${error.message}`);
            console.error(`Quiz Data Processing Error (from ${sourceType}):`, error);
             this._showSection(this.dom.uploadSection);
        }
    }

    /**
     * Sets the error message for loading.
     * @param {string} message - The error message to display.
     */
    _setLoadError(message) {
        if (this.dom.loadError) {
            this.dom.loadError.textContent = message;
        }
    }

    /**
     * Sets the loading state (indicator visibility and input disabling).
     * @param {boolean} isLoading - True if loading, false otherwise.
     */
    _setLoadingState(isLoading) {
        if (this.dom.loadingIndicator) {
            this.dom.loadingIndicator.classList.toggle(QUIZ_CONFIG.CSS_CLASSES.HIDDEN, !isLoading);
        }

        const hasBanks = QUIZ_CONFIG.QUESTION_BANKS && QUIZ_CONFIG.QUESTION_BANKS.length > 0;

        if (this.dom.startFromSelectBtn) {
             this.dom.startFromSelectBtn.disabled = isLoading || !hasBanks;
        }
        if (this.dom.questionBankSelect) {
             this.dom.questionBankSelect.disabled = isLoading || !hasBanks;
        }

        if (this.dom.startFromFileBtn) this.dom.startFromFileBtn.disabled = isLoading;
        if (this.dom.jsonFile) this.dom.jsonFile.disabled = isLoading;
    }

    /**
     * Shows a specific quiz section and hides others.
     * @param {HTMLElement} sectionToShow - The section element to display.
     */
    _showSection(sectionToShow) {
        const sections = [
            this.dom.uploadSection,
            this.dom.quizInterface,
            this.dom.resultsSection,
            this.dom.reviewSection
        ];
        sections.forEach(section => {
            if (section) section.classList.add(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);
        });
        if (sectionToShow) {
            sectionToShow.classList.remove(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);
            sectionToShow.classList.add(QUIZ_CONFIG.CSS_CLASSES.FADE_IN);
        }
    }

    /**
     * Shuffles an array in place using Fisher-Yates algorithm.
     * @param {Array} array - The array to shuffle.
     */
    _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Loads and validates questions from JSON data.
     * @param {object} jsonData - The parsed JSON object.
     */
    loadQuestions(jsonData) {
        this._validateQuizData(jsonData);
        this.quizTopic = jsonData.topic || "Quiz Questions";
        this.questions = [...jsonData.questions];
        this._shuffleArray(this.questions);

        this._updateTotalQuestionsDisplay();
    }

    /**
     * Validates the structure of the quiz JSON data.
     * @param {object} jsonData - The JSON data to validate.
     * @throws {Error} If validation fails.
     */
    _validateQuizData(jsonData) {
        // Bolt: Minimal validation on main thread. Deep validation is offloaded to json-worker.js.
        if (!jsonData || typeof jsonData !== 'object') {
            throw new Error('Invalid JSON: Data must be an object.');
        }
        if (!Array.isArray(jsonData.questions)) {
            throw new Error('Invalid JSON: "questions" must be an array.');
        }
        if (jsonData.questions.length === 0) {
            throw new Error('Invalid JSON: "questions" array cannot be empty.');
        }
    }

    /**
     * Updates all displays of total question count.
     */
    _updateTotalQuestionsDisplay() {
        const total = this.questions.length;
        const elementsToUpdate = [
            this.dom.totalQuestions,
            this.dom.totalQuestionsDisplay,
            this.dom.finalTotalQuestions,
            this.dom.reviewTotalQuestions
        ];
        elementsToUpdate.forEach(el => { if (el) el.textContent = total; });
        if (this.dom.progressBar) this.dom.progressBar.setAttribute('aria-valuemax', total || 100);
    }

    /**
     * Starts the quiz after questions are loaded.
     */
    startQuiz() {
        this.isQuizActive = true;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this._updateCurrentScoreDisplay();
        this._showQuestion();
    }

    /**
     * Displays the current question.
     */
    _showQuestion() {
        if (this.currentQuestionIndex >= this.questions.length) {
            this.endQuiz();
            return;
        }
        const question = this.questions[this.currentQuestionIndex];
        this.timeLeft = question.time || QUIZ_CONFIG.DEFAULT_QUESTION_TIME;

        this._startTimer();
        this._updateProgress();
        this._renderQuestion(question);
        if (this.dom.currentQuestionNum) this.dom.currentQuestionNum.textContent = this.currentQuestionIndex + 1;
        if (this.dom.explanationContainer) {
            this.dom.explanationContainer.classList.add(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);
            this.dom.explanationContainer.textContent = '';
        }

        const questionHeading = this.currentQuestionHeading;
        if (questionHeading) {
            questionHeading.focus();
        }
    }

    /**
     * Starts the timer for the current question.
     */
    _startTimer() {
        if (this.timerInterval) cancelAnimationFrame(this.timerInterval);

        const startTime = Date.now();
        const duration = this.timeLeft;
        let lastUpdateTime = startTime;

        this._updateTimerDisplay();

        const tick = () => {
            const now = Date.now();

            if (now - lastUpdateTime >= QUIZ_CONFIG.TIMER_INTERVAL) {
                const elapsed = Math.floor((now - startTime) / 1000);
                this.timeLeft = duration - elapsed;

                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this._updateTimerDisplay();
                    this.timerInterval = null;
                    this._handleTimeExpired();
                    return;
                } else {
                    this._updateTimerDisplay();
                }
                lastUpdateTime = now;
            }

            this.timerInterval = requestAnimationFrame(tick);
        };

        this.timerInterval = requestAnimationFrame(tick);
    }

    /**
     * Updates the timer display.
     */
    _updateTimerDisplay() {
        if (this.dom.timer) this.dom.timer.textContent = `Time left: ${this.timeLeft}s`;
    }

    _handleTimeExpired() {
        this.handleAnswer(-1);
    }

    /**
     * Handles a user's answer selection.
     * @param {number} selectedIndex - The index of the selected choice.
     */
    handleAnswer(selectedIndex) {
        // Sentinel: Prevent double-answer state corruption and timer exploits
        if (this.userAnswers.length > this.currentQuestionIndex) return;

        if (this.timerInterval) cancelAnimationFrame(this.timerInterval);
        const question = this.questions[this.currentQuestionIndex];

        // Sentinel: Validate index to prevent out-of-bounds errors
        if (selectedIndex !== -1 && (selectedIndex < 0 || selectedIndex >= question.choices.length)) {
            console.error("Invalid choice index:", selectedIndex);
            return;
        }

        const isCorrect = selectedIndex === question.correctAnswer;

        this.userAnswers.push({
            selected: selectedIndex,
            isCorrect: isCorrect
        });

        if (isCorrect) {
            this.score++;
        }
        this._updateCurrentScoreDisplay();
        this._showFeedback(selectedIndex, isCorrect, question);
    }

    /**
     * Shows feedback (correct/incorrect) and explanation.
     * @param {number} selectedIndex - The user's selected answer index.
     * @param {boolean} isCorrect - Whether the answer was correct.
     * @param {object} question - The current question object.
     */
    _showFeedback(selectedIndex, isCorrect, question) {
        const buttons = this.currentChoiceButtons || [];
        buttons.forEach((btn, index) => {
            btn.disabled = true;
            if (index === question.correctAnswer) {
                btn.classList.add(QUIZ_CONFIG.CSS_CLASSES.CORRECT_ANSWER);
            } else {
                btn.classList.add(QUIZ_CONFIG.CSS_CLASSES.INCORRECT_ANSWER);
                if (index === selectedIndex) {
                    btn.classList.add(QUIZ_CONFIG.CSS_CLASSES.USER_SELECTED);
                }
            }
        });

        let feedbackHeadingText = '';
        if (selectedIndex === -1) feedbackHeadingText = 'Time Expired!';
        else if (isCorrect) feedbackHeadingText = 'Correct!';
        else feedbackHeadingText = 'Incorrect.';

        if (this.dom.explanationContainer) {
            this.dom.explanationContainer.textContent = ''; // Clear previous content

            const heading = document.createElement('h5');
            heading.className = 'h6';
            heading.id = 'feedbackHeading';
            heading.tabIndex = -1;
            heading.textContent = feedbackHeadingText;
            this.dom.explanationContainer.appendChild(heading);

            if (!isCorrect) {
                const correctAnswerText = question.choices[question.correctAnswer];
                const correctAnswerLabel = String.fromCharCode(QUIZ_CONFIG.CHAR_CODE_A + question.correctAnswer);

                const correctP = document.createElement('p');
                correctP.className = 'text-success fw-bold mb-2';
                correctP.textContent = `Correct Answer: ${correctAnswerLabel}. ${correctAnswerText}`;
                this.dom.explanationContainer.appendChild(correctP);
            }

            const explanationP = document.createElement('p');
            explanationP.textContent = question.explanation;
            this.dom.explanationContainer.appendChild(explanationP);

            const continueBtn = document.createElement('button');
            continueBtn.id = 'continueBtn';
            continueBtn.className = 'btn btn-primary mt-2';
            continueBtn.textContent = 'Continue';
            continueBtn.onclick = () => this.nextQuestion();
            this.dom.explanationContainer.appendChild(continueBtn);

            this.dom.explanationContainer.classList.remove(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);

            // Focus the heading so screen reader users hear the result first
            heading.focus();
        }
    }

    /**
     * Updates the current score and percentage display.
     */
    _updateCurrentScoreDisplay() {
        const totalQuestions = this.questions.length;
        const percentage = totalQuestions > 0 ? Math.round((this.score / totalQuestions) * 100) : 0;
        if (this.dom.currentScoreValue) this.dom.currentScoreValue.textContent = this.score;
        if (this.dom.currentScorePercentage) this.dom.currentScorePercentage.textContent = percentage;
    }

    /**
     * Moves to the next question or ends the quiz.
     */
    nextQuestion() {
        this.currentQuestionIndex++;
        if (this.currentQuestionIndex < this.questions.length) {
            this._showQuestion();
        } else {
            this.endQuiz();
        }
    }

    /**
     * Ends the current quiz and shows results.
     */
    endQuiz() {
        this.isQuizActive = false;
        if (this.timerInterval) cancelAnimationFrame(this.timerInterval);
        this._showSection(this.dom.resultsSection);
        if (this.dom.resultsSection) this.dom.resultsSection.focus();

        const total = this.questions.length;
        const percentage = total > 0 ? Math.round((this.score / total) * 100) : 0;

        if (this.dom.finalScoreValue) this.dom.finalScoreValue.textContent = this.score;
        if (this.dom.finalScorePercentage) this.dom.finalScorePercentage.textContent = percentage;

        if (this.dom.finalPercentageBar) {
            this.dom.finalPercentageBar.style.transform = `scaleX(${percentage / 100})`;
            this.dom.finalPercentageBar.setAttribute('aria-valuenow', percentage);
        }
        if (this.dom.finalPercentageText) {
            this.dom.finalPercentageText.textContent = `${percentage}%`;
        }
    }

    /**
     * Renders the current question and its choices.
     * @param {object} question - The question object to render.
     */
    _renderQuestion(question) {
        this.currentQuestionHeading = null;
        if (!question || !question.choices) {
            console.error("Attempted to render invalid question:", question);
            if (this.dom.questionContainer) {
                this.dom.questionContainer.textContent = '';
                const errorP = document.createElement('p');
                errorP.className = 'text-danger';
                errorP.textContent = "Error: Could not load question.";
                this.dom.questionContainer.appendChild(errorP);
            }
            return;
        }

        if (this.dom.questionContainer) {
            this.dom.questionContainer.textContent = ''; // Clear previous content
            const fragment = document.createDocumentFragment();

            // Create heading
            const heading = document.createElement('h4');
            heading.className = 'mb-4 h5';
            heading.id = 'questionTextLabel';
            heading.tabIndex = -1;
            heading.textContent = question.questionText;
            this.currentQuestionHeading = heading;
            fragment.appendChild(heading);

            // Create choices container
            const choicesContainer = document.createElement('div');
            choicesContainer.className = 'row g-3';
            choicesContainer.setAttribute('role', 'group');
            choicesContainer.setAttribute('aria-labelledby', 'questionTextLabel');

            // Create choice buttons
            this.currentChoiceButtons = [];
            question.choices.forEach((choice, index) => {
                const col = document.createElement('div');
                col.className = 'col-md-6';

                const btn = document.createElement('button');
                btn.className = 'choice-btn btn btn-outline-primary w-100 p-3 mb-2';
                btn.dataset.index = index;
                btn.textContent = `${String.fromCharCode(QUIZ_CONFIG.CHAR_CODE_A + index)}. ${choice}`;

                this.currentChoiceButtons.push(btn);
                col.appendChild(btn);
                choicesContainer.appendChild(col);
            });

            fragment.appendChild(choicesContainer);
            this.dom.questionContainer.appendChild(fragment);

            // Add event listeners to newly created choice buttons
            // Optimized: Using event delegation on questionContainer instead of individual listeners
        }
    }


    /**
     * Updates the progress bar and text.
     */
    _updateProgress() {
        const totalQuestions = this.questions.length;
        const currentQNum = this.currentQuestionIndex + 1;
        const progressPercentage = totalQuestions > 0 ? (currentQNum / totalQuestions) * 100 : 0;

        if (this.dom.progressBar) {
            this.dom.progressBar.style.transform = `scaleX(${progressPercentage / 100})`;
            this.dom.progressBar.setAttribute('aria-valuenow', currentQNum);
            if (this.dom.questionProgressText && this.dom.questionProgressText.textContent) {
                 this.dom.progressBar.setAttribute('aria-valuetext', this.dom.questionProgressText.textContent);
            } else {
                this.dom.progressBar.setAttribute('aria-valuetext', `Question ${currentQNum} of ${totalQuestions}`);
            }
        }
    }

    /**
     * Shows the review section with all answered questions.
     */
    showReview() {
        this._showSection(this.dom.reviewSection);
        if (this.dom.reviewSection) this.dom.reviewSection.focus();

        const total = this.questions.length;
        const percentage = total > 0 ? Math.round((this.score / total) * 100) : 0;

        if (this.dom.reviewScoreValue) this.dom.reviewScoreValue.textContent = this.score;
        if (this.dom.reviewScorePercentage) this.dom.reviewScorePercentage.textContent = percentage;

        if (this.dom.reviewQuestionsContainer) {
            this.dom.reviewQuestionsContainer.textContent = ''; // Clear previous content

            if (this.userAnswers.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'text-center text-muted my-4';
                emptyMsg.textContent = "No questions were answered.";
                this.dom.reviewQuestionsContainer.appendChild(emptyMsg);
            } else {
                const fragment = document.createDocumentFragment();
                this.userAnswers.forEach((answerData, index) => {
                    const node = this._buildReviewQuestionNode(answerData, index);
                    fragment.appendChild(node);
                });
                this.dom.reviewQuestionsContainer.appendChild(fragment);
            }
        }
    }

    /**
     * Builds DOM element for a single question in the review section.
     * @param {object} answerData - The user's answer data for a question.
     * @param {number} index - The index of the question.
     * @returns {HTMLElement} The article element for the review question.
     */
    _buildReviewQuestionNode(answerData, index) {
        const article = document.createElement('article');
        article.className = `card mb-3 review-card ${QUIZ_CONFIG.CSS_CLASSES.FADE_IN}`;
        // Palette: Add data attribute for filtering
        article.dataset.isCorrect = String(answerData.isCorrect);

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';
        article.appendChild(cardBody);

const originalQuestion = this.questions[index];
        if (!originalQuestion || !originalQuestion.choices) {
            const errorP = document.createElement('p');
            errorP.className = 'text-danger';
            errorP.textContent = `Error: Review data for question ${index + 1} is incomplete.`;
            cardBody.appendChild(errorP);
            return article;
        }

        // Question Heading
        const heading = document.createElement('h3');
        heading.className = 'card-title h6';
        heading.textContent = `Question ${index + 1}`;
        cardBody.appendChild(heading);

        // Question Text
        const qText = document.createElement('p');
        qText.className = 'card-text';
qText.textContent = originalQuestion.questionText;
        cardBody.appendChild(qText);

        // Your Answer Status
        const selectedChoiceText = answerData.selected !== -1
            ? (originalQuestion.choices[answerData.selected] || "Invalid selection index")
            : "Not answered (Time out)";

        const answerStatusP = document.createElement('p');

        if (answerData.selected === -1) {
             answerStatusP.className = 'text-danger';
             answerStatusP.textContent = "You ran out of time.";
        } else {
             if (answerData.isCorrect) answerStatusP.className = 'text-success';
             else answerStatusP.className = 'text-danger';
             answerStatusP.textContent = `Your answer: ${String.fromCharCode(QUIZ_CONFIG.CHAR_CODE_A + answerData.selected)}. ${selectedChoiceText}`;
        }
        cardBody.appendChild(answerStatusP);

        // Correct Answer Display
        if (!answerData.isCorrect) {
     const correctChoiceText = originalQuestion.choices[originalQuestion.correctAnswer] || "Invalid correct index";
             const correctP = document.createElement('p');
             correctP.className = 'text-success';
     correctP.textContent = `Correct answer: ${String.fromCharCode(QUIZ_CONFIG.CHAR_CODE_A + originalQuestion.correctAnswer)}. ${correctChoiceText}`;
             cardBody.appendChild(correctP);
        }

        // Explanation
        const explanationP = document.createElement('p');
        explanationP.className = 'text-muted small mt-2';

        const em = document.createElement('em');
em.textContent = `Explanation: ${originalQuestion.explanation}`;
        explanationP.appendChild(em);

        cardBody.appendChild(explanationP);

        return article;
    }

    /**
     * Filters review cards based on correctness.
     * @param {string} mode - 'all' or 'incorrect'.
     */
    _filterReview(mode) {
        if (!this.dom.reviewQuestionsContainer) return;

        const cards = this.dom.reviewQuestionsContainer.querySelectorAll('.review-card');
        cards.forEach(card => {
            if (mode === 'all') {
                card.classList.remove('hidden-by-filter');
            } else if (mode === 'incorrect') {
                const isCorrect = card.dataset.isCorrect === 'true';
                if (isCorrect) {
                    card.classList.add('hidden-by-filter');
                } else {
                    card.classList.remove('hidden-by-filter');
                }
            }
        });

        // Update button states
        if (this.dom.reviewFilterAll && this.dom.reviewFilterIncorrect) {
            if (mode === 'all') {
                this.dom.reviewFilterAll.classList.replace('btn-outline-primary', 'btn-primary');
                this.dom.reviewFilterAll.setAttribute('aria-pressed', 'true');
                this.dom.reviewFilterIncorrect.classList.replace('btn-primary', 'btn-outline-primary');
                this.dom.reviewFilterIncorrect.setAttribute('aria-pressed', 'false');
            } else {
                this.dom.reviewFilterAll.classList.replace('btn-primary', 'btn-outline-primary');
                this.dom.reviewFilterAll.setAttribute('aria-pressed', 'false');
                this.dom.reviewFilterIncorrect.classList.replace('btn-outline-primary', 'btn-primary');
                this.dom.reviewFilterIncorrect.setAttribute('aria-pressed', 'true');
            }
        }
    }

    /**
     * Confirms and then resets the quiz (used by end-of-quiz buttons).
     */
    confirmAndResetQuiz() {
        if (window.confirm("Are you sure you want to start a new quiz? Your current results will be lost.")) {
            this.resetQuiz();
        }
    }

    /**
     * Confirms and ends the quiz early.
     */
    confirmAndEndQuiz() {
        if (window.confirm("Are you sure you want to finish the quiz now? Unanswered questions will not be scored.")) {
            this.endQuiz();
        }
    }

    /**
     * Resets the entire quiz application to its initial state.
     */
    resetQuiz() {
        this.isQuizActive = false;
        if (this.timerInterval) {
            cancelAnimationFrame(this.timerInterval);
            this.timerInterval = null;
        }

        // Reset all state variables
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this.quizTopic = '';
        this.timeLeft = 0;
        this.currentQuestionHeading = null;
        this.currentChoiceButtons = null;

        // Reset UI elements
        this._updateCurrentScoreDisplay();
        if (this.dom.progressBar) {
            this.dom.progressBar.style.transform = 'scaleX(0)';
            this.dom.progressBar.setAttribute('aria-valuenow', '0');
        }
        if (this.dom.currentQuestionNum) this.dom.currentQuestionNum.textContent = '0';
        this._updateTotalQuestionsDisplay();
        if (this.dom.timer) this.dom.timer.textContent = 'Time left: 0s';

        if (this.dom.questionContainer) this.dom.questionContainer.textContent = '';
        if (this.dom.explanationContainer) {
            this.dom.explanationContainer.textContent = '';
            this.dom.explanationContainer.classList.add(QUIZ_CONFIG.CSS_CLASSES.HIDDEN);
        }
        if (this.dom.reviewQuestionsContainer) this.dom.reviewQuestionsContainer.textContent = '';

        this._setLoadError('');
        // Reset all forms
        if (this.dom.uploadForm) this.dom.uploadForm.reset();
        if (this.dom.questionBankSelect) this.dom.questionBankSelect.selectedIndex = 0;

        this._showSection(this.dom.uploadSection);
        if (this.dom.uploadSection) this.dom.uploadSection.focus();

        // Palette: Update cache status to show newly cached items immediately
        this._updateCacheStatus();
    }
}

// --- Initialize the Quiz ---
document.addEventListener('DOMContentLoaded', () => {
    const quiz = new QuizManager();
});

// --- Theme Toggle Logic ---
(function() {
    const THEME_KEY = 'pm-cert-quiz-theme';
    // Use documentElement to match theme.js
    const root = document.documentElement;
    const btn = document.getElementById('themeToggleBtn');

    function setTheme(mode, persist = true) {
        // Palette: Consolidate multiple theme-color meta tags to prevent conflicts
        const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
        let themeMeta = null;

        if (themeMetas.length > 0) {
            themeMeta = themeMetas[0];
            themeMeta.removeAttribute('media');
            // Remove any duplicate/conflicting tags
            for (let i = 1; i < themeMetas.length; i++) {
                themeMetas[i].remove();
            }
        }

        if (mode === 'dark') {
            root.classList.add('dark-mode');
            btn.setAttribute('aria-label', 'Switch to light mode');
            btn.setAttribute('aria-pressed', 'true');
            if (themeMeta) themeMeta.content = '#000000';
        } else {
            root.classList.remove('dark-mode');
            btn.setAttribute('aria-label', 'Switch to dark mode');
            btn.setAttribute('aria-pressed', 'false');
            if (themeMeta) themeMeta.content = '#f8f9fa';
        }
        if (persist) localStorage.setItem(THEME_KEY, mode);
    }

    // Initialize state based on what theme.js applied (eliminating FOUC)
    const isDark = root.classList.contains('dark-mode');
    setTheme(isDark ? 'dark' : 'light', false);

    btn.addEventListener('click', function() {
        const isDark = root.classList.contains('dark-mode');
        setTheme(isDark ? 'light' : 'dark');
    });
})();

// --- Service Worker Registration for PWA ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

```

### `index.html`
- **Role**: Entry Point / App Shell
- **Why it matters**: Network boundaries (CSP), layout, entry point.
- **Inclusion mode**: Full

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:;">
    <title>PM Certification Quiz - Free Practice</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" integrity="sha384-XGjxtQfXaH2tnPFa9x+ruJTuLE3Aa6LhHSWRr1XeTyhezb4abCG4ccI5AkVDxqC+" crossorigin="anonymous">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" href="app.js" as="script">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <script src="theme.js"></script>
    <link rel="stylesheet" href="style.css">
    <meta name="description" content="Free project management certification exam practice with quizzes covering all 8 performance domains. Study offline with timed questions and detailed explanations.">
    <link rel="manifest" href="./manifest.webmanifest">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f9fa">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="PM Quiz">

    <!-- Social Sharing Metadata -->
    <meta property="og:title" content="PM Certification Quiz - Free Practice">
    <meta property="og:description" content="Free project management certification exam practice with quizzes covering all 8 performance domains. Study offline with timed questions.">
    <meta property="og:image" content="./icons/icon-512.png">
    <meta property="og:url" content=".">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="./icons/icon-512.png">

    <link rel="apple-touch-icon" sizes="192x192" href="./icons/icon-192.png">
    <link rel="apple-touch-icon" sizes="512x512" href="./icons/icon-512.png">
    <link rel="icon" type="image/png" href="./icons/icon-192.png">
    <!--
      NOTE: When deploying to GitHub Pages, all asset paths (manifest, icons, service worker)
      must be relative to the repo root. This ensures correct loading when the site is
      served from a subdirectory.
    -->
</head>
<body>
    <header class="d-flex align-items-center py-2 px-3 bg-transparent">
        <div class="flex-grow-1"></div> <!-- Left spacer -->
        <h1 class="h4 mb-0">PM Certification Quiz</h1> <!-- Centered title -->
        <div class="flex-grow-1 d-flex"> <!-- Right spacer with button -->
            <button id="themeToggleBtn" class="btn ms-auto" aria-pressed="false" aria-label="Toggle day/night mode">
                <span id="themeToggleIcon" aria-hidden="true">
                    <i id="iconSun" class="bi bi-sun"></i>
                    <i id="iconMoon" class="bi bi-moon"></i>
                </span>
            </button>
        </div>
    </header>
    <main class="container py-4 quiz-container" role="main">
        <section id="uploadSection" class="card p-4 mb-4 fade-in" tabindex="-1">
            <h2 class="mb-4 text-center">Load Quiz Questions</h2>

            <form id="selectBankForm" class="mb-3">
                <div class="mb-3">
                    <label for="questionBankSelect" class="form-label">Option 1: Select Question Bank</label>
                    <select id="questionBankSelect" class="form-select" aria-describedby="selectHelp">
                        </select>
                    <div id="selectHelp" class="form-text">Choose a predefined question bank.</div>
                </div>
                <button type="submit" id="startFromSelectBtn" class="btn btn-success w-100">Start Quiz from Selection</button>
            </form>

            <div class="divider-text">OR</div>

            <form id="uploadForm" class="mb-3">
                <div class="mb-3">
                    <label for="jsonFile" class="form-label">Option 2: Upload JSON File</label>
                    <input type="file" id="jsonFile" class="form-control" accept=".json" aria-describedby="fileHelp">
                    <div id="fileHelp" class="form-text">Select a quiz file in JSON format from your device.</div>
                </div>
                <button type="submit" id="startFromFileBtn" class="btn btn-primary w-100">Start Quiz from File</button>
            </form>

            <div id="jsonLoadError" class="text-danger mt-3" role="alert" aria-live="assertive"></div>
            <div id="loadingIndicator" class="d-none text-center mt-3" role="status">
                <div class="loading-spinner" aria-hidden="true"></div>
                <p>Loading quiz...</p>
            </div>
        </section>

        <section id="quizInterface" class="d-none fade-in" aria-labelledby="quizTopic" tabindex="-1">
            <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <h3 id="quizTopic" class="mb-0 h4"></h3>
                <div class="score-display" aria-live="polite">
                    <div class="d-flex justify-content-between">
                        <span class="progress-label">Score:</span>
                        <span>
                            <strong id="currentScoreValue">0</strong>/<span id="totalQuestions">0</span>
                            (<strong id="currentScorePercentage">0</strong>%)
                        </span>
                    </div>
                </div>
            </div>

            <div class="progress-container" aria-label="Quiz Progress">
                <div class="flex-grow-1">
                    <div class="progress mb-1 progress-sm">
                        <div id="progressBar" class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                             <span class="visually-hidden">Quiz progress</span>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between">
                        <small id="questionProgressText">Question <span id="currentQuestionNum">0</span> of <span id="totalQuestionsDisplay">0</span></small>
                        <small id="timer" class="text-muted" role="timer">Time left: 0s</small>
                    </div>
                </div>
            </div>

            <div id="questionContainer" class="card p-4 mb-4" aria-live="polite" aria-atomic="true">
                </div>
            <div id="explanationContainer" class="explanation-box d-none" aria-live="polite" aria-atomic="true">
                </div>

            <button id="finishQuizBtn" class="btn btn-info w-100 mt-4">Finish Quiz & See Results</button>
            <button id="resetQuizDuringQuizBtn" class="btn btn-danger w-100 mt-2">Reset Quiz & Load New</button>

        </section>

        <section id="resultsSection" class="d-none card p-4 fade-in" aria-labelledby="resultsHeading" tabindex="-1">
            <h2 id="resultsHeading" class="mb-4 text-center">Quiz Results</h2>
            <div class="mb-4" aria-live="polite">
                <div class="d-flex justify-content-between mb-2">
                    <h4 class="mb-0 h5">Final Score:</h4>
                    <h4 class="mb-0 h5">
                        <strong id="finalScoreValue">0</strong>/<span id="finalTotalQuestions">0</span>
                        (<strong id="finalScorePercentage">0</strong>%)
                    </h4>
                </div>
                <div class="progress mt-3 position-relative progress-lg" aria-label="Final score percentage">
                    <div id="finalPercentageBar" class="progress-bar" role="progressbar"></div>
                    <div id="finalPercentageText" class="position-absolute w-100 h-100 d-flex justify-content-center align-items-center">0%</div>
                </div>
            </div>
            <button id="reviewBtn" class="btn btn-info mb-3 w-100">Review Answers</button>
            <button id="restartQuizBtnResults" class="btn btn-primary w-100">Take New Quiz</button> </section>

        <section id="reviewSection" class="d-none card p-4 fade-in" aria-labelledby="reviewHeading" tabindex="-1">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2 id="reviewHeading" class="mb-0 h3">Answer Review</h2>
                <div class="score-display">
                    <div class="d-flex justify-content-between">
                        <span class="progress-label">Final Score:</span>
                        <span>
                            <strong id="reviewScoreValue">0</strong>/<span id="reviewTotalQuestions">0</span>
                            (<strong id="reviewScorePercentage">0</strong>%)
                        </span>
                    </div>
                </div>
            </div>

            <div id="reviewFilterControls" class="d-flex justify-content-center gap-2 mb-3" role="group" aria-label="Review Filters">
                <button id="reviewFilterAll" class="btn btn-sm btn-primary" aria-pressed="true">Show All</button>
                <button id="reviewFilterIncorrect" class="btn btn-sm btn-outline-primary" aria-pressed="false">Show Incorrect Only</button>
            </div>

            <div id="reviewQuestionsContainer" aria-live="polite">
                </div>
            <button id="restartQuizBtnReview" class="btn btn-primary mt-4 w-100">Take New Quiz</button> </section>
    </main>

    <footer class="text-center mt-4 mb-4 text-muted small">v1.3.56</footer>

    <script src="app.js"></script>
</body>
</html>

```

### `json-worker.js`
- **Role**: Background Data Processor
- **Why it matters**: Data validation, concurrency, DoS protection.
- **Inclusion mode**: Full

```js
/*
 * Worker for processing JSON streams off the main thread.
 * Handles reading, size limit enforcement, decoding, parsing, AND validation.
 * Returns data in chunks to prevent UI blocking during transfer.
 */

// Helper: Strict validation logic (moved from app.js to offload main thread)
function validateQuizData(jsonData, config) {
    if (!jsonData || typeof jsonData !== 'object') {
        throw new Error('Invalid JSON: Data must be an object.');
    }
    if (jsonData.hasOwnProperty('topic') && typeof jsonData.topic !== 'string') {
        throw new Error('Invalid JSON: If "topic" is present, it must be a string.');
    }
    if (!Array.isArray(jsonData.questions)) {
        throw new Error('Invalid JSON: "questions" must be an array.');
    }
    if (jsonData.questions.length === 0) {
        throw new Error('Invalid JSON: "questions" array cannot be empty.');
    }

    // Sentinel: Track unique questions to prevent duplicates
    const uniqueQuestions = new Set();
    const minChoices = (config && config.minChoices) ? config.minChoices : 2;

    for (let index = 0; index < jsonData.questions.length; index++) {
        const q = jsonData.questions[index];
        const qNum = index + 1;

        if (typeof q.questionText !== 'string' || !q.questionText.trim()) {
            throw new Error(`Question ${qNum}: "questionText" must be a non-empty string.`);
        }

        // Sentinel: Detect duplicate questions
        const questionText = q.questionText.trim();
        if (uniqueQuestions.has(questionText)) {
            throw new Error(`Question ${qNum}: Duplicate question text detected.`);
        }
        uniqueQuestions.add(questionText);

        if (!Array.isArray(q.choices) || q.choices.length < minChoices) {
            throw new Error(`Question ${qNum}: Must have at least ${minChoices} choices.`);
        }

        // Bolt: Optimized single-pass validation for choices (types, empty, duplicates)
        const uniqueChoices = new Set();
        for (const choice of q.choices) {
            if (typeof choice !== 'string' || !choice.trim()) {
                throw new Error(`Question ${qNum}: All choices must be non-empty strings.`);
            }
            const trimmed = choice.trim();
            if (uniqueChoices.has(trimmed)) {
                throw new Error(`Question ${qNum}: Duplicate choices detected.`);
            }
            uniqueChoices.add(trimmed);
        }

        if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer >= q.choices.length) {
            throw new Error(`Question ${qNum}: "correctAnswer" index is invalid or out of bounds.`);
        }
        if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
            throw new Error(`Question ${qNum}: "explanation" must be a non-empty string.`);
        }
        if (q.hasOwnProperty('time') && (typeof q.time !== 'number' || q.time <= 0)) {
            throw new Error(`Question ${qNum}: If "time" is present, it must be a positive number.`);
        }
    }
}

self.onmessage = async (e) => {
    const { type, stream, limit, config } = e.data;

    if (type === 'processStream') {
        try {
            let receivedLength = 0;
            let sizeLimitExceeded = false;

            const countingStream = new TransformStream({
                transform(chunk, controller) {
                    receivedLength += chunk.byteLength;
                    if (limit && receivedLength > limit) {
                        sizeLimitExceeded = true;
                        controller.error(new Error(`File size exceeds limit`));
                    } else {
                        controller.enqueue(chunk);
                    }
                }
            });

            let data;
            try {
                // OPTIMIZATION: Parse directly from stream to avoid large string allocation.
                // Verified ~50% faster than manual chunk accumulation with 5MB JSON data.
                data = await new Response(stream.pipeThrough(countingStream)).json();
            } catch (error) {
                if (sizeLimitExceeded) {
                    throw new Error(`File size exceeds ${Math.floor(limit / 1024 / 1024)}MB limit.`);
                }
                throw error;
            }

            // Sentinel: Validate data structure and content off-main-thread
            validateQuizData(data, config);

            // Send metadata (excluding questions array)
            const { questions, ...meta } = data;
            self.postMessage({ type: 'meta', data: meta });

            // Send questions in chunks to allow UI updates between batches
            if (questions && Array.isArray(questions)) {
                const chunkSize = 500;
                for (let i = 0; i < questions.length; i += chunkSize) {
                    const chunk = questions.slice(i, i + chunkSize);
                    self.postMessage({ type: 'chunk', data: chunk });
                }
            }

            self.postMessage({ type: 'done' });

        } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
        }
    }
};

```

### `service-worker.js`
- **Role**: PWA Offline Manager
- **Why it matters**: Caching strategies, network interceptor.
- **Inclusion mode**: Full

```js
const CACHE_NAME = 'selfquiz-cache-v1.3.56';
const ASSETS = [
  './',
  './index.html',
  './theme.js',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './json-worker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Helper to limit cache size (LRU)
async function trimCache(cacheNameOrInstance, maxItems) {
  let cache;
  if (typeof cacheNameOrInstance === 'string') {
    cache = await caches.open(cacheNameOrInstance);
  } else {
    cache = cacheNameOrInstance;
  }
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    // Optimization: Delete concurrently (approx 3x faster than serial loop)
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, 'selfquiz-data-v1', 'selfquiz-fonts-v1'];
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => !allowedCaches.includes(key)).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  // Navigation strategy: Return App Shell (index.html)
  // Ensures offline access even with query parameters (e.g., ?source=pwa)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(response => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  // Runtime caching for quiz data (JSON files) - Stale-While-Revalidate
  if (event.request.url.endsWith('.json')) {
    const fetchPromise = fetch(event.request).then(async networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open('selfquiz-data-v1');
        const responseToCache = networkResponse.clone();
        // Bolt: Delete first to ensure 'put' moves the key to the end (LRU behavior)
        await cache.delete(event.request);
        await cache.put(event.request, responseToCache);
        await trimCache(cache, 10);
      }
      return networkResponse;
    }).catch(() => {
      // Network failed, nothing to do
    });

    event.waitUntil(fetchPromise);

    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Runtime caching for fonts (Cache First)
  if (event.request.destination === 'font') {
    const fontFetchPromise = caches.match(event.request.url).then(async cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      const networkResponse = await fetch(event.request);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open('selfquiz-fonts-v1');
        // Bolt: Delete first to ensure 'put' moves the key to the end (LRU behavior)
        await cache.delete(event.request.url);
        await cache.put(event.request.url, networkResponse.clone());
        await trimCache(cache, 5);
      }
      return networkResponse;
    });

    event.waitUntil(fontFetchPromise);
    event.respondWith(fontFetchPromise);
    return;
  }

  // Default strategy for other assets (Cache First)
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

```

### `style.css`
- **Role**: Global Styling
- **Why it matters**: UX/accessibility, mobile physics, print styles.
- **Inclusion mode**: Full

```css
:root {
    /* Light Mode Variables (Default) */
    --primary-background: #f8f9fa;
    --secondary-background: #fff;
    --tertiary-background: #e9ecef;
    --primary-text-color: #212529;
    --secondary-text-color: #343a40;
    --primary-purple-accent: #0a58ca;
    --primary-purple-hover: #0b5ed7;
    --primary-purple-active: #0a58ca;
    --primary-purple-text: #fff;
    --secondary-emerald-accent: #0f5132;
    --secondary-emerald-hover: #157347;
    --secondary-emerald-active: #146c43;
    --secondary-emerald-text: #fff;
    --highlight-gold-accent: #ffc107;
    --highlight-gold-text: #212529;
    --danger-red-accent: #dc3545;
    --danger-red-text: #fff;
    --focus-ring-color: #0d6efd;
    --card-shadow: 0 4px 8px rgba(0,0,0,0.1);
    --border-radius: 0.375rem;
    --bs-border-radius: var(--border-radius);
    --bs-body-font-family: 'Inter', 'Segoe UI', 'Roboto', 'Arial', sans-serif;
}
.dark-mode {
    /* Dark Mode Variables (Override) */
    --primary-background: #000000;
    --secondary-background: #121212;
    --tertiary-background: #222222;
    --primary-text-color: #F0F0F0;
    --secondary-text-color: #C0C0C0;
    --primary-purple-accent: #8E24AA;
    --primary-purple-hover: #7A1F97;
    --primary-purple-active: #6B1B82;
    --primary-purple-text: #F0F0F0;
    --secondary-emerald-accent: #00695C;
    --secondary-emerald-hover: #005c50;
    --secondary-emerald-active: #004d43;
    --secondary-emerald-text: #F0F0F0;
    --highlight-gold-accent: #FFCA28;
    --highlight-gold-text: #1A1A1A;
    --danger-red-accent: #C62828;
    --danger-red-text: #F0F0F0;
    --focus-ring-color: #FFCA28;
    --card-shadow: 0 4px 8px rgba(0,0,0,0.2);
}
/* Specific Dark Mode Overrides */
.dark-mode .text-muted,
.dark-mode .form-text,
.dark-mode small,
.dark-mode .progress-label,
.dark-mode .card-title,
.dark-mode label,
.dark-mode .form-label {
    color: var(--secondary-text-color) !important;
    opacity: 1 !important;
}

html, body, .dark-mode html, .dark-mode body {
    background: var(--primary-background) !important;
    color: var(--primary-text-color);
    font-family: var(--bs-body-font-family);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
/* Mobile Physics: Prevent double-tap zoom on interactive elements */
a, .btn, .choice-btn, input, select, textarea, button, label {
    touch-action: manipulation;
}
body {
    min-height: 100vh;
}
.quiz-container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
}
.card {
    background: var(--secondary-background);
    color: var(--primary-text-color);
    border-radius: var(--border-radius);
    box-shadow: var(--card-shadow);
    border: none;
}
.score-display {
    background: var(--tertiary-background);
    color: var(--primary-text-color);
    border-radius: var(--border-radius);
    padding: 10px 15px;
    text-align: center;
    min-width: 220px;
    border: 1px solid var(--secondary-background);
}
.progress-container {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
}
.progress-label {
    font-weight: 600;
    color: var(--secondary-text-color);
}
.progress {
    background: var(--tertiary-background);
    border-radius: 6px;
}
.progress-bar {
    background: var(--primary-purple-accent);
    color: var(--primary-purple-text);
    font-weight: 600;
    transition: transform 0.5s;
    transform-origin: left;
    will-change: transform;
}
.divider-text {
    text-align: center;
    margin: 1rem 0;
    font-weight: 500;
    color: var(--secondary-text-color);
}
.explanation-box {
    background: var(--tertiary-background);
    border-radius: var(--border-radius);
    padding: 15px;
    margin-top: 20px;
    color: var(--primary-text-color);
    box-shadow: var(--card-shadow);
}
.choice-btn {
    background: var(--secondary-background);
    color: var(--primary-text-color);
    border: 1px solid var(--tertiary-background);
    border-radius: var(--border-radius);
    text-align: left !important;
    padding: 0.75rem 1rem !important;
    font-weight: 500;
    transition: all 0.2s ease-in-out;
    outline: none;
    touch-action: manipulation;
    white-space: normal;
    word-wrap: break-word;
}
.choice-btn:hover:not(:disabled) {
    background: var(--primary-purple-hover);
    color: var(--primary-purple-text);
    transform: translateY(-2px) scale(1.01);
}
.choice-btn:active {
    background: var(--primary-purple-active);
    color: var(--primary-purple-text);
}
.choice-btn:focus-visible {
    outline: 2.5px solid var(--focus-ring-color);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px var(--focus-ring-color);
}
.choice-btn.correct-answer {
    background: var(--secondary-emerald-accent);
    color: var(--secondary-emerald-text);
    border-color: var(--secondary-emerald-accent);
}
.choice-btn.incorrect-answer {
    background: var(--danger-red-accent);
    color: var(--danger-red-text);
    border-color: var(--danger-red-accent);
}
.choice-btn.user-selected.incorrect-answer {
    opacity: 0.7;
}
.btn {
    font-weight: 600;
    border-radius: var(--border-radius);
    letter-spacing: 0.02em;
    transition: all 0.2s;
    outline: none;
    touch-action: manipulation;
    white-space: normal;
    overflow-wrap: break-word;
}
.btn-primary {
    background: var(--primary-purple-accent);
    border-color: var(--primary-purple-accent);
    color: var(--primary-purple-text);
}
.btn-primary:hover, .btn-primary:focus {
    background: var(--primary-purple-hover);
    border-color: var(--primary-purple-hover);
    color: var(--primary-purple-text);
}
.btn-primary:active {
    background: var(--primary-purple-active);
    border-color: var(--primary-purple-active);
}
.btn-success {
    background: var(--secondary-emerald-accent);
    border-color: var(--secondary-emerald-accent);
    color: var(--secondary-emerald-text);
}
.btn-success:hover, .btn-success:focus {
    background: var(--secondary-emerald-hover);
    border-color: var(--secondary-emerald-hover);
}
.btn-success:active {
    background: var(--secondary-emerald-active);
    border-color: var(--secondary-emerald-active);
}
.btn-info {
    background: var(--highlight-gold-accent);
    border-color: var(--highlight-gold-accent);
    color: var(--highlight-gold-text);
}
.btn-info:hover, .btn-info:focus {
    background: #ffd95a;
    border-color: #ffd95a;
    color: var(--highlight-gold-text);
}
.btn-info:active {
    background: #e6b800;
    border-color: #e6b800;
}
.btn-danger {
    background: var(--danger-red-accent);
    border-color: var(--danger-red-accent);
    color: var(--danger-red-text);
}
.btn-danger:hover, .btn-danger:focus {
    background: #b71c1c;
    border-color: #b71c1c;
}
.btn-danger:active {
    background: #8b1818;
    border-color: #8b1818;
}
.loading-spinner {
    border: 4px solid var(--tertiary-background);
    border-top: 4px solid var(--primary-purple-accent);
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 20px auto;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.d-none { display: none !important; }
/* Scrollbar styling for WebKit browsers */
::-webkit-scrollbar {
    width: 10px;
    background: var(--secondary-background);
}
::-webkit-scrollbar-thumb {
    background: var(--secondary-text-color);
    border-radius: 6px;
}
::-webkit-scrollbar-thumb:hover {
    background: var(--primary-purple-accent);
}
/* Headings and typography */
h1, h2, h3, h4, h5, h6 {
    color: var(--primary-text-color);
    font-weight: 700;
    letter-spacing: 0.02em;
}
.card-title, label, .form-label, .form-text, small, .progress-label {
    color: var(--secondary-text-color);
}
.text-muted, small, .form-text {
    color: var(--secondary-text-color) !important;
    opacity: 1 !important;
}
/* Accessibility: focus ring for all interactive elements */
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 2.5px solid var(--focus-ring-color) !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 3px var(--focus-ring-color) !important;
}
/* Animation for fade-in */
.fade-in { animation: fadeInAnimation 0.2s ease-in; }
@keyframes fadeInAnimation { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* Theme Toggle Styles */
/* Default (Light) */
#themeToggleBtn .bi {
    color: var(--primary-purple-accent) !important;
    transition: color 0.2s;
}
#themeToggleBtn {
    background: var(--secondary-background) !important;
    border: 1.5px solid var(--primary-purple-accent) !important;
}

/* Dark Mode Override */
.dark-mode #themeToggleBtn .bi {
    color: var(--highlight-gold-accent) !important;
}
.dark-mode #themeToggleBtn {
    background: var(--secondary-background) !important;
    border: 1.5px solid var(--highlight-gold-accent) !important;
}

#themeToggleBtn:focus-visible {
    outline: 2.5px solid var(--focus-ring-color) !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 3px var(--focus-ring-color) !important;
}

/* Accessibility overrides for text colors to ensure WCAG AA compliance */
/* Default (Light Mode) */
.text-success { color: #146c43 !important; }
.text-danger { color: #b02a37 !important; }

/* Dark Mode Overrides */
.dark-mode .text-success { color: #66BB6A !important; }
.dark-mode .text-danger { color: #EF9A9A !important; }

/* Bolt Optimization: Virtualize rendering for long review lists */
.review-card {
    content-visibility: auto;
    contain-intrinsic-size: 1px 300px;
}
.hidden-by-filter {
    display: none !important;
}
/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}

/* --- Extracted Inline Styles --- */

.bg-transparent {
    background: transparent !important;
}
#themeToggleBtn {
    min-width: 44px;
}
#iconSun {
    font-size: 1.5rem;
    display: inline;
}
#iconMoon {
    font-size: 1.5rem;
    display: none;
}
.dark-mode #iconSun {
    display: none;
}
.dark-mode #iconMoon {
    display: inline;
}
.progress-sm {
    height: 10px;
}
.progress-lg {
    height: 25px;
}
#progressBar {
    width: 100%;
    transform: scaleX(0);
}
#finalPercentageBar {
    width: 100%;
    transform: scaleX(0);
}
#finalPercentageText {
    top: 0;
    left: 0;
    font-weight: 600;
    color: var(--primary-purple-text);
    pointer-events: none;
}

/* Print Support */
@media print {
    /* Reset colors for ink saving */
    body, .card, .score-display, .explanation-box, .review-card {
        background: #ffffff !important;
        color: #000000 !important;
        box-shadow: none !important;
        border: 1px solid #ddd !important;
    }

    /* Hide navigation and controls */
    header.d-flex,
    #themeToggleBtn,
    .btn,
    #uploadSection,
    .progress-container,
    #reviewFilterControls,
    footer {
        display: none !important;
    }

    /* Ensure review cards don't break awkwardly */
    .review-card {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 20px;
        content-visibility: visible !important;
        contain-intrinsic-size: auto !important;
    }

    /* Expand containers */
    .quiz-container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
    }
}

```

### `theme.js`
- **Role**: Theme Initialization
- **Why it matters**: Anti-FOUC logic and visual invariants.
- **Inclusion mode**: Full

```js
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

```

### `manifest.webmanifest`
- **Role**: PWA Metadata
- **Why it matters**: App installation context, shortcuts.
- **Inclusion mode**: Full

```json
{
  "name": "PM Certification Quiz",
  "short_name": "PM Quiz",
  "description": "Free Project Management Certification Practice - All 8 Performance Domains",
  "start_url": "./?source=pwa",
  "display": "standalone",
  "background_color": "#f8f9fa",
  "theme_color": "#8E24AA",
  "orientation": "portrait",
  "categories": ["education", "productivity"],
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "shortcuts": [
    {
      "name": "Upload Quiz",
      "short_name": "Upload",
      "description": "Upload a custom question bank",
      "url": "./?shortcut=upload",
      "icons": [{ "src": "icons/icon-192.png", "sizes": "192x192" }]
    },
    {
      "name": "Select Bank",
      "short_name": "Select",
      "description": "Choose a predefined question bank",
      "url": "./?shortcut=select",
      "icons": [{ "src": "icons/icon-192.png", "sizes": "192x192" }]
    }
  ]
}

```

## Summarized Files

### `.jules/steward.md`
- **Purpose**: Records design decisions, security protocols, and operational learnings.
- **Key content**:
  - Requires `textContent` over `innerHTML` for XSS prevention.
  - Requires 5MB limits and stream reading for DoS protection.
  - Requires Service Worker persistence via explicit whitelisting in activation handlers.
- **Omitted detail**: Exact prose of historical learnings.

### `README.md` & `CLAUDE.md`
- **Purpose**: Project description, tech stack overview, and AI assistant guidelines.
- **Key symbols/modules**: Describes project structure, PWA behavior, format of QuestionBank JSONs.
- **Omitted detail**: Standard feature lists and deployment instructions.

### `QuestionBanks/*.json` (e.g., `PMP_1_StakeholderPerformance.json`)
- **Purpose**: Contains the actual quiz questions for various domains.
- **Key structure**: `{ "topic": string, "questions": [ { "questionText": string, "choices": string[], "correctAnswer": number, "explanation": string, "time": number } ] }`
- **Notable dependencies**: Parsed by `json-worker.js`.
- **Omitted detail**: Hundreds of question items excluded to save space.

## Cross-File Relationships
- **Startup wiring**: `index.html` loads `<head>` assets sequentially -> `theme.js` (blocking) -> CSS -> Body -> `app.js` (deferred execution on `DOMContentLoaded`).
- **Module relationships**: `app.js` acts as the orchestrator. It offloads heavy parsing/validation to `json-worker.js` via `postMessage`. It registers `service-worker.js` for intercepting `fetch` requests.
- **API/data flow**: User selects bank / uploads file -> `app.js` gets stream/url -> `service-worker.js` intercepts (if URL) -> `app.js` sends to `json-worker.js` -> Worker validates and chunks data -> `app.js` stores in memory `this.questions`.
- **Config/env flow**: No environment variables. Configs are frozen globally in `app.js` (`QUIZ_CONFIG`).
- **Test-to-implementation mapping**: No automated tests exist. Manual test plan outlined in `CLAUDE.md`.

## Review Hotspots
- **Correctness risks**:
  - The LRU cache eviction logic in `service-worker.js` (`trimCache`) uses `Promise.all` which could fail partially.
  - State synchronization between UI variables (`timeLeft`, `currentQuestionIndex`) and `requestAnimationFrame` timers in `app.js`.
- **Security risks**:
  - Even with `textContent`, `app.js` relies heavily on DOM manipulation. Any regression to using `innerHTML` introduces XSS vulnerabilities.
  - CSP restricts `connect-src` to `'self'`, mitigating data exfiltration.
- **Performance risks**:
  - Repeated DOM additions in `_showFeedback` and `showReview` could impact low-end mobile devices, though `document.createDocumentFragment` is used.
- **State/concurrency risks**:
  - The Service Worker and Web Worker execute asynchronously. Terminating the SW during a `put` could corrupt the Cache API.
- **UX/accessibility risks**:
  - Screen reader announcements (`aria-live`) on rapidly changing elements (timers) are explicitly avoided (noted in `steward.md`), but focus management between questions could drop users.

## Packaging Notes
- **Exclusions**: Ignored `.gitignore`, `LICENSE`, `.nojekyll` as low-signal boilerplate. Ignored `icons/` binary files. Ignored `QuestionBanks/` repetitive JSON payloads.
- **Compression decisions**: The codebase is very small. All logic files (`app.js`, `service-worker.js`, `json-worker.js`) are included in `Full` because they are tightly coupled and easily fit within standard token limits. Summarized documentation.
- **Fidelity limits**: Visual fidelity relies on external Bootstrap CDNs which are not embedded. The specific questions in the JSON banks are not present for review.
- **Missing/unreadable content**: None. All core code was readable and packaged.
- **Downstream review confidence**: High. The code is complete, self-contained, and perfectly reflects the operational application minus static question data.
