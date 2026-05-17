// --- START OF scripts.js ---
// const BACKEND_URL = 'http://127.0.0.1:5000'; // Local
// const BACKEND_URL = 'http://82.70.52.163:5000'; // New Oracle cloud backend
// const BACKEND_URL = 'https://beforeyoueat.onrender.com'; // Old Render backend (Oracle needed HTTPS, so we're back to this)
const BACKEND_URL = 'https://laundry-city-advisory-hampshire.trycloudflare.com'; // New randomized Cloudflare 'url
const GOOGLE_CLIENT_ID = '212430289140-fipq7nufjjq8psmogq5n8v8p43g73jsk.apps.googleusercontent.com';

// --- Global State Variables ---
let meals = {};
let exercise = {};
let goals = { calories: 2000, fat: 67, carbs: 275, protein: 75 };
let currentDate = new Date();

let userInfoGlobal = null;
let googleIdToken = null;
let currentGoogleUserIdForStorage = null;

let isServerOnline = false;
let statusCheckInterval = null;
let serverSyncTimeout = null;
const SYNC_DEBOUNCE_TIME = 3000;

let pollingIntervalId = null;
const POLLING_INTERVAL = 15000;
const COPIED_MEAL_STORAGE_KEY = 'beforeYouEatCopiedMeal';
let copiedMealData = null;
let toastHideTimeoutId = null;
const actionHistory = [];
const MAX_HISTORY = 60;

let serverJustCameOnlineForPolling = false;

// State for meal form interaction
const mealFormEditState = { // True if editing an existing meal
    breakfast: false, lunch: false, dinner: false, snacks: false
};
const mealFormAddState = { // True if form is open for adding a new meal
    breakfast: false, lunch: false, dinner: false, snacks: false
};

// --- UTILITY FUNCTIONS ---
function getLocalDateParts(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        console.error("getLocalDateParts: Invalid date input", date, ". Using current moment.");
        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function formatLocalDateForStorage(date) {
    const parts = getLocalDateParts(date);
    const year = parts.year;
    const month = (parts.month + 1).toString().padStart(2, '0');
    const day = parts.day.toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseStoredDateToLocalDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        const today = new Date(); const p = getLocalDateParts(today); return new Date(p.year, p.month, p.day);
    }
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) return new Date(year, month, day);
    }
    console.warn("parseStoredDateToLocalDate: Malformed dateString '", dateString, "', returning today.");
    const today = new Date(); const p = getLocalDateParts(today); return new Date(p.year, p.month, p.day);
}

function getLocalStorageKey(baseKey, googleUserId = null) {
    const userId = googleUserId || currentGoogleUserIdForStorage || 'anonymous';
    return `${userId}_${baseKey}`;
}

function decodeJwtResponse(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { console.error("Error decoding JWT", e); return null; }
}

const MACRO_FIELDS = ['Calories', 'Fat', 'Carbs', 'Protein'];

function getMacroSliderForInput(inputId) {
    return document.querySelector(`.macro-adjust-slider[data-target-input='${inputId}']`);
}

function updateMacroSliderLabel(slider, percent) {
    if (!slider) return;
    const labelId = slider.dataset.labelId;
    if (!labelId) return;
    const labelEl = document.getElementById(labelId);
    if (!labelEl) return;
    const pct = Math.round(percent);
    const prefix = pct > 0 ? '+' : '';
    labelEl.textContent = `${prefix}${pct}%`;
}

function resetMacroSliderForInput(inputOrId) {
    const inputEl = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
    if (!inputEl) return;
    const slider = getMacroSliderForInput(inputEl.id);
    if (!slider) return;
    const value = parseFloat(inputEl.value);
    slider.dataset.baseValue = isNaN(value) ? '' : value;
    slider.value = '0';
    updateMacroSliderLabel(slider, 0);
    updateSliderBackgroundVisual(slider);
}

function resetMacroSlidersForMealType(mealType) {
    MACRO_FIELDS.forEach(field => resetMacroSliderForInput(`${mealType}${field}`));
}

const SLIDER_MIN = -20;
const SLIDER_MAX = 20;

function updateSliderBackgroundVisual(slider) {
    if (!slider) return;
    const value = parseFloat(slider.value) || 0;
    const min = SLIDER_MIN;
    const max = SLIDER_MAX;
    const midPercent = ((0 - min) / (max - min)) * 100;
    const currentPercent = ((value - min) / (max - min)) * 100;
    let start = Math.min(midPercent, currentPercent);
    let end = Math.max(midPercent, currentPercent);
    start = Math.max(0, Math.min(100, start));
    end = Math.max(0, Math.min(100, end));
    const base = '#dfe9da';
    const fill = '#93a38b';
    if (Math.abs(value) < 0.1) {
        slider.style.background = `linear-gradient(to right, ${base} 0%, ${base} 100%)`;
        return;
    }
    slider.style.background = `linear-gradient(to right, ${base} 0%, ${base} ${start}%, ${fill} ${start}%, ${fill} ${end}%, ${base} ${end}%, ${base} 100%)`;
}

