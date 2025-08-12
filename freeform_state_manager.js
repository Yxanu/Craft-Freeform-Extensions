/**
 * 🎯 Freeform State Manager für Craft CMS
 * Speichert Formulardaten bei Seitenwechseln mit swup.js
 * Unterstützt alle Freeform-Feldtypen und -strukturen
 */
class FreeformStateManager {
    constructor(options = {}) {
        this.options = {
            storagePrefix: 'freeform_state_',
            storageType: 'localStorage', // 'localStorage' oder 'sessionStorage'
            autoSave: true,
            autoRestore: true,
            clearOnSubmit: true,
            debug: false,
            excludeFields: ['honeypot', 'csrf_token', 'CRAFT_CSRF_TOKEN'],
            ...options
        };
        
        this.forms = new Map();
        this.observers = new Map();
        
        this.init();
    }
    
    init() {
        // Alle Freeform-Formulare finden
        this.discoverForms();
        
        // Event Listeners für Form-Interaktionen
        this.attachFormListeners();
        
        // swup.js Integration
        this.setupSwupIntegration();
        
        // Page Visibility API für Auto-Save
        this.setupVisibilityHandlers();
        
        if (this.options.debug) {
            console.log('🎵 FreeformStateManager initialized', {
                forms: this.forms.size,
                options: this.options
            });
        }
    }
    
