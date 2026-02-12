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
    TIMER_INTERVAL: 1000,
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
                limit: QUIZ_CONFIG.MAX_FILE_SIZE
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
        };
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

        window.addEventListener('beforeunload', (e) => {
            if (this.isQuizActive) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

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

        for (const [index, q] of jsonData.questions.entries()) {
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
            if (!Array.isArray(q.choices) || q.choices.length < QUIZ_CONFIG.MIN_CHOICES_PER_QUESTION) {
                throw new Error(`Question ${qNum}: Must have at least ${QUIZ_CONFIG.MIN_CHOICES_PER_QUESTION} choices.`);
            }
            if (q.choices.some(choice => typeof choice !== 'string' || !choice.trim())) {
                 throw new Error(`Question ${qNum}: All choices must be non-empty strings.`);
            }
            // Sentinel: Detect duplicate choices which confuse users (Optimized)
            const uniqueChoices = new Set(q.choices.map(c => c.trim()));
            if (uniqueChoices.size !== q.choices.length) {
                throw new Error(`Question ${qNum}: Duplicate choices detected.`);
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
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.dom.timer) this.dom.timer.textContent = `Time left: ${this.timeLeft}s`;
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            if (this.dom.timer) this.dom.timer.textContent = `Time left: ${this.timeLeft}s`;
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this._handleTimeExpired();
            }
        }, QUIZ_CONFIG.TIMER_INTERVAL);
    }

    _handleTimeExpired() {
        this.handleAnswer(-1);
    }

    /**
     * Handles a user's answer selection.
     * @param {number} selectedIndex - The index of the selected choice.
     */
    handleAnswer(selectedIndex) {
        if (this.timerInterval) clearInterval(this.timerInterval);
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
        if (this.timerInterval) clearInterval(this.timerInterval);
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
            clearInterval(this.timerInterval);
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
    const iconSun = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');

    function setTheme(mode, persist = true) {
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (mode === 'dark') {
            root.classList.add('dark-mode');
            btn.setAttribute('aria-label', 'Switch to light mode');
            btn.setAttribute('aria-pressed', 'true');
            if (iconSun) iconSun.style.display = 'none';
            if (iconMoon) iconMoon.style.display = 'inline';
            if (themeMeta) themeMeta.content = '#000000';
        } else {
            root.classList.remove('dark-mode');
            btn.setAttribute('aria-label', 'Switch to dark mode');
            btn.setAttribute('aria-pressed', 'false');
            if (iconSun) iconSun.style.display = 'inline';
            if (iconMoon) iconMoon.style.display = 'none';
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