function scrollFormIntoView(mealType) {
    if (!mealType) return;
    const form = document.getElementById(`${mealType}Form`);
    if (!form) return;
    requestAnimationFrame(() => {
        const rect = form.getBoundingClientRect();
        const offset = 110;
        const target = rect.top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
}

function initializeMacroSliders() {
    document.querySelectorAll('.macro-adjust-slider').forEach(slider => {
        const inputId = slider.dataset.targetInput;
        if (!inputId) return;
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        resetMacroSliderForInput(inputEl);
        updateSliderBackgroundVisual(slider);

        slider.addEventListener('input', () => {
            const baseValue = parseFloat(slider.dataset.baseValue);
            const percent = parseFloat(slider.value) || 0;
            updateMacroSliderLabel(slider, percent);
            if (isNaN(baseValue)) return;
            const newValue = +(baseValue * (1 + percent / 100)).toFixed(1);
            inputEl.value = newValue;
            updateSliderBackgroundVisual(slider);
        });

        slider.addEventListener('change', () => {
            const currentValue = parseFloat(inputEl.value);
            slider.dataset.baseValue = isNaN(currentValue) ? '' : currentValue;
            slider.value = '0';
            updateMacroSliderLabel(slider, 0);
            updateSliderBackgroundVisual(slider);
        });

        inputEl.addEventListener('input', () => {
            const value = parseFloat(inputEl.value);
            slider.dataset.baseValue = isNaN(value) ? '' : value;
            slider.value = '0';
            updateMacroSliderLabel(slider, 0);
            updateSliderBackgroundVisual(slider);
        });

        inputEl.addEventListener('change', () => {
            const value = parseFloat(inputEl.value);
            slider.dataset.baseValue = isNaN(value) ? '' : value;
            slider.value = '0';
            updateMacroSliderLabel(slider, 0);
        });
    });
}

function sanitizeCopiedMeal(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;
    return {
        dishName: rawData.dishName || '',
        calories: Number(rawData.calories) || 0,
        fat: Number(rawData.fat) || 0,
        carbs: Number(rawData.carbs) || 0,
        protein: Number(rawData.protein) || 0,
        image: rawData.image || null,
        mealType: rawData.mealType || null,
        copiedAt: rawData.copiedAt || new Date().toISOString()
    };
}

function persistCopiedMealData() {
    if (!copiedMealData) {
        try {
            localStorage.removeItem(COPIED_MEAL_STORAGE_KEY);
        } catch (err) {
            console.warn('Could not clear copied meal from storage', err);
        }
        return;
    }
    try {
        localStorage.setItem(COPIED_MEAL_STORAGE_KEY, JSON.stringify(copiedMealData));
    } catch (err) {
        console.warn('Could not persist copied meal', err);
    }
}

function loadCopiedMealFromStorage() {
    try {
        const stored = localStorage.getItem(COPIED_MEAL_STORAGE_KEY);
        if (stored) {
            const parsed = sanitizeCopiedMeal(JSON.parse(stored));
            copiedMealData = parsed;
        }
    } catch (err) {
        console.warn('Could not load copied meal', err);
        copiedMealData = null;
    }
}

function hideToast() {
    const toast = document.getElementById('copyToast');
    if (!toast) return;
    toast.classList.remove('visible');
    toast.style.pointerEvents = 'none';
    if (toastHideTimeoutId) {
        clearTimeout(toastHideTimeoutId);
        toastHideTimeoutId = null;
    }
}

function showToast({ message = '', duration = 2600, actionLabel = null, actionHandler = null } = {}) {
    hideToast();
    const toast = document.getElementById('copyToast');
    if (!toast) return;
    toast.innerHTML = '';

    if (actionLabel && typeof actionHandler === 'function') {
        const actionButton = document.createElement('button');
        actionButton.className = 'toast-action-button';
        actionButton.type = 'button';
        actionButton.textContent = actionLabel;
        actionButton.addEventListener('click', () => {
            hideToast();
            actionHandler();
        });
        toast.appendChild(actionButton);
        toast.style.pointerEvents = 'auto';
    } else {
        toast.style.pointerEvents = 'none';
    }

    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    toast.classList.add('visible');
    if (duration !== null) {
        toastHideTimeoutId = setTimeout(() => hideToast(), duration);
    }
}

function cloneMealForHistory(meal) {
    return JSON.parse(JSON.stringify(meal));
}

function recordAction(entry) {
    actionHistory.push({ ...entry, recordedAt: new Date().toISOString() });
    if (actionHistory.length > MAX_HISTORY) actionHistory.shift();
    updateUndoControls();
}

function updateUndoControls() {
    const undoButton = document.getElementById('undoFromSettings');
    const hasHistory = actionHistory.length > 0;
    if (undoButton) {
        undoButton.disabled = !hasHistory;
        undoButton.setAttribute('aria-disabled', String(!hasHistory));
    }
}

function undoLastAction() {
    if (!actionHistory.length) {
        showToast({ message: 'Nothing to undo' });
        return;
    }
    const entry = actionHistory.pop();
    const { action, mealType, mealDate } = entry;
    if (!meals[mealDate]) {
        meals[mealDate] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    }
    const mealList = meals[mealDate][mealType] || (meals[mealDate][mealType] = []);
    let message = 'Change undone';

    if (action === 'add') {
        const idx = mealList.findIndex(m => m.id === entry.mealSnapshot.id);
        if (idx !== -1) mealList.splice(idx, 1);
        message = 'Meal addition undone';
    } else if (action === 'delete') {
        const snapshot = entry.mealSnapshot;
        if (entry.wasSoftDelete) {
            const existing = mealList.find(m => m.id === snapshot.id);
            if (existing) {
                Object.assign(existing, snapshot);
                existing.deleted = false;
                existing.needsSync = snapshot.needsSync;
            } else {
                mealList.splice(entry.originalIndex ?? mealList.length, 0, snapshot);
            }
        } else {
            mealList.splice(Math.min(entry.originalIndex ?? mealList.length, mealList.length), 0, snapshot);
        }
        message = 'Meal restored';
    }

    updateDisplay();
    saveToLocalStorageAndQueueSync();
    updateUndoControls();
    showToast({ message });
}

function setCopiedMealData(rawData, options = {}) {
    const { silent = false } = options;
    const sanitized = sanitizeCopiedMeal(rawData);
    if (!sanitized) return;
    copiedMealData = sanitized;
    persistCopiedMealData();
    updatePasteButtonsState();
    if (!silent) showToast({ message: 'Meal copied' });
}

function updatePasteButtonsState() {
    const hasData = !!copiedMealData;
    document.querySelectorAll('.pasteMealButton').forEach(button => {
        button.disabled = !hasData;
        button.setAttribute('aria-disabled', String(!hasData));
    });
}

function pasteMealIntoForm(mealType) {
    if (!copiedMealData) {
        showToast({ message: 'Copy a meal first' });
        return;
    }
    const data = copiedMealData;
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    if (dishNameInput) dishNameInput.value = data.dishName || '';
    const caloriesInput = document.getElementById(`${mealType}Calories`);
    if (caloriesInput) caloriesInput.value = data.calories || 0;
    const fatInput = document.getElementById(`${mealType}Fat`);
    if (fatInput) fatInput.value = data.fat || 0;
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    if (carbsInput) carbsInput.value = data.carbs || 0;
    const proteinInput = document.getElementById(`${mealType}Protein`);
    if (proteinInput) proteinInput.value = data.protein || 0;

    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (uploadedImage) {
        if (data.image) {
            uploadedImage.src = data.image;
            uploadedImage.style.display = 'block';
        } else {
            uploadedImage.src = '';
            uploadedImage.style.display = 'none';
        }
    }

    resetMacroSlidersForMealType(mealType);
    showToast({ message: 'Meal pasted' });
}

// --- DATE NAVIGATION ---
async function changeDate(delta) {
    const { year, month, day } = getLocalDateParts(currentDate);
    const newDateCandidate = new Date(year, month, day);
    newDateCandidate.setDate(newDateCandidate.getDate() + delta);
    currentDate = newDateCandidate;

    updateDateDisplay();
    localStorage.setItem(getLocalStorageKey('currentDate'), formatLocalDateForStorage(currentDate));

    if (googleIdToken && currentGoogleUserIdForStorage) {
        await loadDataFromServer(formatLocalDateForStorage(currentDate));
        if (pollingIntervalId) pollForUpdates();
    } else {
        loadFromLocalStorage();
    }
}

async function goToToday() {
    const today = new Date();
    const { year, month, day } = getLocalDateParts(today);
    currentDate = new Date(year, month, day);

    updateDateDisplay();
    localStorage.setItem(getLocalStorageKey('currentDate'), formatLocalDateForStorage(currentDate));

    if (googleIdToken && currentGoogleUserIdForStorage) {
        await loadDataFromServer(formatLocalDateForStorage(currentDate));
        if (pollingIntervalId) pollForUpdates();
    } else {
        loadFromLocalStorage();
    }
}

function updateDateDisplay() {
    const displayElement = document.getElementById('currentDateDisplay');
    if (displayElement) {
        if (currentDate instanceof Date && !isNaN(currentDate)) {
            displayElement.textContent = currentDate.toDateString();
        } else {
            const today = new Date(); const p = getLocalDateParts(today);
            currentDate = new Date(p.year, p.month, p.day); 
            displayElement.textContent = currentDate.toDateString() + " (Date Recovered)";
            console.error("updateDateDisplay: currentDate was invalid, recovered to:", currentDate.toDateString());
        }
    }
}

// --- MEAL FORM UI MANAGEMENT ---

// Helper function to update the main "Add/Cancel" button text for a meal slot
function updateAddMealButtonText(mealType, isEditing, isAdding) {
    const addMealButton = document.querySelector(`#${mealType}Slot > button:first-of-type`);
    if (addMealButton) {
        const mealTypeName = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        if (isEditing) {
            addMealButton.textContent = `Cancel Editing ${mealTypeName}`;
        } else if (isAdding) {
            addMealButton.textContent = `Cancel Adding ${mealTypeName}`;
        } else {
            addMealButton.textContent = `Add ${mealTypeName}`;
        }
    }
}

// Main function to toggle meal forms open/closed and manage states
function toggleMealForm(mealType) {
    const form = document.getElementById(`${mealType}Form`);
    if (!form) return;

    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    const calorieInput = document.getElementById(`${mealType}Calories`);
    const fatInput = document.getElementById(`${mealType}Fat`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const proteinInput = document.getElementById(`${mealType}Protein`);
    
    const saveButton = form.querySelector('.saveMealButton');
    const generateButton = form.querySelector('.generateMacrosButton');
    const aiEditButton = form.querySelector('.aiEditMacrosButton');

    const isFormCurrentlyOpen = form.style.display === 'block';
    const isEditingExistingMealItem = !!saveButton.dataset.editingId; // True if "Save Edit" is active (an item is being edited)

    if (!isFormCurrentlyOpen) { // ---- ACTION: OPENING THE FORM ----
        // If another form is open (either for add or edit), close it first
        for (const type of ['breakfast', 'lunch', 'dinner', 'snacks']) {
            if (type !== mealType) {
                const otherForm = document.getElementById(`${type}Form`);
                if (otherForm && otherForm.style.display === 'block') {
                    toggleMealForm(type); // Close other open forms
                }
            }
        }
        
        form.style.display = 'block';
        scrollFormIntoView(mealType);

        if (isEditingExistingMealItem) { 
            // This specific state (opening form FOR an item edit) is mostly set by editMeal().
            // editMeal() itself calls form.style.display = 'block' if needed,
            // then sets its specific button states.
            // So, this branch in toggleMealForm confirms the main button text.
            mealFormEditState[mealType] = true;
            mealFormAddState[mealType] = false;
            updateAddMealButtonText(mealType, true, false); // "Cancel Editing..."
        } else { // Opening for a NEW meal (not an existing item edit)
            if(dishNameInput) dishNameInput.value = '';
            if(calorieInput) calorieInput.value = '';
            if(fatInput) fatInput.value = '';
            if(carbsInput) carbsInput.value = '';
            if(proteinInput) proteinInput.value = '';
            if(uploadedImage) { uploadedImage.style.display = 'none'; uploadedImage.src = ''; }
            
            if (saveButton.dataset.originalText) saveButton.textContent = saveButton.dataset.originalText;
            if (saveButton.dataset.editingId) delete saveButton.dataset.editingId;
            if (form.dataset.originalMealName) delete form.dataset.originalMealName;

            if (generateButton) { generateButton.style.display = 'block'; generateButton.textContent = 'Generate Macros'; }
            if (aiEditButton) aiEditButton.style.display = 'none';
            
            resetMacroSlidersForMealType(mealType);

            mealFormEditState[mealType] = false; 
            mealFormAddState[mealType] = true; 
            updateAddMealButtonText(mealType, false, true); // "Cancel Adding..."
        }
    } else { // ---- ACTION: HIDING THE FORM ----
        form.style.display = 'none';
        
        if(dishNameInput) dishNameInput.value = '';
        if(calorieInput) calorieInput.value = '';
        if(fatInput) fatInput.value = '';
        if(carbsInput) carbsInput.value = '';
        if(proteinInput) proteinInput.value = '';
        if(uploadedImage) { uploadedImage.style.display = 'none'; uploadedImage.src = ''; }

        resetMacroSlidersForMealType(mealType);

        if (saveButton.dataset.editingId) delete saveButton.dataset.editingId;
        if (form.dataset.originalMealName) delete form.dataset.originalMealName;
        if (saveButton.dataset.originalText) saveButton.textContent = saveButton.dataset.originalText;

        if (generateButton) { generateButton.style.display = 'block'; generateButton.textContent = 'Generate Macros'; }
        if (aiEditButton) { aiEditButton.style.display = 'none'; aiEditButton.textContent = 'AI Update'; }
        
        mealFormEditState[mealType] = false; 
        mealFormAddState[mealType] = false;  
        updateAddMealButtonText(mealType, false, false); // Main button back to "Add [MealType]"
    }
}

function toggleExerciseForm() {
    const form = document.getElementById('exerciseForm');
    if(form) form.style.display = form.style.display === 'none' || form.style.display === '' ? 'block' : 'none';
}

// --- DATA MANIPULATION (LOCAL STATE) ---
function addMeal(mealType, existingImage = null) {
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    const caloriesInput = document.getElementById(`${mealType}Calories`);
    const fatInput = document.getElementById(`${mealType}Fat`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const proteinInput = document.getElementById(`${mealType}Protein`);

    const dishName = dishNameInput ? dishNameInput.value.trim() : '';
    const calories = caloriesInput ? (parseFloat(caloriesInput.value) || 0) : 0;
    const fat = fatInput ? (parseFloat(fatInput.value) || 0) : 0;
    const carbs = carbsInput ? (parseFloat(carbsInput.value) || 0) : 0;
    const protein = proteinInput ? (parseFloat(proteinInput.value) || 0) : 0;

    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    let image = existingImage;
    if (!image && imageElement && imageElement.src && imageElement.style.display !== 'none') {
        image = imageElement.src;
    }

    if (!dishName && calories === 0 && fat === 0 && carbs === 0 && protein === 0 && !image) {
        toggleMealForm(mealType); // Just close the form, toggleMealForm handles resets.
        return;
    }

    const meal = { 
        id: Date.now(),
        dishName, calories, fat, carbs, protein, image, 
        needsSync: true,
        lastModified: new Date().toISOString()
    };
    const mealDate = formatLocalDateForStorage(currentDate);

    if (!meals[mealDate]) meals[mealDate] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    if (!Array.isArray(meals[mealDate][mealType])) meals[mealDate][mealType] = [];
    
    meals[mealDate][mealType].push(meal);
    recordAction({ action: 'add', mealType, mealDate, mealSnapshot: cloneMealForHistory(meal) });
    updateDisplay();
    saveToLocalStorageAndQueueSync();
    
    toggleMealForm(mealType); // Close and reset form states.
}

function addExercise() {
    const caloriesInput = document.getElementById('exerciseCalories');
    const calories = caloriesInput ? (parseFloat(caloriesInput.value) || 0) : 0;
    const exerciseDate = formatLocalDateForStorage(currentDate);

    if (calories === 0 && (!exercise[exerciseDate] || exercise[exerciseDate] === 0)) return;
    if (!exercise[exerciseDate] && calories === 0) return;

    exercise[exerciseDate] = calories; 
    
    updateDisplay();
    saveToLocalStorageAndQueueSync();
    if(caloriesInput) caloriesInput.value = '';
    toggleExerciseForm();
}

function removeMeal(mealType, id) {
    const mealDate = formatLocalDateForStorage(currentDate);
    id = parseInt(id, 10);
    if (!meals[mealDate] || !meals[mealDate][mealType]) return;
    const mealIndex = meals[mealDate][mealType].findIndex(meal => meal.id === id);
    if (mealIndex === -1) return;
    const mealToRemove = meals[mealDate][mealType][mealIndex];
    if (!mealToRemove) return;

    const mealSnapshot = cloneMealForHistory(mealToRemove);
    const wasSoftDelete = mealToRemove.needsSync === false && !!mealToRemove.serverId;

    if (wasSoftDelete) { 
        mealToRemove.deleted = true;
        mealToRemove.needsSync = true; 
        mealToRemove.lastModified = new Date().toISOString();
    } else { 
        meals[mealDate][mealType].splice(mealIndex, 1);
    }

    recordAction({ action: 'delete', mealType, mealDate, mealSnapshot, originalIndex: mealIndex, wasSoftDelete });
    updateDisplay();
    saveToLocalStorageAndQueueSync();
    showToast({ message: 'Meal deleted', actionLabel: 'Undo', actionHandler: undoLastAction, duration: 4000 });
}

function removeExercise() {
    const exerciseDate = formatLocalDateForStorage(currentDate);
    if (exercise[exerciseDate] !== undefined && exercise[exerciseDate] !== 0) {
        exercise[exerciseDate] = 0;
        updateDisplay();
        saveToLocalStorageAndQueueSync();
    } else if (exercise[exerciseDate] === undefined) {
        exercise[exerciseDate] = 0;
        updateDisplay();
        saveToLocalStorageAndQueueSync();
    }
}

// Called when an existing meal's "edit" (pencil) button is clicked
function editMeal(mealType, id) {
    const mealDate = formatLocalDateForStorage(currentDate);
    id = parseInt(id);
    if (!meals[mealDate] || !meals[mealDate][mealType]) return;
    const mealToEdit = meals[mealDate][mealType].find(m => m.id === id);
    if (!mealToEdit || mealToEdit.deleted) return;

    const form = document.getElementById(`${mealType}Form`);
    if (!form) return;

    // If another meal form is open, close it first
    for (const type of ['breakfast', 'lunch', 'dinner', 'snacks']) {
        if (type !== mealType) {
            const otherForm = document.getElementById(`${type}Form`);
            if (otherForm && otherForm.style.display === 'block') {
                toggleMealForm(type); 
            }
        }
    }

    form.dataset.originalMealName = mealToEdit.dishName || '';
    document.getElementById(`${mealType}DishName`).value = mealToEdit.dishName || '';
    document.getElementById(`${mealType}Calories`).value = mealToEdit.calories || '';
    document.getElementById(`${mealType}Fat`).value = mealToEdit.fat || '';
    document.getElementById(`${mealType}Carbs`).value = mealToEdit.carbs || '';
    document.getElementById(`${mealType}Protein`).value = mealToEdit.protein || '';

    resetMacroSlidersForMealType(mealType);

    const uploadedImageDisplay = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (uploadedImageDisplay) {
        if (mealToEdit.image) {
            uploadedImageDisplay.src = mealToEdit.image; uploadedImageDisplay.style.display = 'block';
        } else {
            uploadedImageDisplay.style.display = 'none'; uploadedImageDisplay.src = '';
        }
    }
    
    // Ensure form is visible (toggleMealForm will handle state if it was already open for add)
    if (form.style.display === 'none' || mealFormAddState[mealType]) { // Open if closed OR if open for add
        if (mealFormAddState[mealType]) { // If switching from add to edit for same mealtype
             toggleMealForm(mealType); // Close "add" state first
        }
        form.style.display = 'block';
        scrollFormIntoView(mealType);
    }

    const saveButton = form.querySelector(`.saveMealButton`);
    if (!saveButton.dataset.originalText) saveButton.dataset.originalText = saveButton.textContent;
    saveButton.textContent = 'Save Edit';
    saveButton.dataset.editingId = id.toString();

    const generateButton = form.querySelector('.generateMacrosButton');
    const aiEditButton = form.querySelector(`.aiEditMacrosButton`);

    if (generateButton) generateButton.style.display = 'none';
    if (aiEditButton) {
        aiEditButton.style.display = 'block';
        aiEditButton.textContent = 'AI Update'; 
        aiEditButton.onclick = () => { 
            const originalMealNameFromForm = form.dataset.originalMealName || document.getElementById(`${mealType}DishName`).value;
            const currentMealNameInField = document.getElementById(`${mealType}DishName`).value;
            const currentCaloriesInField = parseFloat(document.getElementById(`${mealType}Calories`).value) || 0;
            const currentFatInField = parseFloat(document.getElementById(`${mealType}Fat`).value) || 0;
            const currentCarbsInField = parseFloat(document.getElementById(`${mealType}Carbs`).value) || 0;
            const currentProteinInField = parseFloat(document.getElementById(`${mealType}Protein`).value) || 0;
            
            handleAiEditMacros(mealType, originalMealNameFromForm, currentMealNameInField, currentCaloriesInField, currentFatInField, currentCarbsInField, currentProteinInField);
        };
    }
    mealFormEditState[mealType] = true; 
    mealFormAddState[mealType] = false; 
    updateAddMealButtonText(mealType, true, false);
}

// Called when "Save Edit" is clicked from the form
function completeEditMeal(mealType, editingId) {
    const mealDate = formatLocalDateForStorage(currentDate);
    if (!meals[mealDate] || !meals[mealDate][mealType]) {
        console.error(`Meals data structure not initialized for ${mealDate} and ${mealType}`);
        toggleMealForm(mealType); 
        return;
    }
    const mealIndex = meals[mealDate][mealType].findIndex(m => m.id === editingId);
    if (mealIndex === -1 || (meals[mealDate][mealType][mealIndex] && meals[mealDate][mealType][mealIndex].deleted)) {
        console.error("Meal to edit not found or already deleted during completeEditMeal.");
        toggleMealForm(mealType); 
        return;
    }

    const editedMeal = meals[mealDate][mealType][mealIndex];
    editedMeal.dishName = document.getElementById(`${mealType}DishName`).value.trim();
    editedMeal.calories = parseFloat(document.getElementById(`${mealType}Calories`).value) || 0;
    editedMeal.fat = parseFloat(document.getElementById(`${mealType}Fat`).value) || 0;
    editedMeal.carbs = parseFloat(document.getElementById(`${mealType}Carbs`).value) || 0;
    editedMeal.protein = parseFloat(document.getElementById(`${mealType}Protein`).value) || 0;
    
    const currentImageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (currentImageElement && currentImageElement.style.display !== 'none' && currentImageElement.src && currentImageElement.src !== editedMeal.image) {
        editedMeal.image = currentImageElement.src;
    } else if ((!currentImageElement || currentImageElement.style.display === 'none' || !currentImageElement.src) && editedMeal.image) {
        editedMeal.image = null; 
    }

    editedMeal.needsSync = true;
    editedMeal.lastModified = new Date().toISOString();

    updateDisplay();
    saveToLocalStorageAndQueueSync();
    
    toggleMealForm(mealType); // Close and reset form states.
}


function copyMeal(mealType, id) {
    const mealDate = formatLocalDateForStorage(currentDate);
    id = parseInt(id, 10);
    if (!meals[mealDate] || !meals[mealDate][mealType]) return;
    const mealToCopy = meals[mealDate][mealType].find(meal => meal.id === id);
    if (!mealToCopy || mealToCopy.deleted) return;

    const payload = {
        dishName: mealToCopy.dishName || '',
        calories: Number(mealToCopy.calories) || 0,
        fat: Number(mealToCopy.fat) || 0,
        carbs: Number(mealToCopy.carbs) || 0,
        protein: Number(mealToCopy.protein) || 0,
        image: mealToCopy.image || null,
        mealType,
        copiedAt: new Date().toISOString()
    };

    setCopiedMealData(payload);
}

// clearInputs is likely not needed if toggleMealForm handles clearing on close.
// function clearInputs(mealType) { ... } 

// --- UI UPDATES ---
function updateDisplay() {
    let totals = { calories: 0, fat: 0, carbs: 0, protein: 0 };
    const mealDate = formatLocalDateForStorage(currentDate);
    const currentMealsForDate = meals[mealDate] || { breakfast: [], lunch: [], dinner: [], snacks: [] };
    const currentExercise = exercise[mealDate] || 0;

    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(mealType => {
        const mealItemsContainer = document.getElementById(`${mealType}Items`);
        if (!mealItemsContainer) return;
        mealItemsContainer.innerHTML = '';

        const currentMealsOfType = currentMealsForDate[mealType] || [];
        if (Array.isArray(currentMealsOfType)) {
            currentMealsOfType.forEach((meal) => {
                if (meal.deleted) return;

                totals.calories += meal.calories || 0;
                totals.fat += meal.fat || 0;
                totals.carbs += meal.carbs || 0;
                totals.protein += meal.protein || 0;
                const mealItem = document.createElement('div');
                mealItem.className = 'meal-item';
                // if (meal.needsSync) mealItem.style.outline = "2px dashed orange";
                
                mealItem.innerHTML = `
                    <div class="drag-area"><div class="dot-matrix"></div></div>
                    ${meal.image ? `<img src="${meal.image}" alt="${meal.dishName || 'Meal image'}" class="meal-image">` : ''}
                    <div class="meal-info">
                        <h4>${meal.dishName || 'Unnamed Meal'}</h4>
                        <p>Cals: ${meal.calories || 0} | Fat: ${meal.fat || 0}g | Carbs: ${meal.carbs || 0}g | Protein: ${meal.protein || 0}g</p>
                    </div>
                    <div class="button-area">
                        <button class="duplicate-button icon-button" aria-label="Copy meal" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-copy"></i><span class="icon-button-label">Copy</span></button>
                        <button class="edit-button icon-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-pencil"></i><span class="icon-button-label">Edit</span></button>
                        <button class="remove-button icon-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-trash"></i><span class="icon-button-label">Delete</span></button>
                    </div>`;
                mealItemsContainer.appendChild(mealItem);
            });
        }
    });

    const exerciseItemsContainer = document.getElementById('exerciseItems');
    if (exerciseItemsContainer) {
        exerciseItemsContainer.innerHTML = '';
        if (currentExercise > 0) {
            const exerciseItem = document.createElement('div');
            exerciseItem.className = 'exercise-item';
            exerciseItem.innerHTML = `
                <div class="exercise-info"><p>Calories burned: ${currentExercise}</p></div>
                <div class="button-area"><button class="remove-button remove-exercise-button icon-button" aria-label="Delete exercise"><i class="fa-solid fa-trash"></i><span class="icon-button-label">Delete</span></button></div>`;
            exerciseItemsContainer.appendChild(exerciseItem);
        }
    }
    
    const totalExerciseEl = document.getElementById('totalExercise');
    if (totalExerciseEl) totalExerciseEl.textContent = currentExercise;

    updateProgressBars(totals, currentExercise);
    if (typeof initDragAndDrop === "function" && document.getElementById('breakfastItems')) initDragAndDrop();

    document.querySelectorAll('.remove-button:not(.remove-exercise-button)').forEach(button => {
        button.onclick = () => removeMeal(button.dataset.mealType, button.dataset.id);
    });
    document.querySelectorAll('.remove-exercise-button').forEach(button => {
        button.onclick = () => removeExercise();
    });
    document.querySelectorAll('.edit-button').forEach(button => {
        button.onclick = () => editMeal(button.dataset.mealType, button.dataset.id);
    });
    document.querySelectorAll('.duplicate-button').forEach(button => {
        button.onclick = () => copyMeal(button.dataset.mealType, button.dataset.id);
    });
}

function updateProgressBars(totals, exerciseCalories) {
    const effectiveCaloriesGoal = (parseFloat(goals.calories) || 0) + (parseFloat(exerciseCalories) || 0);
    updateProgressBar('caloriesProgressFill', parseFloat(totals.calories) || 0, effectiveCaloriesGoal);
    updateProgressBar('fatProgressFill', parseFloat(totals.fat) || 0, parseFloat(goals.fat) || 0);
    updateProgressBar('carbsProgressFill', parseFloat(totals.carbs) || 0, parseFloat(goals.carbs) || 0);
    updateProgressBar('proteinProgressFill', parseFloat(totals.protein) || 0, parseFloat(goals.protein) || 0);
}

function updateProgressBar(fillId, total, goal) {
    const progressFill = document.getElementById(fillId);
    if (!progressFill) return;

    const progressBar = progressFill.parentElement;
    if (!progressBar || !progressBar.classList.contains('progress-bar')) {
        console.error("Could not find .progress-bar for", fillId);
        return;
    }

    let overfill = progressBar.querySelector('.progress-bar-overfill');
    if (!overfill) {
        overfill = document.createElement('div');
        overfill.className = 'progress-bar-overfill';
        progressBar.appendChild(overfill);
    }

    const percentage = goal > 0 ? (total / goal) * 100 : (total > 0 ? 101 : 0);

    const displayTotal = Number(total).toFixed(fillId === 'caloriesProgressFill' ? 0 : 1);
    const displayGoal = Number(goal).toFixed(fillId === 'caloriesProgressFill' ? 0 : 1);

    progressFill.style.width = `${Math.min(100, percentage)}%`;

    const textElementId = fillId.replace('Fill', 'Text');
    const textElement = document.getElementById(textElementId);

    if (textElement) {
        textElement.textContent = `${displayTotal}${fillId === 'caloriesProgressFill' ? '' : 'g'} / ${displayGoal}${fillId === 'caloriesProgressFill' ? '' : 'g'}`;

        // --- DYNAMIC TEXT POSITIONING LOGIC ---
        const textContainerWidthPercentage = Math.min(100, percentage);
        textElement.style.width = `${textContainerWidthPercentage}%`;

        // Threshold for switching text alignment (e.g., if text roughly needs 20% of bar width)
        // This value might need tweaking based on your font size and typical text length.
        const MIN_PERCENTAGE_FOR_RIGHT_ALIGN = 15; // Adjust as needed

        if (textContainerWidthPercentage < MIN_PERCENTAGE_FOR_RIGHT_ALIGN) {
            // When the fill (and thus text container) is very narrow,
            // align text to the left of the *entire progress bar*
            // and make the text container wide enough to show the text.
            textElement.style.justifyContent = 'flex-start';
            textElement.style.paddingLeft = '5px'; // Add some left padding
            textElement.style.paddingRight = '0';  // Remove right padding if any
            textElement.style.width = '100%'; // Make text container full width to show text at left
        } else {
            // Otherwise, align text to the right of its (potentially partial) width
            textElement.style.justifyContent = 'flex-end';
            textElement.style.paddingLeft = '0';   // Remove left padding
            textElement.style.paddingRight = '5px'; // Restore right padding
            // textElement.style.width is already set above to textContainerWidthPercentage
        }
        // --- END DYNAMIC TEXT POSITIONING LOGIC ---
    }

    if (percentage > 100) {
        overfill.style.width = `${Math.min(100, percentage - 100)}%`;
        overfill.style.display = 'block';
    } else {
        overfill.style.width = '0';
        overfill.style.display = 'none';
    }
}

// --- LOCAL STORAGE MANAGEMENT ---
function saveToLocalStorageAndQueueSync() {
    const MAX_STORAGE = 5 * 1024 * 1024; // 5MB
    const BUFFER_PERCENTAGE = 0.1; // 10% buffer
    const TARGET_STORAGE = MAX_STORAGE * (1 - BUFFER_PERCENTAGE);

    function getCurrentUserDataSize() {
        let total = 0;
        const keysToSum = ['meals', 'exercise', 'goals', 'currentDate', 'hasLoggedInBefore'];
        keysToSum.forEach(baseKey => {
            const userKey = getLocalStorageKey(baseKey);
            if (localStorage.getItem(userKey)) {
                total += (localStorage.getItem(userKey).length + userKey.length) * 2; // Approx bytes
            }
        });
        return total;
    }

    function removeOldestUserMealEntry() {
        const userMealsKey = getLocalStorageKey('meals');
        let userMealsData = JSON.parse(localStorage.getItem(userMealsKey) || '{}');
        const dates = Object.keys(userMealsData).sort(); 
        for (const date of dates) {
            for (const mealType in userMealsData[date]) {
                if (userMealsData[date][mealType] && userMealsData[date][mealType].length > 0) {
                    const removedMeal = userMealsData[date][mealType].shift();
                    console.warn("LocalStorage: Removed oldest meal for space:", removedMeal ? removedMeal.dishName : 'Unknown meal', "on", date);
                    if (userMealsData[date][mealType].length === 0) delete userMealsData[date][mealType];
                    if (Object.keys(userMealsData[date]).length === 0) delete userMealsData[date];
                    localStorage.setItem(userMealsKey, JSON.stringify(userMealsData));
                    
                    meals = userMealsData; 
                    if (date === formatLocalDateForStorage(currentDate)) {
                        updateDisplay(); 
                    }
                    return true;
                }
            }
        }
        return false;
    }

    try {
        let currentSize = getCurrentUserDataSize();
        while (currentSize > TARGET_STORAGE) {
            if (!removeOldestUserMealEntry()) {
                console.warn("Could not free up enough space in localStorage for user:", currentGoogleUserIdForStorage);
                break;
            }
            currentSize = getCurrentUserDataSize();
        }

        localStorage.setItem(getLocalStorageKey('meals'), JSON.stringify(meals));
        localStorage.setItem(getLocalStorageKey('exercise'), JSON.stringify(exercise));
        localStorage.setItem(getLocalStorageKey('goals'), JSON.stringify(goals));
        localStorage.setItem(getLocalStorageKey('currentDate'), formatLocalDateForStorage(currentDate));

        if (googleIdToken && currentGoogleUserIdForStorage && isServerOnline) {
            if (serverSyncTimeout) clearTimeout(serverSyncTimeout);
            serverSyncTimeout = setTimeout(syncDataToServer, SYNC_DEBOUNCE_TIME);
        }
    } catch (e) {
        console.error("Error saving to localStorage:", e);
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert("LocalStorage is full. Older data is being removed to make space. Please try your action again.");
        }
    }
}

function loadFromLocalStorage() {
    const mealsKey = getLocalStorageKey('meals');
    const exerciseKey = getLocalStorageKey('exercise');
    const goalsKey = getLocalStorageKey('goals');
    const currentDateKey = getLocalStorageKey('currentDate');

    try {
        const storedGoals = localStorage.getItem(goalsKey);
        goals = storedGoals ? JSON.parse(storedGoals) : { calories: 2000, fat: 67, carbs: 275, protein: 75 };

        const storedMeals = localStorage.getItem(mealsKey);
        meals = storedMeals ? JSON.parse(storedMeals) : {};

        const storedExercise = localStorage.getItem(exerciseKey);
        exercise = storedExercise ? JSON.parse(storedExercise) : {};
        
        const storedDateStr = localStorage.getItem(currentDateKey);
        if (storedDateStr) {
            currentDate = parseStoredDateToLocalDate(storedDateStr);
        } else {
             const today = new Date(); const p = getLocalDateParts(today);
             currentDate = new Date(p.year, p.month, p.day);
        }
        localStorage.setItem(currentDateKey, formatLocalDateForStorage(currentDate));

        const currentFormattedDate = formatLocalDateForStorage(currentDate);
        if (!meals[currentFormattedDate]) meals[currentFormattedDate] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
        if (exercise[currentFormattedDate] === undefined) exercise[currentFormattedDate] = 0;

    } catch (e) { 
        console.error("Error loading from localStorage:", e);
        goals = { calories: 2000, fat: 67, carbs: 275, protein: 75 };
        meals = {}; exercise = {};
        const today = new Date(); const p = getLocalDateParts(today);
        currentDate = new Date(p.year, p.month, p.day);
        const currentFormattedDate = formatLocalDateForStorage(currentDate);
        if (!meals[currentFormattedDate]) meals[currentFormattedDate] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
        if (exercise[currentFormattedDate] === undefined) exercise[currentFormattedDate] = 0;
    }
    
    updateDateDisplay();
    updateDisplay(); 
}

// --- GOOGLE AUTHENTICATION & USER STATE ---
function handleGoogleCredentialResponse(response) {
    if (response.credential) {
        const idTokenPayload = decodeJwtResponse(response.credential);
        if (idTokenPayload) {
            const userInfo = {
                id: idTokenPayload.sub, name: idTokenPayload.name,
                givenName: idTokenPayload.given_name, familyName: idTokenPayload.family_name,
                imageUrl: idTokenPayload.picture, email: idTokenPayload.email
            };
            userInfoGlobal = userInfo;
            googleIdToken = response.credential;
            currentGoogleUserIdForStorage = idTokenPayload.sub;

            localStorage.setItem('googleUser', JSON.stringify(userInfo));
            localStorage.setItem('googleIdToken', response.credential);
            localStorage.setItem(getLocalStorageKey('hasLoggedInBefore'), 'true');

            updateUIAfterSignIn(userInfo);
            closeModal();
        } else alert('Could not decode Google user information.');
    } else { console.error('Google Sign-In failed, no credential received.'); alert('Google Sign-In failed.'); }
}

async function updateUIAfterSignIn(userInfo) {
    if (!userInfo && localStorage.getItem('googleUser')) {
        try {
            userInfo = JSON.parse(localStorage.getItem('googleUser'));
            googleIdToken = localStorage.getItem('googleIdToken');
            if (userInfo && userInfo.id) {
                currentGoogleUserIdForStorage = userInfo.id;
            } else { throw new Error("Stored user info is invalid or missing ID."); }
        } catch(e) {
            console.error("Error parsing stored user info or invalid data, signing out:", e);
            handleGoogleSignOut(); return;
        }
    } else if (!userInfo) {
        updateUIAfterSignOut(); loadFromLocalStorage(); return;
    }

    userInfoGlobal = userInfo;
    if(!googleIdToken && localStorage.getItem('googleIdToken')) googleIdToken = localStorage.getItem('googleIdToken');
    if(!currentGoogleUserIdForStorage && userInfo.id) currentGoogleUserIdForStorage = userInfo.id;

    const userInfoDiv = document.getElementById('userInfo');
    if (userInfoDiv) {
        userInfoDiv.innerHTML = '';
        if (userInfo.imageUrl) {
            const profilePic = document.createElement('img');
            profilePic.src = userInfo.imageUrl; profilePic.alt = 'User';
            userInfoDiv.appendChild(profilePic);
        }
        userInfoDiv.style.display = 'flex';
        userInfoDiv.removeEventListener('click', toggleUserInfoMenu);
        userInfoDiv.addEventListener('click', toggleUserInfoMenu);
    }

    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'none';
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'flex';
    const userInfoMenuLogoutBtn = document.getElementById('userInfoMenuLogout');
    if (userInfoMenuLogoutBtn) userInfoMenuLogoutBtn.style.display = 'flex';

    loadFromLocalStorage(); // Load local data first, always.

    // Attempt to connect to the server immediately after sign-in
    if (googleIdToken && currentGoogleUserIdForStorage) {
        console.log("Attempting initial server connection after sign-in...");
        try {
            // Try to fetch initial data. This also serves as a connectivity test.
            const healthResponse = await fetch(`${BACKEND_URL}/health`, { method: 'GET', cache: 'no-store' });
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                if (healthData.status === 'live') {
                    isServerOnline = true; // We successfully connected
                    serverJustCameOnlineForPolling = true; // Hint for polling
                    console.log("Server is live. Proceeding with initial data load and sync.");
                    await loadDataFromServer(formatLocalDateForStorage(currentDate)); // Load fresh data
                    await syncDataToServer(); // Sync any pending local changes
                } else {
                    isServerOnline = false;
                    console.warn("Server reported not live during initial check after login. Relying on local data.");
                }
            } else {
                isServerOnline = false;
                console.warn("Could not reach server health endpoint during initial check after login. Status:", healthResponse.status, ". Relying on local data.");
            }
        } catch (error) {
            isServerOnline = false;
            console.error("Error during initial server connection attempt after login:", error, ". Relying on local data.");
        }
    } else {
        console.log("Not attempting server connection: No Google ID token or user ID.");
    }

    startPollingForUpdates(); // Start regular polling regardless of initial success
    updateDisplay(); // Ensure UI reflects any data loaded
}

function handleGoogleSignOut() {
    stopPollingForUpdates();
    const prevUserId = currentGoogleUserIdForStorage;

    localStorage.removeItem('googleUser');
    localStorage.removeItem('googleIdToken');
    if (prevUserId) localStorage.removeItem(getLocalStorageKey('hasLoggedInBefore', prevUserId));

    googleIdToken = null; userInfoGlobal = null; currentGoogleUserIdForStorage = null; 

    meals = {}; exercise = {};
    goals = { calories: 2000, fat: 67, carbs: 275, protein: 75 };
    const today = new Date(); const p = getLocalDateParts(today);
    currentDate = new Date(p.year, p.month, p.day); 

    updateUIAfterSignOut();
    loadFromLocalStorage(); 

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
}

function updateUIAfterSignOut() {
    const userInfoDiv = document.getElementById('userInfo');
    if (userInfoDiv) {
        userInfoDiv.innerHTML = ''; userInfoDiv.style.display = 'none';
        userInfoDiv.removeEventListener('click', toggleUserInfoMenu);
    }
    const userInfoMenu = document.getElementById('userInfoMenu');
    if (userInfoMenu) userInfoMenu.style.display = 'none';

    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'flex';
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'none';
    const userInfoMenuLogoutBtn = document.getElementById('userInfoMenuLogout');
    if (userInfoMenuLogoutBtn) userInfoMenuLogoutBtn.style.display = 'none';
}

function checkLoginStateOnLoad() {
    const storedUserJSON = localStorage.getItem('googleUser');
    const storedToken = localStorage.getItem('googleIdToken');

    if (storedUserJSON && storedToken) {
        try {
            const userInfo = JSON.parse(storedUserJSON);
            if (!userInfo || !userInfo.id) throw new Error("Stored user info invalid.");
            userInfoGlobal = userInfo;
            googleIdToken = storedToken;
            currentGoogleUserIdForStorage = userInfo.id;
            updateUIAfterSignIn(userInfo); 
        } catch (e) {
            console.error("Error parsing stored user or token. Clearing auth data.", e);
            localStorage.removeItem('googleUser'); localStorage.removeItem('googleIdToken');
            currentGoogleUserIdForStorage = null; 
            updateUIAfterSignOut();
            loadFromLocalStorage();
        }
    } else {
        currentGoogleUserIdForStorage = null;
        updateUIAfterSignOut();
        loadFromLocalStorage();
    }
}

function initializeGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try {
            google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredentialResponse });
            const googleButtonContainer = document.getElementById('googleLoginButtonContainer');
            if (googleButtonContainer) {
                google.accounts.id.renderButton(googleButtonContainer,
                    { theme: "outline", size: "large", type: "standard", text: "signin_with", shape: "rectangular", logo_alignment: "left" }
                );
            } else console.error('Google login button container not found.');
        } catch (error) { console.error("Error initializing Google Sign In:", error); }
    } else { setTimeout(initializeGoogleSignIn, 500); }
}