    /**
     * Alle Freeform-Formulare auf der Seite entdecken
     */
    discoverForms() {
        // Freeform-Formulare haben spezifische Klassen/Attribute
        const selectors = [
            'form[data-freeform]',
            'form.freeform-form',
            'form.formularNeu', // Dein spezifischer Selector
            'form.anfrage'      // Dein spezifischer Selector
        ];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(form => {
                this.registerForm(form);
            });
        });
    }
    
    /**
     * Einzelnes Formular registrieren
     */
    registerForm(form) {
        if (!form.id && !form.name) {
            // Fallback ID generieren
            form.id = `freeform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        const formId = form.id || form.name;
        const storageKey = this.options.storagePrefix + formId;
        
        this.forms.set(formId, {
            element: form,
            storageKey: storageKey,
            lastSaved: null
        });
        
        // Auto-restore beim Registrieren
        if (this.options.autoRestore) {
            this.restoreFormState(formId);
        }
        
        if (this.options.debug) {
            console.log(`📝 Form registered: ${formId}`);
        }
    }
    
    /**
     * Event Listeners für alle Formulare
     */
    attachFormListeners() {
        this.forms.forEach((formData, formId) => {
            const form = formData.element;
            
            // Form Submit Handler
            form.addEventListener('submit', (e) => {
                this.handleFormSubmit(formId, e);
            });
            
            // Input Change Handlers
            this.attachInputListeners(form, formId);
            
            // Freeform-spezifische Events
            this.attachFreeformListeners(form, formId);
        });
    }
    
    /**
     * Input-spezifische Listener
     */
    attachInputListeners(form, formId) {
        const inputs = form.querySelectorAll(`
            input[type="text"],
            input[type="email"],
            input[type="tel"],
            input[type="url"],
            input[type="number"],
            input[type="password"],
            input[type="search"],
            input[type="date"],
            input[type="time"],
            input[type="datetime-local"],
            input[type="radio"],
            input[type="checkbox"],
            select,
            textarea,
            .freeform-input
        `);
        
        inputs.forEach(input => {
            // Verschiedene Events für verschiedene Input-Typen
            const events = this.getInputEvents(input);
            
            events.forEach(event => {
                input.addEventListener(event, () => {
                    if (this.options.autoSave) {
                        this.debounce(() => this.saveFormState(formId), 500)();
                    }
                });
            });
        });
    }
    
    /**
     * Freeform-spezifische Event Listener
     */
    attachFreeformListeners(form, formId) {
        // Multi-Select Dropdowns
        form.querySelectorAll('.selectMultiple').forEach(select => {
            select.addEventListener('click', () => {
                setTimeout(() => this.saveFormState(formId), 100);
            });
        });
        
        // File Upload Fields
        form.querySelectorAll('.fileuploader').forEach(uploader => {
            uploader.addEventListener('change', () => {
                this.saveFormState(formId);
            });
        });
        
        // Custom Checkbox/Radio Groups
        form.querySelectorAll('.checklist, .deutschFremd').forEach(group => {
            group.addEventListener('change', () => {
                this.saveFormState(formId);
            });
        });
    }
    
    /**
     * Passende Events für Input-Typ bestimmen
     */
    getInputEvents(input) {
        const type = input.type || input.tagName.toLowerCase();
        
        switch (type) {
            case 'checkbox':
            case 'radio':
                return ['change'];
            case 'select':
            case 'select-one':
            case 'select-multiple':
                return ['change'];
            case 'textarea':
                return ['input', 'blur'];
            case 'file':
                return ['change'];
            default:
                return ['input', 'blur'];
        }
    }
    
    /**
     * Formular-State speichern
     */
    saveFormState(formId) {
        const formData = this.forms.get(formId);
        if (!formData) return;
        
        const form = formData.element;
        const state = this.extractFormState(form);
        
        try {
            const storage = this.getStorage();
            storage.setItem(formData.storageKey, JSON.stringify({
                state: state,
                timestamp: Date.now(),
                url: window.location.href
            }));
            
            formData.lastSaved = Date.now();
            
            if (this.options.debug) {
                console.log(`💾 State saved for form: ${formId}`, state);
            }
            
        } catch (error) {
            console.error('❌ Error saving form state:', error);
        }
    }
    
    /**
     * Formular-State extrahieren
     */
    extractFormState(form) {
        const state = {};
        
        // Standard Form-Inputs
        const formData = new FormData(form);
        for (let [key, value] of formData.entries()) {
            if (this.options.excludeFields.includes(key)) continue;
            
            if (state[key]) {
                // Multiple values (Checkboxes/Multi-Select)
                if (Array.isArray(state[key])) {
                    state[key].push(value);
                } else {
                    state[key] = [state[key], value];
                }
            } else {
                state[key] = value;
            }
        }
        
        // Checkbox States (auch unchecked)
        form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            const name = checkbox.name;
            if (this.options.excludeFields.includes(name)) return;
            
            if (!checkbox.checked) {
                // Unchecked Checkboxes tracken
                if (!state._unchecked) state._unchecked = [];
                state._unchecked.push(name);
            }
        });
        
        // Radio Button Groups
        form.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            const name = radio.name;
            if (this.options.excludeFields.includes(name)) return;
            state[name] = radio.value;
        });
        
        // Custom Freeform Elements
        state._custom = this.extractCustomElements(form);
        
        return state;
    }
    
    /**
     * Custom Freeform-Elemente extrahieren
     */
    extractCustomElements(form) {
        const custom = {};
        
        // Multi-Select Dropdowns
        form.querySelectorAll('.selectMultiple.open').forEach(select => {
            const input = select.querySelector('input[type="hidden"]');
            if (input && input.name) {
                custom[input.name + '_open'] = true;
            }
        });
        
        // File Upload States
        form.querySelectorAll('.fileuploader-input').forEach(uploader => {
            const input = uploader.querySelector('input[type="file"]');
            if (input && input.files && input.files.length > 0) {
                custom[input.name + '_files'] = Array.from(input.files).map(file => ({
                    name: file.name,
                    size: file.size,
                    type: file.type
                }));
            }
        });
        
        return custom;
    }
    
    /**
     * Formular-State wiederherstellen
     */
    restoreFormState(formId) {
        const formData = this.forms.get(formId);
        if (!formData) return;
        
        try {
            const storage = this.getStorage();
            const savedData = storage.getItem(formData.storageKey);
            
            if (!savedData) return;
            
            const { state, timestamp } = JSON.parse(savedData);
            
            // State-Alter prüfen (max. 24h)
            const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden
            if (Date.now() - timestamp > maxAge) {
                this.clearFormState(formId);
                return;
            }
            
            this.applyFormState(formData.element, state);
            
            if (this.options.debug) {
                console.log(`🔄 State restored for form: ${formId}`, state);
            }
            
        } catch (error) {
            console.error('❌ Error restoring form state:', error);
        }
    }
    
    /**
     * State auf Formular anwenden
     */
    applyFormState(form, state) {
        Object.entries(state).forEach(([key, value]) => {
            if (key.startsWith('_')) return; // Meta-Daten überspringen
            
            this.restoreField(form, key, value);
        });
        
        // Custom Elements wiederherstellen
        if (state._custom) {
            this.restoreCustomElements(form, state._custom);
        }
        
        // Unchecked Checkboxes
        if (state._unchecked) {
            state._unchecked.forEach(name => {
                const checkbox = form.querySelector(`input[type="checkbox"][name="${name}"]`);
                if (checkbox) checkbox.checked = false;
            });
        }
    }
    
    /**
     * Einzelnes Feld wiederherstellen
     */
    restoreField(form, name, value) {
        const elements = form.querySelectorAll(`[name="${name}"]`);
        
        elements.forEach(element => {
            const type = element.type || element.tagName.toLowerCase();
            
            switch (type) {
                case 'checkbox':
                    if (Array.isArray(value)) {
                        element.checked = value.includes(element.value);
                    } else {
                        element.checked = (value === element.value);
                    }
                    break;
                    
                case 'radio':
                    element.checked = (element.value === value);
                    break;
                    
                case 'select-multiple':
                    Array.from(element.options).forEach(option => {
                        option.selected = Array.isArray(value) ? 
                            value.includes(option.value) : 
                            option.value === value;
                    });
                    break;
                    
                case 'file':
                    // File inputs können nicht programmatisch gesetzt werden
                    break;
                    
                default:
                    element.value = Array.isArray(value) ? value[0] : value;
                    break;
            }
            
            // Change Event triggern für Validierung
            element.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    
    /**
     * Custom Elemente wiederherstellen
     */
    restoreCustomElements(form, custom) {
        Object.entries(custom).forEach(([key, value]) => {
            if (key.endsWith('_open')) {
                const selectName = key.replace('_open', '');
                const select = form.querySelector(`.selectMultiple input[name="${selectName}"]`)?.closest('.selectMultiple');
                if (select && value) {
                    select.classList.add('open');
                }
            }
            
            if (key.endsWith('_files')) {
                // File-Info anzeigen (ohne echte Files)
                const inputName = key.replace('_files', '');
                const fileInput = form.querySelector(`input[type="file"][name="${inputName}"]`);
                if (fileInput && Array.isArray(value)) {
                    // Custom File-Info Element erstellen/updaten
                    this.displayFileInfo(fileInput, value);
                }
            }
        });
    }
    
    /**
     * File-Info anzeigen
     */
    displayFileInfo(fileInput, fileInfos) {
        let infoElement = fileInput.parentNode.querySelector('.restored-files-info');
        
        if (!infoElement) {
            infoElement = document.createElement('div');
            infoElement.className = 'restored-files-info';
            infoElement.style.cssText = `
                margin-top: 8px;
                padding: 8px 12px;
                background: #f0f9ff;
                border: 1px solid #bae6fd;
                border-radius: 4px;
                font-size: 14px;
                color: #0369a1;
            `;
            fileInput.parentNode.appendChild(infoElement);
        }
        
        infoElement.innerHTML = `
            <strong>📎 Zuvor ausgewählte Dateien:</strong><br>
            ${fileInfos.map(file => `• ${file.name} (${this.formatFileSize(file.size)})`).join('<br>')}
            <br><small>Wählen Sie erneut aus, um zu ersetzen.</small>
        `;
    }
    
    /**
     * Dateigröße formatieren
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Formular-State löschen
     */
    clearFormState(formId) {
        const formData = this.forms.get(formId);
        if (!formData) return;
        
        try {
            const storage = this.getStorage();
            storage.removeItem(formData.storageKey);
            
            if (this.options.debug) {
                console.log(`🗑️ State cleared for form: ${formId}`);
            }
            
        } catch (error) {
            console.error('❌ Error clearing form state:', error);
        }
    }
    
    /**
     * Form Submit Handler
     */
    handleFormSubmit(formId, event) {
        if (this.options.clearOnSubmit) {
            // Nach erfolgreichem Submit löschen
            setTimeout(() => {
                // Prüfen ob noch auf derselben Seite (kein Redirect)
                if (document.querySelector(`#${formId}`) || document.querySelector(`[name="${formId}"]`)) {
                    // Vermutlich Validierungsfehler, State behalten
                    return;
                }
                this.clearFormState(formId);
            }, 1000);
        }
        
        if (this.options.debug) {
            console.log(`📤 Form submitted: ${formId}`);
        }
    }
    
    /**
     * swup.js Integration
     */
    setupSwupIntegration() {
        // Wenn swup verfügbar ist
        if (typeof swup !== 'undefined') {
            // Vor Seitenwechsel: States speichern
            swup.on('willReplaceContent', () => {
                this.forms.forEach((formData, formId) => {
                    this.saveFormState(formId);
                });
                
                if (this.options.debug) {
                    console.log('🔄 Swup: All form states saved');
                }
            });
            
            // Nach Seitenwechsel: Neue Formulare entdecken und States wiederherstellen
            swup.on('contentReplaced', () => {
                // Alte Form-Referenzen löschen
                this.forms.clear();
                
                // Neue Formulare entdecken
                this.discoverForms();
                this.attachFormListeners();
                
                if (this.options.debug) {
                    console.log('🔄 Swup: Forms re-initialized after page change');
                }
            });
            
            // Nach Animationen: Final cleanup
            swup.on('animationInDone', () => {
                // Delayed restore für dynamisch geladene Inhalte
                setTimeout(() => {
                    this.forms.forEach((formData, formId) => {
                        this.restoreFormState(formId);
                    });
                }, 100);
            });
        }
        
        // Fallback für normale Navigation
        window.addEventListener('beforeunload', () => {
            this.forms.forEach((formData, formId) => {
                this.saveFormState(formId);
            });
        });
    }
    
    /**
     * Page Visibility Handlers für Auto-Save
     */
    setupVisibilityHandlers() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // Tab wird versteckt - States speichern
                this.forms.forEach((formData, formId) => {
                    this.saveFormState(formId);
                });
            }
        });
        
        // Mobile: pagehide Event
        window.addEventListener('pagehide', () => {
            this.forms.forEach((formData, formId) => {
                this.saveFormState(formId);
            });
        });
    }
    
    /**
     * Storage-Instanz holen
     */
    getStorage() {
        return this.options.storageType === 'sessionStorage' ? 
            sessionStorage : localStorage;
    }
    
    /**
     * Debounce Helper
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Öffentliche API Methoden
     */
    
    // Manuell speichern
    save(formId) {
        if (formId) {
            this.saveFormState(formId);
        } else {
            this.forms.forEach((formData, id) => {
                this.saveFormState(id);
            });
        }
    }
    
    // Manuell wiederherstellen
    restore(formId) {
        if (formId) {
            this.restoreFormState(formId);
        } else {
            this.forms.forEach((formData, id) => {
                this.restoreFormState(id);
            });
        }
    }
    
    // State löschen
    clear(formId) {
        if (formId) {
            this.clearFormState(formId);
        } else {
            this.forms.forEach((formData, id) => {
                this.clearFormState(id);
            });
        }
    }
    
    // Debugging Info
    getDebugInfo() {
        const info = {
            forms: Array.from(this.forms.keys()),
            options: this.options,
            storage: {}
        };
        
        this.forms.forEach((formData, formId) => {
            try {
                const storage = this.getStorage();
                const savedData = storage.getItem(formData.storageKey);
                info.storage[formId] = savedData ? JSON.parse(savedData) : null;
            } catch (error) {
                info.storage[formId] = 'Error loading';
            }
        });
        
        return info;
    }
}

