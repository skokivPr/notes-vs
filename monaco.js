/**
       * --- SYSTEM CORE ---
       */
let editor;
let monacoLoaded = false;
let isAutoDetectEnabled = true;
const GITHUB_USER = "skokivPr";
const GITHUB_REPO = "json-lista";
const GITHUB_FILE = "notes.json";
window.projectsData = null;
let hasUnsavedChanges = false;
let lastSavedContent = "";
let currentLoadedFile = null; // Przechowuje informacje o aktualnie wczytanej notatce

const CustomUI = {
    toastContainer: document.querySelector(".custom-toast-container"),

    close: function (force = false) {
        const overlay = document.querySelector(".custom-modal-overlay");
        if (overlay) {
            if (force) {
                overlay.remove();
            } else {
                overlay.classList.remove("visible");
                setTimeout(() => overlay.remove(), 250);
            }
        }
    },

    createOverlay: function (isWide = false) {
        // Zamykamy tylko jeśli overlay istnieje, NIE force (z zachowaniem animacji)
        this.close(false);

        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';

        const modal = document.createElement('div');
        modal.className = `custom-modal ${isWide ? 'wide' : 'h2'}`;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Wymuszenie reflow do animacji
        overlay.offsetHeight;
        overlay.classList.add('visible');

        // Zamknij po kliknięciu w tło
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        return modal;
    },

    alert: function (title, message, type = 'info') {
        const modal = this.createOverlay();
        modal.innerHTML = `
            <h2>${title}</h2>
            <p>${message}</p>
            <div class="custom-modal-actions">
                <button class="custom-btn custom-btn-confirm">OK</button>
            </div>
        `;
        modal.querySelector('button').onclick = () => this.close();
    },

    confirm: function (title, message, confirmText = 'Tak', cancelText = 'Anuluj', isDanger = false) {
        return new Promise((resolve) => {
            const modal = this.createOverlay();
            modal.innerHTML = `
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="custom-modal-actions">
                    <button class="custom-btn custom-btn-cancel">${cancelText}</button>
                    <button class="custom-btn ${isDanger ? 'custom-btn-danger' : 'custom-btn-confirm'}">${confirmText}</button>
                </div>
            `;
            const confirmBtn = modal.querySelector('.custom-btn-confirm, .custom-btn-danger');
            const cancelBtn = modal.querySelector('.custom-btn-cancel');
            confirmBtn.onclick = () => {
                this.close();
                resolve(true);
            };
            cancelBtn.onclick = () => {
                this.close();
                resolve(false);
            };
        });
    },

    prompt: function (title, label, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = this.createOverlay();
            modal.innerHTML = `
                <h2>${title}</h2>
                <p>${label}</p>
                <input type="text" class="custom-input" value="${defaultValue}">
                <div class="custom-modal-actions">
                    <button class="custom-btn custom-btn-cancel">Anuluj</button>
                    <button class="custom-btn custom-btn-confirm">Zatwierdź</button>
                </div>
            `;
            const input = modal.querySelector('input');
            input.focus();
            input.select();
            // Obsługa Enter w inpucie
            input.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') modal.querySelector('.custom-btn-confirm').click();
            });
            modal.querySelector('.custom-btn-confirm').onclick = () => {
                const val = input.value;
                this.close();
                resolve(val);
            };
            modal.querySelector('.custom-btn-cancel').onclick = () => {
                this.close();
                resolve(null);
            };
        });
    },

    html: function (title, htmlContent, width = 850) {
        const modal = this.createOverlay(true);
        if (width) modal.style.width = width + 'px';
        modal.innerHTML = `
            <h2>${title}</h2>
            <div class="custom-modal-content">${htmlContent}</div>
            <div class="custom-modal-actions">
                <button class="custom-btn custom-btn-cancel">Zamknij</button>
            </div>
        `;
        modal.querySelector('.custom-btn-cancel').onclick = () => this.close();
    },

    toast: function (message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        let iconClass = 'fas fa-info-circle';
        if (type === 'success') iconClass = 'fas fa-check-circle';
        if (type === 'error') iconClass = 'fas fa-exclamation-circle';
        toast.innerHTML = `<i class="${iconClass}"></i> <span>${message}</span>`;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    showLoading: function (message = 'Ładowanie...') {
        // Zamknij overlay natychmiast, jeśli jest jakiś stary (brak animacji)
        this.close(true);
        const modal = this.createOverlay();
        modal.innerHTML = `
            <div style="text-align:center; padding: 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 3em; color: #ff8c00; margin-bottom: 15px;"></i>
                <h3>${message}</h3>
            </div>
        `;
        // Usuwamy możliwość zamknięcia klikając w tło
        const overlay = document.querySelector('.custom-modal-overlay');
        if (overlay) overlay.onclick = null;
    },

    hideLoading: function () {
        // Zamknij overlay NATYCHMIAST bez animacji, żeby loading zniknął od razu
        this.close(true);
    }
};
function runHeuristicDetection(content) {
    if (!content || !isAutoDetectEnabled) return null;

    // Analizuj cały content dla dokładniejszej detekcji
    const trimmed = content.trim();
    const sample = trimmed.substring(0, 1000); // Zwiększona próbka

    // JSON - sprawdź strukturę i spróbuj sparsować
    if (/^\s*[\{\[]/.test(trimmed)) {
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {
            // Może to być JavaScript z obiektem - sprawdź dalej
        }
    }

    // HTML - dokładniejsze sprawdzenie struktury dokumentu
    if (/^\s*<!DOCTYPE\s+html/i.test(trimmed) ||
        /<html[\s>]/i.test(sample) ||
        /<head[\s>]/i.test(sample) ||
        (/<body[\s>]/i.test(sample) && /<\/body>/i.test(content)) ||
        /^<(!DOCTYPE|html|head|body|div|p|span|section|article|header|footer|nav|main)/i.test(trimmed)) {
        return 'html';
    }

    // XML - sprawdź deklarację XML lub strukturę
    if (/^\s*<\?xml/i.test(trimmed) ||
        (/^<[\w-]+[^>]*>/.test(trimmed) && /<\/[\w-]+>\s*$/.test(trimmed) && !/<(script|style|div|p|span|body|html)/i.test(sample))) {
        return 'xml';
    }

    // CSS - sprawdź selektory, reguły i at-rules
    if (/^\s*(@(charset|import|media|font-face|keyframes|supports|page)|[.#@*]?[\w-]+\s*\{|:root\s*\{)/i.test(trimmed) ||
        (/\{[^}]*([a-z-]+\s*:\s*[^;]+;)+[^}]*\}/i.test(sample) && !/^\s*[\{\[]/.test(trimmed))) {
        return 'css';
    }

    // JavaScript - sprawdź typowe konstrukcje i składnię
    if (/(^|\n)\s*(const|let|var|function|class|import|export|async|await)\s+/m.test(sample) ||
        /=>\s*[\{\(]/.test(sample) ||
        /(console|document|window|process|require|module)\.\w+/m.test(sample) ||
        /^\s*['"`]use strict['"`];?/m.test(trimmed)) {
        return 'javascript';
    }

    // Python - sprawdź typową składnię
    if (/(^|\n)(def|class|import|from|if __name__|print\()/m.test(sample) ||
        /(^|\n)\s*(def|class)\s+\w+.*:/m.test(sample)) {
        return 'python';
    }

    return 'plaintext';
}

function markAsSaved() {
    hasUnsavedChanges = false;
    lastSavedContent = editor.getValue();
    updateStatusBar();
    updateUpdateButton();
}

function checkUnsavedChanges() {
    return hasUnsavedChanges && editor.getValue() !== lastSavedContent;
}

function updateUpdateButton() {
    const updateBtn = document.getElementById('updateNoteBtn');
    if (!updateBtn) return;

    if (currentLoadedFile && hasUnsavedChanges) {
        updateBtn.style.display = 'inline-block';
    } else {
        updateBtn.style.display = 'none';
    }
}

function initMonaco() {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        const theme = document.documentElement.getAttribute("data-theme") === "light" ? "vs" : "vs-dark";

        editor = monaco.editor.create(document.getElementById('editor'), {
            value: "// TERMINAL_READY\n// START_CODING...",
            language: 'javascript',
            theme: theme,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            automaticLayout: true,
            minimap: { enabled: true },
            scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
            cursorBlinking: "block",
            bracketPairColorization: {
                enabled: true,
                independentColorPoolPerBracketType: true
            },
            guides: {
                bracketPairs: true,
                bracketPairsHorizontal: true,
                highlightActiveBracketPair: true
            },
            matchBrackets: 'always'
            ,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            renderWhitespace: 'selection',
            smoothScrolling: true,
            mouseWheelZoom: true,
            contextmenu: true,
            quickSuggestions: {
                other: true,
                comments: false,
                strings: false
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnCommitCharacter: true,
            tabCompletion: 'on',
            wordBasedSuggestions: true,
            parameterHints: {
                enabled: true
            },
            colorDecorators: true,
            links: true,
            folding: true,
            foldingStrategy: 'auto',
            showFoldingControls: 'mouseover',
            unfoldOnClickAfterEndOfLine: false,
            highlightActiveIndentGuide: true,
            renderControlCharacters: false,
            renderIndentGuides: true,
            renderFinalNewline: true,
        });



        monacoLoaded = true;
        lastSavedContent = editor.getValue();
        editor.onDidChangeCursorPosition(updateStatusBar);

        let detectionTimeout;
        editor.onDidChangeModelContent(() => {
            hasUnsavedChanges = true;
            updateStatusBar();
            updateUpdateButton();
            if (isAutoDetectEnabled) {
                clearTimeout(detectionTimeout);
                // Zmniejszony timeout z 1000ms na 300ms dla szybszej detekcji
                detectionTimeout = setTimeout(() => {
                    const detected = runHeuristicDetection(editor.getValue());
                    if (detected && detected !== editor.getModel().getLanguageId()) {
                        monaco.editor.setModelLanguage(editor.getModel(), detected);
                        updateSelectUI(detected);
                    }
                }, 300);
            }
        });

        initializeCustomSelects();
        fetchGitHubData();
        updateStatusBar();
    });
}

function updateStatusBar() {
    if (!monacoLoaded) return;
    const pos = editor.getPosition();
    const model = editor.getModel();
    const unsavedIndicator = hasUnsavedChanges ? ' <img src="https://api.iconify.design/ph:warning-circle-duotone.svg" width="18" height="18" class="status-icon-red"><span style="color: rgba(var(--danger-rgb), 1);"> NIEZAPISANE</span>' : '';
    const fileIndicator = currentLoadedFile ? ` <span style="color: var(--highlight-color);">• ${currentLoadedFile.name}</span>` : '';
    const statusIcon = hasUnsavedChanges ? '<img src="https://api.iconify.design/ph:warning-duotone.svg" width="18" height="18" class="file-icon">' : '<img src="https://api.iconify.design/ph:check-square-duotone.svg" width="18" height="18" class="status-icon">';
    const fileIcon = currentLoadedFile ? '<img src="https://api.iconify.design/ph:clipboard-text-duotone.svg" width="18" height="18" class="file-icon">' : '<img src="https://api.iconify.design/ph:clipboard-duotone.svg" width="18" height="18" class="file-icon">';
    // Language icon mapping
    const langIcons = {
        'javascript': 'https://api.iconify.design/material-icon-theme:javascript.svg',
        'json': 'https://api.iconify.design/vscode-icons:file-type-light-json.svg',
        'html': 'https://api.iconify.design/vscode-icons:file-type-html.svg',
        'css': 'https://api.iconify.design/vscode-icons:file-type-css2.svg',
        'xml': 'https://api.iconify.design/vscode-icons:file-type-xml.svg',
        'plaintext': 'https://api.iconify.design/material-icon-theme:latexmk.svg'
    };
    const currentLang = model.getLanguageId();
    const langIcon = langIcons[currentLang] || 'https://api.iconify.design/vscode-icons:file-type-json2.svg';
    const langIconHtml = `<img src="${langIcon}" width="18" height="18" class="lang-icon">`;
    document.getElementById('statusText').innerHTML = `${statusIcon} SYSTEM_READY | ${fileIcon} [LN ${pos.lineNumber}, COL ${pos.column}] | LANG: ${langIconHtml}${fileIndicator}${unsavedIndicator}`;
}

/**
 * --- ACTIONS ---
 */
window.applyTransform = function (type) {
    if (!monacoLoaded) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    let text = selection.isEmpty() ? editor.getValue() : model.getValueInRange(selection);
    if (!text) return;

    let result = text;
    switch (type) {
        case 'uppercase': result = text.toUpperCase(); break;
        case 'lowercase': result = text.toLowerCase(); break;
        case 'capitalize': result = text.replace(/\b\w/g, l => l.toUpperCase()); break;
        case 'sort': result = text.split('\n').sort().join('\n'); break;
        case 'removeDuplicates': result = [...new Set(text.split('\n'))].join('\n'); break;
        case 'removeEmpty': result = text.split('\n').filter(l => l.trim() !== "").join('\n'); break;
        case 'trim': result = text.split('\n').map(l => l.trim()).join('\n'); break;
        case 'addNumbers': result = text.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'); break;
        case 'wrap':
            const len = parseInt(document.getElementById('wrapLength').value) || 80;
            const reg = new RegExp(`.{1,${len}}`, 'g');
            result = text.replace(/\n/g, ' ').match(reg)?.join('\n') || text;
            break;
    }

    if (selection.isEmpty()) editor.setValue(result);
    else editor.executeEdits("transform", [{ range: selection, text: result, forceMoveMarkers: true }]);
    CustomUI.toast("TRANSFORM_SUCCESS");
};

window.formatCode = async function () {
    if (!monacoLoaded) return;
    const model = editor.getModel();
    const code = editor.getValue();
    const lang = model.getLanguageId();
    let parser = lang === 'javascript' ? 'babel' : (lang === 'html' ? 'html' : (lang === 'css' ? 'css' : null));

    if (lang === 'json') {
        try { editor.setValue(JSON.stringify(JSON.parse(code), null, 4)); return; } catch (e) { }
    }
    if (!parser) { CustomUI.toast("FORMAT_UNAVAILABLE"); return; }
    try {
        const formatted = prettier.format(code, { parser, plugins: prettierPlugins, tabWidth: 4 });
        editor.setValue(formatted);
    } catch (e) { CustomUI.toast("SYNTAX_ERROR", "error"); }
};

window.newFile = async function () {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz utworzyć nowy plik?',
            'Tak, utwórz nowy',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    editor.setValue("");
    currentLoadedFile = null;
    markAsSaved();
};

window.clearEditor = async function () {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz wyczyścić edytor?',
            'Tak, wyczyść',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    editor.setValue("");
    currentLoadedFile = null;
    markAsSaved();
};

window.saveFile = function () {
    const blob = new Blob([editor.getValue()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terminal_dump_${Date.now()}.txt`;
    a.click();
    markAsSaved();
};

window.openFile = async function () {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz otworzyć inny plik?',
            'Tak, otwórz',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.js,.html,.css,.json,.md';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            editor.setValue(ev.target.result);
            currentLoadedFile = null;
            markAsSaved();
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
};

window.saveLocally = async function () {
    const name = await CustomUI.prompt('NAZWA_REKORDU', 'Podaj nazwę...');
    if (name) {
        const data = { content: editor.getValue(), language: editor.getModel().getLanguageId(), date: new Date().toLocaleString() };
        let saved = JSON.parse(localStorage.getItem('terminal_db') || '{}');
        saved[name] = data;
        localStorage.setItem('terminal_db', JSON.stringify(saved));
        CustomUI.toast("STORE_SUCCESS");
        markAsSaved();
    }
};

window.updateLoadedNote = async function () {
    if (!currentLoadedFile) return;

    const confirmed = await CustomUI.confirm(
        'AKTUALIZACJA NOTATKI',
        `Czy na pewno chcesz zaktualizować notatkę "${currentLoadedFile.name}"?`,
        'Tak, aktualizuj',
        'Anuluj',
        false
    );

    if (!confirmed) return;

    const data = {
        content: editor.getValue(),
        language: editor.getModel().getLanguageId(),
        date: new Date().toLocaleString()
    };

    let saved = JSON.parse(localStorage.getItem('terminal_db') || '{}');
    saved[currentLoadedFile.name] = data;
    localStorage.setItem('terminal_db', JSON.stringify(saved));

    CustomUI.toast("NOTATKA ZAKTUALIZOWANA", "success");
    markAsSaved();
};

window.exportLocalDB = function () {
    const saved = localStorage.getItem('terminal_db') || '{}';
    const blob = new Blob([saved], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `local_db_backup_${Date.now()}.json`;
    a.click();
    CustomUI.toast("EXPORT_SUCCESS");
};

window.importLocalDB = async function () {
    const confirmed = await CustomUI.confirm(
        'IMPORT LOCAL_DB',
        'Import zastąpi całą zawartość LOCAL_DB. Czy kontynuować?',
        'Tak, importuj',
        'Anuluj',
        true
    );
    if (!confirmed) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                // Normalizacja danych - jeśli to obiekt z kluczami, zachowaj strukturę
                // Jeśli to tablica, przekształć na obiekt z nazwami jako kluczami
                let normalizedData = {};
                if (Array.isArray(data)) {
                    data.forEach((item, index) => {
                        const name = item.name || `imported_${index + 1}`;
                        normalizedData[name] = {
                            content: item.content || item.code || JSON.stringify(item, null, 2),
                            language: item.language || 'plaintext',
                            date: item.date || new Date().toLocaleString()
                        };
                    });
                } else if (typeof data === 'object') {
                    // Jeśli to już obiekt z kluczami, zachowaj go
                    normalizedData = data;
                }
                localStorage.setItem('terminal_db', JSON.stringify(normalizedData));
                CustomUI.toast("IMPORT_SUCCESS", "success");
                CustomUI.close();
                showLocalFiles();
            } catch (err) {
                CustomUI.toast("IMPORT_ERROR: Nieprawidłowy format JSON", "error");
            }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
};

window.showLocalFiles = function () {
    const saved = JSON.parse(localStorage.getItem('terminal_db') || '{}');
    const entries = Object.entries(saved);
    if (entries.length === 0) { CustomUI.toast("DB_EMPTY"); return; }
    let html = '<div class="local-files-grid">';
    entries.forEach(([name, data]) => {
        // Zabezpieczenie przed null/undefined data
        if (!data) return;
        const iconClass = 'fas fa-file-code';
        const displayDate = data.date || '-';
        html += `<div class="local-file-card">
                    <div class="card-header">
                        <div class="card-file-name" title="${name}">${name}</div>
                        <button class="card-delete-btn" onclick="event.stopPropagation(); deleteLocalFile('${name}')" title="Usuń" style="display:none;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="card-file-icon">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="card-file-details">
                            Zapisano:<br>
                            <span>${displayDate}</span>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="card-action-btn" onclick="loadLocal('${name}')">
                            WCZYTAJ
                        </button>
                    </div>
                </div>`;
    });
    html += '</div>';
    const modal = CustomUI.createOverlay(true);
    modal.innerHTML = `
        <h2>LOCAL_DB</h2>
        <div class="custom-modal-content">${html}</div>
        <div class="custom-modal-actions">
            <button class="custom-btn custom-btn-confirm" onclick="exportLocalDB()">
                <i class="fas fa-download"></i> Export JSON
            </button>
            <button class="custom-btn custom-btn-confirm" onclick="importLocalDB()">
                <i class="fas fa-upload"></i> Import JSON
            </button>
            <button class="custom-btn custom-btn-cancel" onclick="CustomUI.close()">Zamknij</button>
        </div>
    `;
};

window.loadLocal = async function (name) {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz wczytać inny plik?',
            'Tak, wczytaj',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    const data = JSON.parse(localStorage.getItem('terminal_db'))[name];
    editor.setValue(data.content);
    monaco.editor.setModelLanguage(editor.getModel(), data.language);
    currentLoadedFile = { name: name, source: 'local' };
    markAsSaved();
    CustomUI.close();
};

async function fetchGitHubData() {
    const url = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${GITHUB_FILE}`;
    try {
        const res = await fetch(url);
        if (res.ok) window.projectsData = await res.json();
    } catch (e) { }
}

window.showGitHubFiles = function () {
    if (!window.projectsData) return;
    let files = Array.isArray(window.projectsData) ? window.projectsData : (window.projectsData.files || []);
    let html = '<div class="local-files-grid">';
    files.forEach((file, idx) => {
        const iconClass = 'fas fa-file-code';
        html += `<div class="local-file-card">
                    <div class="card-header">
                        <div class="card-file-name" title="${file.name || 'GIT_NODE_' + idx}">${file.name || 'GIT_NODE_' + idx}</div>
                        <button class="card-delete-btn" onclick="event.stopPropagation(); deleteGitFile(${idx})" title="Usuń" style="display:none;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="card-file-icon">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="card-file-details">
                            Zapisano:<br>
                            <span>${file.date || '-'}</span>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="card-action-btn" onclick="loadGit(${idx})">
                            WCZYTAJ
                        </button>
                    </div>
                </div>`;
    });
    html += '</div>';
    window._gitFiles = files;
    const modal = CustomUI.createOverlay(true);
    modal.innerHTML = `
        <h2>GITHUB_EXPLORER</h2>
        <div class="custom-modal-content">${html}</div>
        <div class="custom-modal-actions">
            <button class="custom-btn custom-btn-cancel" onclick="CustomUI.close()">Zamknij</button>
        </div>
    `;
};

window.loadGit = async function (idx) {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz wczytać plik z GitHub?',
            'Tak, wczytaj',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    const file = window._gitFiles[idx];
    editor.setValue(file.content || file.code || JSON.stringify(file, null, 2));
    currentLoadedFile = { name: file.name || 'GIT_NODE_' + idx, source: 'github' };
    markAsSaved();
    CustomUI.close();
};

function initializeCustomSelects() {
    const container = document.getElementById('syntaxSelectContainer');
    const trigger = container.querySelector('.select-trigger');
    const options = container.querySelector('.select-options');
    trigger.onclick = (e) => { e.stopPropagation(); options.classList.toggle('show'); };
    document.querySelectorAll('.option').forEach(opt => {
        opt.onclick = () => {
            const val = opt.getAttribute('data-value');
            isAutoDetectEnabled = (val === 'auto');
            if (!isAutoDetectEnabled) monaco.editor.setModelLanguage(editor.getModel(), val);
            trigger.querySelector('span').textContent = opt.textContent.trim();
            trigger.querySelector('img').src = opt.querySelector('img')?.src || '';
            options.classList.remove('show');
            updateStatusBar();
        };
    });
    document.addEventListener('click', () => options.classList.remove('show'));
}

function updateSelectUI(lang) {
    const trigger = document.querySelector('#syntaxSelectContainer .select-trigger');
    const opt = document.querySelector(`.option[data-value="${lang}"]`);
    if (opt && isAutoDetectEnabled) {
        trigger.querySelector('span').textContent = opt.textContent.trim();
        trigger.querySelector('img').src = opt.querySelector('img').src;
    }
}

window.exportJSON = () => {
    const data = { content: editor.getValue(), language: editor.getModel().getLanguageId(), timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'terminal_backup.json'; a.click();
    markAsSaved();
};

window.importJSON = async function () {
    if (checkUnsavedChanges()) {
        const confirmed = await CustomUI.confirm(
            'NIEZAPISANE ZMIANY',
            'Masz niezapisane zmiany. Czy na pewno chcesz zaimportować plik?',
            'Tak, importuj',
            'Anuluj',
            true
        );
        if (!confirmed) return;
    }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            const data = JSON.parse(ev.target.result);
            editor.setValue(data.content || "");
            if (data.language) monaco.editor.setModelLanguage(editor.getModel(), data.language);
            currentLoadedFile = null;
            markAsSaved();
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
};

// Ostrzeżenie przed zamknięciem strony z niezapisanymi zmianami
window.addEventListener('beforeunload', (e) => {
    if (checkUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

document.addEventListener('DOMContentLoaded', initMonaco);

// Obsługa zmiany motywu
window.toggleTheme = function () {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    if (editor && monacoLoaded) {
        const monacoTheme = newTheme === "light" ? "vs" : "vs-dark";
        monaco.editor.setTheme(monacoTheme);
    }
};

const themeIcon = document.getElementById('themeIcon');
if (themeIcon) {
    themeIcon.addEventListener('click', toggleTheme);
}


// Add these to your existing script section
document.addEventListener("DOMContentLoaded", function () {
    // Remove draggable attribute from all elements
    document.querySelectorAll('[draggable="true"]').forEach((el) => {
        el.removeAttribute("draggable");
    });

    // Prevent dragstart event
    document.addEventListener("dragstart", function (e) {
        e.preventDefault();
        return false;
    });

    // Prevent drop event
    document.addEventListener("drop", function (e) {
        e.preventDefault();
        return false;
    });

    // Prevent dragover event
    document.addEventListener("dragover", function (e) {
        e.preventDefault();
        return false;
    });
});