// --- SERVER COMMUNICATION & SYNC ---
async function loadDataFromServer(dateStr) {
    if (!googleIdToken || !currentGoogleUserIdForStorage) {
        updateDisplay(); return;
    }

    try {
        console.log(`loadDataFromServer: Fetching data for ${dateStr} from ${BACKEND_URL}`);
        const response = await fetch(`${BACKEND_URL}/api/data?date=${dateStr}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${googleIdToken}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} loading data for ${dateStr}`);
            if (response.status === 401) {
                console.warn("loadDataFromServer: Authorization error (401). Signing out.");
                handleGoogleSignOut();
            }
            updateDisplay(); return;
        }
        const serverData = await response.json();

        if (serverData.goals) {
            goals = serverData.goals;
            localStorage.setItem(getLocalStorageKey('goals'), JSON.stringify(goals));
        }

        // Use a deep copy of local meals for this date to avoid direct mutation issues during merge
        // or be very careful if not deep-cloning. For simplicity and safety, let's conceptualize it as operating on copies.
        const localMealsForDateBeforeMerge = meals[dateStr] ? JSON.parse(JSON.stringify(meals[dateStr])) : { breakfast: [], lunch: [], dinner: [], snacks: [] };
        const serverMealsForDate = serverData.meals || { breakfast: [], lunch: [], dinner: [], snacks: [] };
        const mergedMealsForDateOutput = { breakfast: [], lunch: [], dinner: [], snacks: [] };

        ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(mealType => {
            const localItems = localMealsForDateBeforeMerge[mealType] ? [...localMealsForDateBeforeMerge[mealType]] : []; // Operable copy
            const serverItems = serverMealsForDate[mealType] || [];
            const resultItemsForType = [];

            // 1. Process items from the server
            serverItems.forEach(sItem => {
                const localMatchIndex = localItems.findIndex(lItem => lItem.id === sItem.id && !lItem.deleted); // Find non-deleted local match

                if (localMatchIndex > -1) {
                    const localMatch = localItems[localMatchIndex];
                    const serverTimestamp = new Date(sItem.lastModified || 0).getTime();
                    const localTimestamp = new Date(localMatch.lastModified || 0).getTime();

                    if (localMatch.needsSync && localTimestamp > serverTimestamp) {
                        // Local item is newer and pending sync, prioritize local
                        resultItemsForType.push({ ...localMatch });
                    } else {
                        // Server item is newer, or local is synced/older. Take server version.
                        resultItemsForType.push({ ...sItem, needsSync: false, serverId: sItem.serverId || sItem.id });
                    }
                    localItems.splice(localMatchIndex, 1); // Remove processed item from local list
                } else {
                    // Item is on server but not locally (or local was deleted and server item is newer/authoritative)
                    resultItemsForType.push({ ...sItem, needsSync: false, serverId: sItem.serverId || sItem.id });
                }
            });

            // 2. Process remaining local items (those not matched with server items)
            localItems.forEach(lItem => {
                if (lItem.deleted && lItem.needsSync) {
                    // Local item is marked for deletion and needs sync. Keep it for sync.
                    resultItemsForType.push({ ...lItem });
                } else if (!lItem.deleted && lItem.serverId) {
                    // Local item is NOT marked for deletion, HAS a serverId, but was NOT in server's response.
                    // This means it was deleted on the server/another client. So, DON'T add it to result.
                    console.log(`Merge: Local item "${lItem.dishName}" (Client ID: ${lItem.id}, ServerID: ${lItem.serverId}) not found on server for date ${dateStr}. Removing from local view.`);
                } else if (!lItem.deleted && !lItem.serverId) {
                    // Local item is NOT marked for deletion, does NOT have a serverId.
                    // This is a new local item that hasn't been synced yet. Add it for sync.
                    resultItemsForType.push({ ...lItem, needsSync: true });
                }
                // If lItem.deleted is true but needsSync is false, it means deletion was synced. We can ignore it.
                // If lItem.deleted is false, lItem.serverId exists, and it *was* matched with a server item, it's already handled.
            });

            mergedMealsForDateOutput[mealType] = resultItemsForType.sort((a, b) => (a.id || 0) - (b.id || 0));
        });

        meals[dateStr] = mergedMealsForDateOutput;

        if (serverData.exercise !== undefined) {
            exercise[dateStr] = serverData.exercise;
        } else if (exercise[dateStr] === undefined) {
            exercise[dateStr] = 0;
        }
        localStorage.setItem(getLocalStorageKey('meals'), JSON.stringify(meals));
        localStorage.setItem(getLocalStorageKey('exercise'), JSON.stringify(exercise));

    } catch (error) {
        console.error("Failed to load or merge data from server:", error);
    }
    updateDisplay(); // Update UI after merge
}