/**
 * 🚀 Auto-Initialisierung
 * Automatisch starten wenn DOM ready ist
 */
function initFreeformStateManager(options = {}) {
    return new FreeformStateManager(options);
}

// DOM Ready Handler
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.freeformStateManager = initFreeformStateManager();
    });
} else {
    window.freeformStateManager = initFreeformStateManager();
}

/**
 * 🎯 Export für Module/Build Systems
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FreeformStateManager;
}

if (typeof define === 'function' && define.amd) {
    define([], () => FreeformStateManager);
}

/**
 * 📖 Usage Examples:
 * 
 * // Basis-Verwendung (Auto-Init)
 * // Einfach dieses Script einbinden - läuft automatisch!
 * 
 * // Custom Options
 * window.freeformStateManager = new FreeformStateManager({
 *     debug: true,
 *     storageType: 'sessionStorage',
 *     autoSave: true
 * });
 * 
 * // Manuell steuern
 * freeformStateManager.save('myFormId');
 * freeformStateManager.restore('myFormId');
 * freeformStateManager.clear('myFormId');
 * 
 * // Debug Info
 * console.log(freeformStateManager.getDebugInfo());
 * 
 * // Mit swup.js
 * swup.on('contentReplaced', () => {
 *     new FreeformStateManager({ debug: true });
 * });
 */