async function syncDataToServer() {
    if (!googleIdToken || !currentGoogleUserIdForStorage) {
        return;
    }
    // if (!isServerOnline) { // Rely on fetch failure for this specific attempt
    //     console.warn("Sync skipped: Server marked offline by checkServerStatus.");
    //     return;
    // }

    let pendingSyncData = { mealsToUpdate: [], mealsToDelete: [], exercisePerDate: {}, goals: null };
    let changesFound = false;
    for (const dateKey in meals) {
        const dayMeals = meals[dateKey];
        for (const mealType in dayMeals) {
            (dayMeals[mealType] || []).forEach(meal => {
                if (meal.needsSync) {
                    changesFound = true;
                    if (meal.deleted) pendingSyncData.mealsToDelete.push({ client_id: meal.id, date: dateKey, serverId: meal.serverId });
                    else pendingSyncData.mealsToUpdate.push({ ...meal, date: dateKey, mealType: mealType });
                }
            });
        }
    }
    const currentFormattedDate = formatLocalDateForStorage(currentDate);
    // Smart sync: only include exercise/goals if there are meal changes OR if they themselves changed
    // This part of your logic might need refinement if you want to sync goals/exercise independently
    // of meal changes when they are modified locally.
    // For now, assuming your existing logic for `changesFound` is what you intend.
    if (changesFound) {
        // Only include goals/exercise if meals are also changing, or make this check more granular
        if (exercise[currentFormattedDate] !== undefined) { // Or some other flag to indicate exercise needs sync
             pendingSyncData.exercisePerDate[currentFormattedDate] = exercise[currentFormattedDate];
        }
        // Similarly for goals, only send if they genuinely need syncing
        pendingSyncData.goals = goals; // Or some other flag for goals.needsSync
    }


    if (!changesFound && Object.keys(pendingSyncData.exercisePerDate).length === 0 && !pendingSyncData.goals) {
        // console.log("syncDataToServer: No changes to sync.");
        return;
    }
    console.log("syncDataToServer: Attempting to sync data to", BACKEND_URL, pendingSyncData); // Added log

    try {
        const response = await fetch(`${BACKEND_URL}/api/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${googleIdToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingSyncData)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Unknown sync error"}));
            console.error(`Sync failed! Status: ${response.status}`, errorData.error || response.statusText);
            if (response.status === 401) {
                console.warn("syncDataToServer: Authorization error (401). Signing out.");
                handleGoogleSignOut();
            }
            // Don't set isServerOnline = false here.
            return;
        }
        // ... (rest of your existing successful sync handling) ...
        const syncResult = await response.json();
        console.log("Sync successful:", syncResult);
        (syncResult.syncedMealClientIds || []).forEach(syncedClientId => {
            for (const dateKey in meals) {
                for (const mealType in meals[dateKey]) {
                    if (!meals[dateKey][mealType]) continue;
                    const meal = meals[dateKey][mealType].find(m => m.id === syncedClientId);
                    if (meal) {
                        meal.needsSync = false; delete meal.deleted;
                        if (syncResult.mealServerIds && syncResult.mealServerIds[syncedClientId]) meal.serverId = syncResult.mealServerIds[syncedClientId];
                    }
                }
            }
        });
        (syncResult.deletedMealClientIds || []).forEach(deletedClientId => {
             for (const dateKey in meals) {
                for (const mealType in meals[dateKey]) {
                    if (!meals[dateKey][mealType]) continue;
                    meals[dateKey][mealType] = meals[dateKey][mealType].filter(m => m.id !== deletedClientId);
                }
            }
        });
        localStorage.setItem(getLocalStorageKey('meals'), JSON.stringify(meals));
        updateDisplay();

    } catch (error) {
        console.error("Error during syncDataToServer fetch:", error);
        // Don't set isServerOnline = false here.
    }
}

// --- POLLING FUNCTIONS ---
async function pollForUpdates() {
    if (!googleIdToken || !currentGoogleUserIdForStorage || !isServerOnline || document.hidden) return;
    const dateStrToPoll = formatLocalDateForStorage(currentDate);
    try {
        const response = await fetch(`${BACKEND_URL}/api/data?date=${dateStrToPoll}`, {
            method: 'GET', headers: { 'Authorization': `Bearer ${googleIdToken}` }
        });
        if (!response.ok) {
            if (response.status === 401) { console.error("Polling: Auth error (401). Stopping polling and signing out."); handleGoogleSignOut(); } 
            else console.error(`Polling: HTTP error! status: ${response.status} for date ${dateStrToPoll}`);
            return;
        }
        const serverDataForDate = await response.json();
        let localDataWasChangedByPolling = false;
        if (serverDataForDate.goals && JSON.stringify(goals) !== JSON.stringify(serverDataForDate.goals)) {
            goals = serverDataForDate.goals;
            localStorage.setItem(getLocalStorageKey('goals'), JSON.stringify(goals));
            localDataWasChangedByPolling = true;
        }
        const serverExercise = serverDataForDate.exercise !== undefined ? serverDataForDate.exercise : 0;
        const localExercise = exercise[dateStrToPoll] !== undefined ? exercise[dateStrToPoll] : 0;
        if (localExercise !== serverExercise) {
            exercise[dateStrToPoll] = serverExercise; localDataWasChangedByPolling = true;
        }
        const serverMeals = serverDataForDate.meals || { breakfast: [], lunch: [], dinner: [], snacks: [] };
        if (!meals[dateStrToPoll]) meals[dateStrToPoll] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
        let mealsChangedDirectlyByPoll = false;
        for (const mealType of ['breakfast', 'lunch', 'dinner', 'snacks']) {
            const serverItems = serverMeals[mealType] || [];
            const localItemsOriginal = JSON.parse(JSON.stringify(meals[dateStrToPoll][mealType] || []));
            let currentLocalItemsForType = meals[dateStrToPoll][mealType] || [];
            const newMergedItemsForType = [];
            const serverItemsMap = new Map(serverItems.map(item => [item.id, item]));
            for (const lItem of currentLocalItemsForType) {
                const sItemMatch = serverItemsMap.get(lItem.id);
                if (sItemMatch) { 
                    if (lItem.needsSync && new Date(lItem.lastModified) > new Date(sItemMatch.lastModified || 0)) newMergedItemsForType.push({ ...lItem });
                    else newMergedItemsForType.push({ ...sItemMatch, needsSync: false });
                    serverItemsMap.delete(lItem.id);
                } else if (!lItem.deleted) { 
                    if (lItem.needsSync) newMergedItemsForType.push({ ...lItem });
                    else console.warn(`Polling: Meal ${lItem.dishName} (id: ${lItem.id}) deleted on server, removing locally.`);
                }
            }
            serverItemsMap.forEach(sItem => newMergedItemsForType.push({ ...sItem, needsSync: false }));
            newMergedItemsForType.sort((a,b) => a.id - b.id);
            if (JSON.stringify(localItemsOriginal) !== JSON.stringify(newMergedItemsForType)) mealsChangedDirectlyByPoll = true;
            meals[dateStrToPoll][mealType] = newMergedItemsForType;
        }
        if (mealsChangedDirectlyByPoll) localDataWasChangedByPolling = true;
        if (localDataWasChangedByPolling) {
            console.log(`Polling: Data for ${dateStrToPoll} was updated by server poll.`);
            localStorage.setItem(getLocalStorageKey('meals'), JSON.stringify(meals));
            localStorage.setItem(getLocalStorageKey('exercise'), JSON.stringify(exercise));
            updateDisplay();
        }
    } catch (error) { console.error("Polling fetch/processing error:", error); }
}

function startPollingForUpdates() {
    stopPollingForUpdates(); 
    if (googleIdToken && currentGoogleUserIdForStorage) {
        pollingIntervalId = setInterval(pollForUpdates, POLLING_INTERVAL);
        if (isServerOnline || serverJustCameOnlineForPolling) { pollForUpdates(); serverJustCameOnlineForPolling = false; }
    }
}

function stopPollingForUpdates() {
    if (pollingIntervalId) { clearInterval(pollingIntervalId); pollingIntervalId = null; }
}

async function checkServerStatus() {
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    if (!statusIcon || !statusText) return;

    // Visual cue for checking
    if (!statusIcon.classList.contains('blink')) {
        statusIcon.classList.add('blink');
        statusIcon.addEventListener('animationend', () => statusIcon.classList.remove('blink'), { once: true });
    }
    statusIcon.classList.remove('green', 'red'); statusIcon.classList.add('yellow');
    statusText.textContent = 'Checking...';

    let wasPreviouslyOnline = isServerOnline; // Keep track of previous state

    try {
        const response = await fetch(`${BACKEND_URL}/health`, { method: 'GET', cache: 'no-store' });
        const data = await response.json();
        if (response.ok && data.status === 'live') {
            statusIcon.classList.replace('yellow','green'); statusText.textContent = 'Live';
            isServerOnline = true; // Authoritative "online" state
            if (!wasPreviouslyOnline) { // Just came online
                console.log("Server status: Came online.");
                serverJustCameOnlineForPolling = true; // For polling logic
                if (googleIdToken && currentGoogleUserIdForStorage) {
                    console.log("Server just came online, loading fresh data for current date and then syncing.");
                    // Load data for the current date first to get the latest from server
                    await loadDataFromServer(formatLocalDateForStorage(currentDate));
                    // Then sync any local changes that might have occurred or were pending
                    await syncDataToServer(); 
                }
                startPollingForUpdates(); // Ensure polling is active
            }
            // If it was already online, polling should be handling updates.
            if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; } // Stop rapid checks if successful
        } else {
            statusIcon.classList.replace('yellow','red');
            statusText.textContent = response.ok ? 'Unknown' : 'Sleeping';
            isServerOnline = false; // Authoritative "offline" state
            if (wasPreviouslyOnline) console.warn("Server status: Went offline or is sleeping.");
            stopPollingForUpdates();
            if (!statusCheckInterval) statusCheckInterval = setInterval(checkServerStatus, 10000); // Resume rapid checks
        }
    } catch (error) {
        statusIcon.classList.replace('yellow','red'); statusText.textContent = 'Offline';
        isServerOnline = false; // Authoritative "offline" state due to error
        if (wasPreviouslyOnline) console.warn("Server status: Connection lost.");
        stopPollingForUpdates();
        if (!statusCheckInterval) statusCheckInterval = setInterval(checkServerStatus, 10000); // Resume rapid checks
    }
}

// --- IMAGE HANDLING & OPENAI ---
function populateMacroFieldsFromResponse(data, mealType, sourceLabel) {
    const hasStructuredMacros = data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        typeof data.dishName === 'string' &&
        ['calories', 'fat', 'carbs', 'protein'].every(key => Number.isFinite(Number(data[key])));

    if (!hasStructuredMacros) {
        console.warn(`Could not parse full macros from AI ${sourceLabel} response:`, data);
        return false;
    }

    document.getElementById(`${mealType}DishName`).value = data.dishName.trim();
    document.getElementById(`${mealType}Calories`).value = Number(data.calories).toFixed(0);
    document.getElementById(`${mealType}Fat`).value = Number(data.fat).toFixed(1);
    document.getElementById(`${mealType}Carbs`).value = Number(data.carbs).toFixed(1);
    document.getElementById(`${mealType}Protein`).value = Number(data.protein).toFixed(1);
    resetMacroSlidersForMealType(mealType);
    return true;
}

async function handleMealNameInput(mealName, mealType, editingId = null) {
    if (!mealName) {
        alert('Please enter a meal name.');
        return;
    }
    const formElement = document.getElementById(`${mealType}Form`);
    const generateButtonElement = formElement ? formElement.querySelector('.generateMacrosButton') : null;
    const originalButtonText = "Generate Macros"; 
    if (generateButtonElement) generateButtonElement.textContent = 'Generating...';
    let saveInitiated = false; 
    try {
        const response = await fetch(`${BACKEND_URL}/estimate_macros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meal_name: mealName })
        });
        if (!response.ok) {
            let errorText = `HTTP error! status: ${response.status}`;
            try {
                const errorJson = await response.json();
                if (errorJson && errorJson.error) { errorText = errorJson.error; }
                else { errorText += ` - ${await response.text()}`; }
            } catch (e) { /* Stick to original errorText */ }
            throw new Error(errorText);
        }
        const data = await response.json();
        const populatedSuccessfully = populateMacroFieldsFromResponse(data, mealType, 'text');
        if (populatedSuccessfully) {
            const saveButton = document.querySelector(`#${mealType}Form .saveMealButton`);
            if (saveButton && saveButton.dataset.editingId) { 
                saveInitiated = true;
                completeEditMeal(mealType, parseInt(saveButton.dataset.editingId)); 
            } else if (saveButton) { 
                saveInitiated = true;
                addMeal(mealType); 
            }
        } else {
            alert("AI could not fully populate the meal details from the name. Please review.");
        }
    } catch (error) {
        alert(`Error estimating macros: ${error.message}`);
        console.error("Error in handleMealNameInput:", error);
    } finally {
        if (!saveInitiated && generateButtonElement) {
            generateButtonElement.textContent = originalButtonText;
        }
        else if (generateButtonElement && generateButtonElement.textContent === 'Generating...') {
             generateButtonElement.textContent = originalButtonText;
        }
    }
}

async function handleImageUpload(input, mealType) {
    const file = input.files[0];
    if (file) {
        const formElement = document.getElementById(`${mealType}Form`);
        const uploadLabels = formElement ? Array.from(formElement.querySelectorAll('.image-upload-container label')) : [];
        const originalLabelTexts = [];
        uploadLabels.forEach(label => {
            originalLabelTexts.push(label.textContent);
            label.textContent = 'Processing...';
        });
        let saveInitiated = false;
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const compressedImage = await compressImage(e.target.result, 1000, 1000);
                const uploadedImageDisplay = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
                if (uploadedImageDisplay) {
                    uploadedImageDisplay.src = compressedImage; uploadedImageDisplay.style.display = 'block';
                }
                const blob = dataURLToBlob(compressedImage);
                const formData = new FormData(); formData.append('image', blob, 'compressed.jpg');
                const response = await fetch(`${BACKEND_URL}/analyze_image`, { method: 'POST', body: formData });
                if (!response.ok) {
                    let errorText = `HTTP error! status: ${response.status}`;
                    try {
                        const errorJson = await response.json();
                        if (errorJson && errorJson.error) { errorText = errorJson.error; }
                        else { errorText += ` - ${await response.text()}`; }
                    } catch (parseErr) { /* Stick to original errorText */ }
                    throw new Error(errorText);
                }
                const data = await response.json();
                const populatedSuccessfully = populateMacroFieldsFromResponse(data, mealType, 'image analysis');
                if (populatedSuccessfully) {
                    const saveButton = document.querySelector(`#${mealType}Form .saveMealButton`);
                    if (saveButton && saveButton.dataset.editingId) {
                        saveInitiated = true; completeEditMeal(mealType, parseInt(saveButton.dataset.editingId));
                    } else if (saveButton) {
                        saveInitiated = true; addMeal(mealType);
                    }
                } else {
                    alert("AI could not fully populate meal details from the image. Please review.");
                }
            } catch (error) {
                alert(`Error processing image: ${error.message}`);
                console.error("Error in handleImageUpload (reader.onload):", error);
            } finally {
                uploadLabels.forEach((label, index) => {
                    if (originalLabelTexts[index]) label.textContent = originalLabelTexts[index];
                });
                if (input) input.value = null; 
            }
        };
        reader.onerror = function (error) {
            console.error("FileReader error:", error); alert("Error reading the image file.");
            uploadLabels.forEach((label, index) => {
                if (originalLabelTexts[index]) label.textContent = originalLabelTexts[index];
            });
            if (input) input.value = null;
        };
        reader.readAsDataURL(file);
    } else {
        if (input) input.value = null;
    }
}

async function handleAiEditMacros(mealType, originalMealName, newMealName, calories, fat, carbs, protein) {
    if (!newMealName) {
        alert('Please ensure the meal name is entered (you can include your command there).');
        return;
    }
    const form = document.getElementById(`${mealType}Form`);
    const buttonElement = form ? form.querySelector('.aiEditMacrosButton') : null;
    const saveButton = form ? form.querySelector('.saveMealButton') : null; 
    const originalAiButtonText = "AI Update";
    if(buttonElement) buttonElement.textContent = 'AI Updating...';
    let saveInitiated = false;
    try {
        const response = await fetch(`${BACKEND_URL}/edit_macros_with_command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                original_meal_name: originalMealName, new_meal_name: newMealName,
                current_calories: calories, current_fat: fat, current_carbs: carbs, current_protein: protein
            })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Unknown error from server"}));
            console.error(`AI Edit HTTP error: ${response.status}`, errorData);
            alert(`Error updating macros with AI: ${errorData.error || response.statusText}`);
            if(buttonElement) buttonElement.textContent = originalAiButtonText;
            return;
        }
        const data = await response.json();
        const populatedSuccessfully = populateMacroFieldsFromResponse(data, mealType, 'command edit');
        if (populatedSuccessfully) {
            if (saveButton && saveButton.dataset.editingId) {
                saveInitiated = true;
                completeEditMeal(mealType, parseInt(saveButton.dataset.editingId));
            } else { // AI Edit should ideally only be available in edit mode.
                if(buttonElement) buttonElement.textContent = originalAiButtonText;
            }
        } else {
            alert("AI could not fully update the meal. Please review the fields.");
            if(buttonElement) buttonElement.textContent = originalAiButtonText;
        }
    } catch (error) {
        if(!saveInitiated && buttonElement) { 
            buttonElement.textContent = originalAiButtonText;
        }
        alert(`Error during AI macro update: ${error.message}`);
        console.error("Error in handleAiEditMacros:", error);
    }
}

function compressImage(src, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width; let height = img.height;
            if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
            } else { if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; } }
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = (err) => { console.error("Image compression error", err); reject(err);};
        img.src = src;
    });
}

function dataURLToBlob(dataurl) {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid Data URL for blob conversion");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || mimeMatch.length < 2) throw new Error("Could not parse MIME type from Data URL");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

// --- MODALS & MENUS ---
function initializeModal() { 
    const imageModal = document.getElementById('imageModal');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');
    document.body.addEventListener('click', (event) => {
        const img = event.target.closest('.meal-image');
        if (imageModal && loginContent && signupContent && img && img.src &&
            (loginContent.style.display === 'none' || loginContent.style.display === '') &&
            (signupContent.style.display === 'none' || signupContent.style.display === '')) {
            showImageModal(img.src);
        }
    }, true);
    if (imageModal) imageModal.addEventListener('click', (event) => { if (event.target === imageModal ) closeModal(); });
}

function showImageModal(src) { 
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');
    if (!modal || !modalImg || !loginContent || !signupContent) return;
    modalImg.src = src; modalImg.style.display = 'block';
    loginContent.style.display = 'none'; signupContent.style.display = 'none';
    modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
}

function closeModal() { 
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');
    const settingsModal = document.getElementById('settingsModal');
    if (modal && modal.style.display !== 'none') modal.style.display = 'none';
    if (modalImg && modalImg.style.display !== 'none') { modalImg.src = ''; modalImg.style.display = 'none'; }
    if (loginContent && loginContent.style.display !== 'none') loginContent.style.display = 'none';
    if (signupContent && signupContent.style.display !== 'none') signupContent.style.display = 'none';
    if (settingsModal && settingsModal.style.display !== 'none') settingsModal.style.display = 'none';
    document.body.style.overflow = '';
}

function toggleUserInfoMenu(event) {
    event.stopPropagation();
    const userInfoMenu = document.getElementById('userInfoMenu');
    const mainMenu = document.getElementById('menu');
    const userInfoDiv = document.getElementById('userInfo');
    const header = document.querySelector('.header');
    if (!userInfoMenu || !userInfoDiv || !header) return;
    if (mainMenu && mainMenu.style.display === 'block') mainMenu.style.display = 'none';
    const isUserInfoMenuOpen = userInfoMenu.style.display === 'block';
    userInfoMenu.style.display = isUserInfoMenuOpen ? 'none' : 'block';
    if (!isUserInfoMenuOpen) {
        const emailDisplay = document.getElementById('userInfoMenuEmail');
        if (emailDisplay) emailDisplay.textContent = (userInfoGlobal && userInfoGlobal.email) ? userInfoGlobal.email : 'Email not available';
        const userInfoRect = userInfoDiv.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const menuWidth = userInfoMenu.offsetWidth;
        let leftPosition = (userInfoRect.right - headerRect.left) - menuWidth;
        if (leftPosition < 0) leftPosition = 0;
        userInfoMenu.style.left = `${leftPosition}px`;
        userInfoMenu.style.top = `${userInfoRect.bottom - headerRect.top}px`;
    }
}

function initDragAndDrop() {
    const slots = ['breakfastItems', 'lunchItems', 'dinnerItems', 'snacksItems'];
    slots.forEach(slotId => {
        const slot = document.getElementById(slotId);
        if (slot && typeof Sortable !== 'undefined') {
            if (slot.sortableInstance) slot.sortableInstance.destroy();
            slot.sortableInstance = new Sortable(slot, {
                group: 'meals', animation: 150, handle: '.drag-area',
                onEnd: function (evt) {
                    const mealTypeFrom = evt.from.id.replace('Items', '');
                    const mealTypeTo = evt.to.id.replace('Items', '');
                    const mealDate = formatLocalDateForStorage(currentDate);
                    if (meals[mealDate] && meals[mealDate][mealTypeFrom] && meals[mealDate][mealTypeTo]) {
                        if (!Array.isArray(meals[mealDate][mealTypeFrom])) meals[mealDate][mealTypeFrom] = [];
                        if (!Array.isArray(meals[mealDate][mealTypeTo])) meals[mealDate][mealTypeTo] = [];
                        const movedMealArray = meals[mealDate][mealTypeFrom].splice(evt.oldIndex, 1);
                        if (movedMealArray && movedMealArray.length > 0) {
                            const movedMeal = movedMealArray[0];
                            movedMeal.needsSync = true; movedMeal.lastModified = new Date().toISOString();
                            meals[mealDate][mealTypeTo].splice(evt.newIndex, 0, movedMeal);
                            saveToLocalStorageAndQueueSync(); updateDisplay();
                        }
                    }
                }
            });
        }
    });
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    initializeMacroSliders();
    loadCopiedMealFromStorage();
    updatePasteButtonsState();
    updateUndoControls();
    document.querySelectorAll('.pasteMealButton').forEach(button => {
        button.addEventListener('click', () => pasteMealIntoForm(button.dataset.mealType));
    });
    const undoSettingsButton = document.getElementById('undoFromSettings');
    if (undoSettingsButton) {
        undoSettingsButton.addEventListener('click', () => undoLastAction());
    }
    document.querySelectorAll('.meal-form').forEach(form => form.style.display = 'none');
    const exerciseForm = document.getElementById('exerciseForm');
    if(exerciseForm) exerciseForm.style.display = 'none';
    const settingsModal = document.getElementById('settingsModal');
    if(settingsModal) settingsModal.style.display = 'none';
    const mainMenu = document.getElementById('menu');
    if(mainMenu) mainMenu.style.display = 'none';
    const userInfoMenu = document.getElementById('userInfoMenu');
    if(userInfoMenu) userInfoMenu.style.display = 'none';

    initializeGoogleSignIn();
    checkLoginStateOnLoad(); 
    checkServerStatus(); 
    setInterval(checkServerStatus, 30000); // Check server status periodically

    initializeModal();
    initDragAndDrop();

    window.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPollingForUpdates();
        else if (googleIdToken && currentGoogleUserIdForStorage && isServerOnline) startPollingForUpdates();
    });
    
    document.querySelectorAll('.saveMealButton').forEach(button => {
        if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
        const mealType = button.dataset.mealType; 
        if (!mealType) { console.error("Save button is missing data-meal-type attribute:", button); return; }
        button.addEventListener('click', (event) => {
            if (button.dataset.editingId) completeEditMeal(mealType, parseInt(button.dataset.editingId));
            else addMeal(mealType);
        });
    });
    
    document.querySelectorAll('.generateMacrosButton').forEach(button => {
        button.addEventListener('click', (event) => {
            const form = event.target.closest('.meal-form');
            if(form) {
                const mealType = form.id.replace('Form', '');
                const dishNameInput = form.querySelector(`#${mealType}DishName`);
                if (dishNameInput) handleMealNameInput(dishNameInput.value, mealType);
            }
        });
    });

    const saveExerciseButton = document.getElementById('saveExerciseButton');
    if(saveExerciseButton) saveExerciseButton.addEventListener('click', addExercise);

    const mainMenuButton = document.getElementById('menuButton');
    const pageHeader = document.querySelector('.header'); // Define pageHeader here
    if (mainMenuButton && mainMenu && pageHeader) {
        mainMenuButton.addEventListener('click', function (event) {
            event.stopPropagation();
            if (userInfoMenu && userInfoMenu.style.display === 'block') userInfoMenu.style.display = 'none';
            const isMainMenuOpen = mainMenu.style.display === 'block';
            mainMenu.style.display = isMainMenuOpen ? 'none' : 'block';
            if (!isMainMenuOpen) {
                const buttonRect = mainMenuButton.getBoundingClientRect();
                const headerRect = pageHeader.getBoundingClientRect();
                mainMenu.style.left = `${buttonRect.left - headerRect.left}px`;
                mainMenu.style.top = `${buttonRect.bottom - headerRect.top}px`;
            }
        });
    }

    const mainLogoutButton = document.getElementById('logoutButton');
    if (mainLogoutButton) mainLogoutButton.addEventListener('click', handleGoogleSignOut);
    const userInfoMenuLogoutBtn = document.getElementById('userInfoMenuLogout');
    if (userInfoMenuLogoutBtn) {
        userInfoMenuLogoutBtn.addEventListener('click', () => {
            handleGoogleSignOut();
            if (userInfoMenu) userInfoMenu.style.display = 'none';
        });
    }
    
    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) {
        loginMenuItem.addEventListener('click', function () {
            const imageModal = document.getElementById('imageModal');
            const modalImage = document.getElementById('modalImage');
            const loginModalContent = document.getElementById('loginModalContent');
            const signupModalContent = document.getElementById('signupModalContent');
            if (modalImage) modalImage.style.display = 'none';
            if (loginModalContent) loginModalContent.style.display = 'block';
            if (signupModalContent) signupModalContent.style.display = 'none';
            if (imageModal) imageModal.style.display = 'flex';
            if (mainMenu) mainMenu.style.display = 'none'; 
            if (userInfoMenu) userInfoMenu.style.display = 'none'; 
            document.body.style.overflow = 'hidden';
        });
    }
    
    const signUpLink = document.getElementById('signUpLink');
    if (signUpLink) {
        signUpLink.addEventListener('click', function (event) {
            event.preventDefault();
            const loginM = document.getElementById('loginModalContent');
            const signupM = document.getElementById('signupModalContent');
            if(loginM) loginM.style.display = 'none';
            if(signupM) signupM.style.display = 'block';
        });
    }

    const backToLoginLink = document.getElementById('backToLoginLink');
    if (backToLoginLink) {
        backToLoginLink.addEventListener('click', function (event) {
            event.preventDefault();
            const loginM = document.getElementById('loginModalContent');
            const signupM = document.getElementById('signupModalContent');
            if(signupM) signupM.style.display = 'none';
            if(loginM) loginM.style.display = 'block';
        });
    }
    
    const loginFormElement = document.getElementById('loginForm'); 
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', e => { e.preventDefault(); alert('Standard login not implemented. Please use Google Sign-In.'); });
    }
    const forgotPassword = document.getElementById('forgotPassword');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', e => { e.preventDefault(); alert('Forgot password not implemented.'); });
    }

    const settingsMenuItem = document.querySelector('.menu-item-settings');
    const settingsForm = document.getElementById('settingsForm');
    if(settingsMenuItem && settingsModal && settingsForm) {
        settingsMenuItem.addEventListener('click', () => {
            if (mainMenu) mainMenu.style.display = 'none';
            if (userInfoMenu) userInfoMenu.style.display = 'none';
            settingsModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            document.getElementById('dailyCalories').value = goals.calories;
            document.getElementById('dailyFat').value = goals.fat;
            document.getElementById('dailyCarbs').value = goals.carbs;
            document.getElementById('dailyProtein').value = goals.protein;
        });
        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            goals.calories = parseInt(document.getElementById('dailyCalories').value) || goals.calories;
            goals.fat = parseInt(document.getElementById('dailyFat').value) || goals.fat;
            goals.carbs = parseInt(document.getElementById('dailyCarbs').value) || goals.carbs;
            goals.protein = parseInt(document.getElementById('dailyProtein').value) || goals.protein;
            saveToLocalStorageAndQueueSync();
            settingsModal.style.display = 'none';
            document.body.style.overflow = '';
            updateDisplay();
        });
    }

    document.addEventListener('click', function(event) {
        const isClickInsideMainMenu = mainMenuButton && mainMenuButton.contains(event.target) || mainMenu && mainMenu.contains(event.target);
        const isClickInsideUserInfoMenu = document.getElementById('userInfo') && document.getElementById('userInfo').contains(event.target) || userInfoMenu && userInfoMenu.contains(event.target);
        if (mainMenu && mainMenu.style.display === 'block' && !isClickInsideMainMenu) mainMenu.style.display = 'none';
        if (userInfoMenu && userInfoMenu.style.display === 'block' && !isClickInsideUserInfoMenu) userInfoMenu.style.display = 'none';
        const activeSettingsModal = document.getElementById('settingsModal');
        if (activeSettingsModal && activeSettingsModal.style.display === 'flex' && event.target === activeSettingsModal) closeModal();
    });

    window.addEventListener('resize', function() {
        if (!pageHeader) return; // pageHeader defined in DOMContentLoaded
        const headerRect = pageHeader.getBoundingClientRect();
        if (mainMenu && mainMenu.style.display === 'block' && mainMenuButton) {
            const buttonRect = mainMenuButton.getBoundingClientRect();
            mainMenu.style.left = `${buttonRect.left - headerRect.left}px`;
            mainMenu.style.top = `${buttonRect.bottom - headerRect.top}px`;
        }
        const userInfoIcon = document.getElementById('userInfo');
        if (userInfoMenu && userInfoMenu.style.display === 'block' && userInfoIcon) {
            const userInfoRect = userInfoIcon.getBoundingClientRect();
            const menuWidth = userInfoMenu.offsetWidth;
            let leftPosition = (userInfoRect.right - headerRect.left) - menuWidth;
            if (leftPosition < 0) leftPosition = 0;
            userInfoMenu.style.left = `${leftPosition}px`;
            userInfoMenu.style.top = `${userInfoRect.bottom - headerRect.top}px`;
        }
    });
});
// --- END OF scripts.js ---
