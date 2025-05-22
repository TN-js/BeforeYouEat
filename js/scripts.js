const BACKEND_URL =  'https://beforeyoueat.onrender.com';
const GOOGLE_CLIENT_ID = '212430289140-fipq7nufjjq8psmogq5n8v8p43g73jsk.apps.googleusercontent.com';

let statusCheckInterval = null;
let isServerOnline = false;

let meals = {};
let exercise = {};
let goals = { calories: 2000, fat: 67, carbs: 275, protein: 75 };
let currentDate = new Date();

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    saveToLocalStorage();
    updateDateDisplay();
    updateDisplay();
}

function goToToday() {
    currentDate = new Date();
    saveToLocalStorage();
    updateDateDisplay();
    updateDisplay();
}

function updateDateDisplay() {
    const displayElement = document.getElementById('currentDateDisplay');
    if (displayElement) {
        displayElement.textContent = currentDate.toDateString();
    }
}

function toggleMealForm(mealType) {
    const form = document.getElementById(`${mealType}Form`);
    if (!form) return;
    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    const calorieInput = document.getElementById(`${mealType}Calories`);
    const fatInput = document.getElementById(`${mealType}Fat`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const proteinInput = document.getElementById(`${mealType}Protein`);

    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        if(uploadedImage) {
            uploadedImage.style.display = 'none';
            uploadedImage.src = '';
        }
        // Reset save button text if it was "Save Edit"
        const saveButton = form.querySelector('.saveMealButton');
        if (saveButton && saveButton.dataset.originalText) {
            saveButton.textContent = saveButton.dataset.originalText;
        }

    } else {
        form.style.display = 'none';
        if(dishNameInput) dishNameInput.value = '';
        if(calorieInput) calorieInput.value = '';
        if(proteinInput) proteinInput.value = '';
        if(carbsInput) carbsInput.value = '';
        if(fatInput) fatInput.value = '';
        if(uploadedImage) {
            uploadedImage.style.display = 'none';
            uploadedImage.src = '';
        }
    }
}

function toggleExerciseForm() {
    const form = document.getElementById('exerciseForm');
    if(form) form.style.display = form.style.display === 'none' || form.style.display === '' ? 'block' : 'none';
}

function addMeal(mealType, existingImage = null) {
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    const caloriesInput = document.getElementById(`${mealType}Calories`);
    const fatInput = document.getElementById(`${mealType}Fat`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const proteinInput = document.getElementById(`${mealType}Protein`);

    const dishName = dishNameInput ? dishNameInput.value.trim() : '';
    const calories = caloriesInput ? (parseInt(caloriesInput.value) || 0) : 0;
    const fat = fatInput ? (parseInt(fatInput.value) || 0) : 0;
    const carbs = carbsInput ? (parseInt(carbsInput.value) || 0) : 0;
    const protein = proteinInput ? (parseInt(proteinInput.value) || 0) : 0;

    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    // Use existingImage if passed (from edit), otherwise try to get it from the form if visible
    let image = existingImage;
    if (!image && imageElement && imageElement.src && imageElement.style.display !== 'none') {
        image = imageElement.src;
    }


    if (!dishName && calories === 0 && fat === 0 && carbs === 0 && protein === 0) {
        // Don't add an empty meal, maybe provide feedback or just return
        return;
    }
    const meal = { id: Date.now(), dishName, calories, fat, carbs, protein, image };
    const mealDate = formatDate(currentDate);

    if (!meals[mealDate]) {
        meals[mealDate] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    }
    if (!Array.isArray(meals[mealDate][mealType])) {
        meals[mealDate][mealType] = [];
    }
    meals[mealDate][mealType].push(meal);
    updateDisplay();
    saveToLocalStorage();
    clearInputs(mealType); // Clear after saving
    toggleMealForm(mealType); // This will hide the form
}

function addExercise() {
    const caloriesInput = document.getElementById('exerciseCalories');
    const calories = caloriesInput ? (parseInt(caloriesInput.value) || 0) : 0;
    if (calories === 0) return;
    const exerciseDate = formatDate(currentDate);
    if (!exercise[exerciseDate]) {
        exercise[exerciseDate] = 0;
    }
    exercise[exerciseDate] += calories;
    updateDisplay();
    saveToLocalStorage();
    if(caloriesInput) caloriesInput.value = '';
    toggleExerciseForm();
}

function updateDisplay() {
    let totals = { calories: 0, fat: 0, carbs: 0, protein: 0 };
    const mealDate = formatDate(currentDate);
    const currentMealsForDate = meals[mealDate] || { breakfast: [], lunch: [], dinner: [], snacks: [] };
    const currentExercise = exercise[mealDate] || 0;

    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(mealType => {
        const mealItemsContainer = document.getElementById(`${mealType}Items`);
        if (!mealItemsContainer) return;
        mealItemsContainer.innerHTML = ''; // Clear previous items

        const currentMealsOfType = currentMealsForDate[mealType] || [];
        if (Array.isArray(currentMealsOfType)) {
            currentMealsOfType.forEach((meal) => {
                totals.calories += meal.calories || 0;
                totals.fat += meal.fat || 0;
                totals.carbs += meal.carbs || 0;
                totals.protein += meal.protein || 0;
                const mealItem = document.createElement('div');
                mealItem.className = 'meal-item';
                mealItem.innerHTML = `
                    <div class="drag-area"><div class="dot-matrix"></div></div>
                    ${meal.image ? `<img src="${meal.image}" alt="${meal.dishName || 'Meal image'}" class="meal-image">` : ''}
                    <div class="meal-info">
                        <h4>${meal.dishName || 'Unnamed Meal'}</h4>
                        <p>Cals: ${meal.calories || 0} | Fat: ${meal.fat || 0}g | Carbs: ${meal.carbs || 0}g | Protein: ${meal.protein || 0}g</p>
                    </div>
                    <div class="button-area">
                        <button class="duplicate-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-copy"></i></button>
                        <button class="edit-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-pencil"></i></button>
                        <button class="remove-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fa-solid fa-trash"></i></button>
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
                <div class="button-area"><button class="remove-button remove-exercise-button"><i class="fa-solid fa-trash"></i></button></div>`;
            exerciseItemsContainer.appendChild(exerciseItem);
        }
    }
    
    const totalExerciseEl = document.getElementById('totalExercise');
    if (totalExerciseEl) totalExerciseEl.textContent = currentExercise;

    updateProgressBars(totals, currentExercise);
    if (typeof initDragAndDrop === "function") initDragAndDrop();

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
        button.onclick = () => duplicateMeal(button.dataset.mealType, button.dataset.id);
    });
}

function duplicateMeal(mealType, id) {
    const mealDate = formatDate(currentDate);
    if (!meals[mealDate] || !meals[mealDate][mealType]) return;
    const mealToDuplicate = meals[mealDate][mealType].find(meal => meal.id === parseInt(id));
    if (mealToDuplicate) {
        const newMeal = { ...mealToDuplicate, id: Date.now() }; // New ID
        meals[mealDate][mealType].push(newMeal);
        updateDisplay();
        saveToLocalStorage();
    }
}

function removeMeal(mealType, id) {
    const mealDate = formatDate(currentDate);
    if (meals[mealDate] && meals[mealDate][mealType]) {
        meals[mealDate][mealType] = meals[mealDate][mealType].filter(meal => meal.id !== parseInt(id));
        if (meals[mealDate][mealType].length === 0) {
            // delete meals[mealDate][mealType]; // Optional: clean up empty meal type arrays
        }
        // if (Object.keys(meals[mealDate]).length === 0) {
            // delete meals[mealDate]; // Optional: clean up empty date objects
        // }
    }
    updateDisplay();
    saveToLocalStorage();
}

function removeExercise() {
    const exerciseDate = formatDate(currentDate);
    if (exercise[exerciseDate]) {
        exercise[exerciseDate] = 0; // Or delete exercise[exerciseDate];
    }
    updateDisplay();
    saveToLocalStorage();
}

function editMeal(mealType, id) {
    const mealDate = formatDate(currentDate);
    if (!meals[mealDate] || !meals[mealDate][mealType]) return;
    const mealToEdit = meals[mealDate][mealType].find(m => m.id === parseInt(id));
    if (!mealToEdit) return;

    const form = document.getElementById(`${mealType}Form`);
    if (!form) return;

    document.getElementById(`${mealType}DishName`).value = mealToEdit.dishName || '';
    document.getElementById(`${mealType}Calories`).value = mealToEdit.calories || '';
    document.getElementById(`${mealType}Fat`).value = mealToEdit.fat || '';
    document.getElementById(`${mealType}Carbs`).value = mealToEdit.carbs || '';
    document.getElementById(`${mealType}Protein`).value = mealToEdit.protein || '';

    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (uploadedImage) {
        if (mealToEdit.image) {
            uploadedImage.src = mealToEdit.image;
            uploadedImage.style.display = 'block';
        } else {
            uploadedImage.style.display = 'none';
            uploadedImage.src = '';
        }
    }
    
    if (form.style.display === 'none' || form.style.display === '') { // Ensure form is visible
        form.style.display = 'block';
    }


    const saveButton = form.querySelector(`.saveMealButton`);
    if (!saveButton) return;

    if (!saveButton.dataset.originalText) { // Store original text if not already stored
        saveButton.dataset.originalText = saveButton.textContent;
    }
    saveButton.textContent = 'Save Edit';
    saveButton.dataset.editingId = id; // Store editing ID

    // The actual save logic is now part of the generic event listener for saveMealButton
    // when it detects data-editing-id. Or, you can keep a specific onclick here.
    // For clarity, let's use a specific one for edit:
    saveButton.onclick = function() {
        const editingId = saveButton.dataset.editingId;
        if (!editingId) return;

        const mealIndex = meals[mealDate][mealType].findIndex(m => m.id === parseInt(editingId));
        if (mealIndex === -1) return; // Meal not found

        meals[mealDate][mealType][mealIndex].dishName = document.getElementById(`${mealType}DishName`).value.trim();
        meals[mealDate][mealType][mealIndex].calories = parseInt(document.getElementById(`${mealType}Calories`).value) || 0;
        meals[mealDate][mealType][mealIndex].fat = parseInt(document.getElementById(`${mealType}Fat`).value) || 0;
        meals[mealDate][mealType][mealIndex].carbs = parseInt(document.getElementById(`${mealType}Carbs`).value) || 0;
        meals[mealDate][mealType][mealIndex].protein = parseInt(document.getElementById(`${mealType}Protein`).value) || 0;
        
        const currentImageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
        if (currentImageElement && currentImageElement.style.display !== 'none' && currentImageElement.src) {
            meals[mealDate][mealType][mealIndex].image = currentImageElement.src;
        } else if (!currentImageElement || currentImageElement.style.display === 'none') {
            // If image was cleared or not shown, remove it from data too
            meals[mealDate][mealType][mealIndex].image = null; 
        }
        // else keep existing image if no change


        updateDisplay();
        saveToLocalStorage();
        
        toggleMealForm(mealType); // Hide form
        saveButton.textContent = saveButton.dataset.originalText; // Restore text
        delete saveButton.dataset.editingId; // Clear editing state
        // Re-attach general save listener if specific onclick overwrote it.
        // This is handled by the general listener in DOMContentLoaded not being removed.
    };
}


async function handleMealNameInput(mealName, mealType, editingId = null) { // Added editingId
    if (!mealName) {
        alert('Please enter a meal name.');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/estimate_macros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meal_name: mealName })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const matches = data.match(/Name:\s*([^,]+?),\s*Cals:\s*(\d+(?:\.\d+)?),\s*Fat:\s*(\d+(?:\.\d+)?)\s*g,\s*Carbs:\s*(\d+(?:\.\d+)?)\s*g,\s*Protein:\s*(\d+(?:\.\d+)?)\s*g/);
        if (matches) {
            document.getElementById(`${mealType}DishName`).value = matches[1];
            document.getElementById(`${mealType}Calories`).value = parseFloat(matches[2]).toFixed(0); // Whole numbers for Cals
            document.getElementById(`${mealType}Fat`).value = parseFloat(matches[3]).toFixed(1);
            document.getElementById(`${mealType}Carbs`).value = parseFloat(matches[4]).toFixed(1);
            document.getElementById(`${mealType}Protein`).value = parseFloat(matches[5]).toFixed(1);
            
            // If NOT editing (i.e., adding a new meal and generating macros),
            // user would then click "Save [MealType]" which calls addMeal().
            // If editing, these values are now in the form, user clicks "Save Edit".
        } else {
            alert(`Error estimating macros (parsing): ${data}`);
        }
    } catch (error) {
        alert(`Error estimating macros: ${error.message}`);
    }
}

async function handleImageUpload(input, mealType) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const compressedImage = await compressImage(e.target.result, 500, 500);
                const uploadedImageDisplay = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
                if (uploadedImageDisplay) {
                    uploadedImageDisplay.src = compressedImage;
                    uploadedImageDisplay.style.display = 'block';
                }

                const blob = dataURLToBlob(compressedImage);
                const formData = new FormData();
                formData.append('image', blob, 'compressed.jpg');

                const response = await fetch(`${BACKEND_URL}/analyze_image`, { method: 'POST', body: formData });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const matches = data.match(/Name:\s*([^,]+?),\s*Cals:\s*(\d+),\s*Fat:\s*(\d+(?:\.\d+)?)\s*g,\s*Carbs:\s*(\d+(?:\.\d+)?)\s*g,\s*Protein:\s*(\d+(?:\.\d+)?)\s*g/);
                if (matches) {
                    document.getElementById(`${mealType}DishName`).value = matches[1];
                    document.getElementById(`${mealType}Calories`).value = parseFloat(matches[2]).toFixed(0); // Whole numbers
                    document.getElementById(`${mealType}Fat`).value = parseFloat(matches[3]).toFixed(1);
                    document.getElementById(`${mealType}Carbs`).value = parseFloat(matches[4]).toFixed(1);
                    document.getElementById(`${mealType}Protein`).value = parseFloat(matches[5]).toFixed(1);
                } else {
                    alert(`Error analyzing image (parsing): ${data}`);
                }
            } catch (error) {
                alert(`Error processing image: ${error.message}`);
            }
        };
        reader.readAsDataURL(file);
    }
}

async function checkServerStatus() {
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    if (!statusIcon || !statusText) return;

    statusIcon.classList.add('blink');
    statusIcon.addEventListener('animationend', () => statusIcon.classList.remove('blink'), { once: true });
    statusIcon.classList.remove('green', 'red');
    statusIcon.classList.add('yellow');
    statusText.textContent = 'Checking...';
    try {
        const response = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.status === 'live') {
            statusIcon.classList.replace('yellow','green');
            statusText.textContent = 'Live';
            isServerOnline = true;
            if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; }
        } else {
            statusIcon.classList.replace('yellow','red');
            statusText.textContent = response.ok ? 'Unknown' : 'Sleeping';
            isServerOnline = false;
            if (!statusCheckInterval) statusCheckInterval = setInterval(checkServerStatus, 10000);
        }
    } catch (error) {
        statusIcon.classList.replace('yellow','red');
        statusText.textContent = 'Offline';
        isServerOnline = false;
        if (!statusCheckInterval) statusCheckInterval = setInterval(checkServerStatus, 10000);
    }
}

function compressImage(src, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = src;
    });
}

function dataURLToBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function clearInputs(mealType) {
    if (mealType) {
        const form = document.getElementById(`${mealType}Form`);
        if (form) {
            form.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => input.value = '');
            const img = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
            if (img) {
                img.src = '';
                img.style.display = 'none';
            }
        }
    } else { // For goal inputs if any, not currently in your forms directly cleared this way
        // ...
    }
}

function saveToLocalStorage() {
    const MAX_STORAGE = 5 * 1024 * 1024;
    const BUFFER_PERCENTAGE = 0.1;
    const TARGET_STORAGE = MAX_STORAGE * (1 - BUFFER_PERCENTAGE);
    function getTotalStorageSize() { let total = 0; for (let key in localStorage) { if (localStorage.hasOwnProperty(key)) { total += (localStorage[key].length + key.length) * 2; } } return total; } // Approximation
    function getOldestMealEntry() { let oldestDate = null; let oldestMealType = null; let oldestMealId = null; const dates = Object.keys(meals).sort(); for (const date of dates) { for (const mealType in meals[date]) { if (meals[date][mealType].length > 0) { return { date, mealType, id: meals[date][mealType][0].id }; } } } return null; }
    function removeOldestMealEntry() { const oldest = getOldestMealEntry(); if (oldest && meals[oldest.date] && meals[oldest.date][oldest.mealType]) { meals[oldest.date][oldest.mealType].shift(); if (meals[oldest.date][oldest.mealType].length === 0) delete meals[oldest.date][oldest.mealType]; if (Object.keys(meals[oldest.date]).length === 0) delete meals[oldest.date]; return true; } return false; }
    try {
        let currentSize = getTotalStorageSize();
        while (currentSize > TARGET_STORAGE) { if (!removeOldestMealEntry()) break; currentSize = getTotalStorageSize(); }
        localStorage.setItem('meals', JSON.stringify(meals));
        localStorage.setItem('exercise', JSON.stringify(exercise));
        localStorage.setItem('goals', JSON.stringify(goals));
        localStorage.setItem('currentDate', formatDate(currentDate));
    } catch (e) { console.error("Error saving to localStorage:", e); }
}

function loadFromLocalStorage() {
    try {
        const storedMeals = localStorage.getItem('meals');
        if (storedMeals) meals = JSON.parse(storedMeals);
        const storedExercise = localStorage.getItem('exercise');
        if (storedExercise) exercise = JSON.parse(storedExercise);
        const storedGoals = localStorage.getItem('goals');
        if (storedGoals) goals = JSON.parse(storedGoals);
        const storedDate = localStorage.getItem('currentDate');
        if (storedDate) currentDate = new Date(storedDate);
    } catch (e) { console.error("Error loading from localStorage:", e); }
    updateDateDisplay();
    updateDisplay();
}

function initDragAndDrop() {
    const slots = ['breakfastItems', 'lunchItems', 'dinnerItems', 'snacksItems'];
    slots.forEach(slotId => {
        const slot = document.getElementById(slotId);
        if (slot && typeof Sortable !== 'undefined') {
            new Sortable(slot, {
                group: 'meals', animation: 150, handle: '.drag-area',
                onEnd: function (evt) {
                    const mealTypeFrom = evt.from.id.replace('Items', '');
                    const mealTypeTo = evt.to.id.replace('Items', '');
                    const mealDate = formatDate(currentDate);
                    if (meals[mealDate] && meals[mealDate][mealTypeFrom] && meals[mealDate][mealTypeTo]) {
                        const movedMeal = meals[mealDate][mealTypeFrom].splice(evt.oldIndex, 1)[0];
                        if (movedMeal) meals[mealDate][mealTypeTo].splice(evt.newIndex, 0, movedMeal);
                    }
                    saveToLocalStorage(); updateDisplay();
                }
            });
        }
    });
}

// --- Google Identity Services (GIS) Functions ---
function decodeJwtResponse(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { console.error("Error decoding JWT", e); return null; }
}

function handleGoogleCredentialResponse(response) {
    if (response.credential) {
        const idTokenPayload = decodeJwtResponse(response.credential);
        if (idTokenPayload) {
            const userInfo = {
                id: idTokenPayload.sub, name: idTokenPayload.name,
                givenName: idTokenPayload.given_name, familyName: idTokenPayload.family_name,
                imageUrl: idTokenPayload.picture, email: idTokenPayload.email,
                id_token: response.credential
            };
            localStorage.setItem('googleUser', JSON.stringify(userInfo));
            updateUIAfterSignIn(userInfo);
            closeModal();
        } else alert('Could not decode Google user information.');
    } else { console.error('Google Sign-In failed, no credential received.'); alert('Google Sign-In failed.'); }
}

function updateUIAfterSignIn(userInfo) {
    if (!userInfo) {
        const storedUser = localStorage.getItem('googleUser');
        if (storedUser) { try { userInfo = JSON.parse(storedUser); } catch (e) { updateUIAfterSignOut(); return; } }
        else { updateUIAfterSignOut(); return; }
    }
    const userInfoDiv = document.getElementById('userInfo');
    if (!userInfoDiv) return;
    userInfoDiv.innerHTML = '';
    if (userInfo.imageUrl) {
        const profilePic = document.createElement('img');
        profilePic.src = userInfo.imageUrl; profilePic.alt = 'User';
        profilePic.style.width = '35px'; profilePic.style.height = '35px';
        profilePic.style.borderRadius = '50%';
        // profilePic.style.marginRight = '0px'; // Name is hidden, so no margin needed
        userInfoDiv.appendChild(profilePic);
    }
    // userNameSpan creation and appending is removed to hide the name.
    userInfoDiv.style.display = 'flex';
    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'none';
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'flex';
}

function handleGoogleSignOut() {
    localStorage.removeItem('googleUser');
    updateUIAfterSignOut();
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    console.log("User signed out from the app.");
}

function updateUIAfterSignOut() {
    const userInfoDiv = document.getElementById('userInfo');
    if(userInfoDiv) { userInfoDiv.innerHTML = ''; userInfoDiv.style.display = 'none'; }
    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'flex';
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'none';
}

function checkLoginStateOnLoad() {
    const storedUser = localStorage.getItem('googleUser');
    if (storedUser) {
        try { const userInfo = JSON.parse(storedUser); updateUIAfterSignIn(userInfo); }
        catch (e) { localStorage.removeItem('googleUser'); updateUIAfterSignOut(); }
    } else updateUIAfterSignOut();
}

function initializeGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try {
            google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredentialResponse });
            const googleButtonContainer = document.getElementById('googleLoginButtonContainer');
            if (googleButtonContainer) {
                google.accounts.id.renderButton(googleButtonContainer,
                    { theme: "outline", size: "large", type: "standard", text: "signin_with", shape: "rectangular", logo_alignment: "left", width: "100%" } // Attempt to set width
                );
            } else console.error('Google login button container not found.');
        } catch (error) { console.error("Error initializing Google Sign In:", error); }
    } else { setTimeout(initializeGoogleSignIn, 500); }
}

function updateProgressBars(totals, exerciseCalories) {
    const effectiveCaloriesGoal = (goals.calories || 0) + (exerciseCalories || 0);
    updateProgressBar('caloriesProgressFill', totals.calories || 0, effectiveCaloriesGoal);
    updateProgressBar('fatProgressFill', totals.fat || 0, goals.fat || 0);
    updateProgressBar('carbsProgressFill', totals.carbs || 0, goals.carbs || 0);
    updateProgressBar('proteinProgressFill', totals.protein || 0, goals.protein || 0);
}

function updateProgressBar(fillId, total, goal) {
    const progressFill = document.getElementById(fillId);
    if (!progressFill) return;
    const progressBar = progressFill.closest('.progress-bar');
    if (!progressBar) return;

    let overfill = progressBar.querySelector('.progress-bar-overfill');
    if (!overfill) {
        overfill = document.createElement('div');
        overfill.className = 'progress-bar-overfill';
        progressBar.appendChild(overfill);
    }
    const percentage = goal > 0 ? (total / goal) * 100 : 0;
    progressFill.style.width = `${Math.min(100, percentage)}%`;
    progressFill.textContent = `${total}${fillId === 'caloriesProgressFill' ? '' : 'g'} / ${goal}${fillId === 'caloriesProgressFill' ? '' : 'g'}`;
    if (percentage > 100) {
        overfill.style.width = `${Math.min(100, percentage - 100)}%`; // Cap overfill display at 100% of bar width
        overfill.style.display = 'block';
    } else {
        overfill.style.width = '0';
        overfill.style.display = 'none';
    }
}

function initializeModal() {
    const imageModal = document.getElementById('imageModal');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');

    document.body.addEventListener('click', (event) => {
        const img = event.target.closest('.meal-image');
        if (imageModal && loginContent && signupContent && img && img.src &&
            loginContent.style.display !== 'block' && loginContent.style.display !== 'flex' &&
            signupContent.style.display !== 'block' && signupContent.style.display !== 'flex') {
            showImageModal(img.src);
        }
    }, true); // Use capture phase to catch clicks early

    if (imageModal) {
        imageModal.addEventListener('click', function(event) {
            if (event.target === imageModal) { // Click on overlay itself
                closeModal(); // This will hide login/signup/image/settings
            }
        });
    }
}

function showImageModal(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');
    if (!modal || !modalImg || !loginContent || !signupContent) return;

    modalImg.src = src;
    modalImg.style.display = 'block';
    loginContent.style.display = 'none';
    signupContent.style.display = 'none';
    modal.style.display = 'flex'; // Use flex for centering image too
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent');
    const settingsModal = document.getElementById('settingsModal');

    if (modal) modal.style.display = 'none';
    if (modalImg) { modalImg.src = ''; modalImg.style.display = 'none'; }
    if (loginContent) loginContent.style.display = 'none';
    if (signupContent) signupContent.style.display = 'none';
    if (settingsModal) settingsModal.style.display = 'none';
}

function updateGoalsDisplay(calories, fat, carbs, protein) {
    // This function might not be strictly necessary if updateProgressBars updates text directly
    // For now, ensure progress bars are updated
    updateDisplay(); // This will call updateProgressBars
}

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    document.querySelectorAll('.meal-form').forEach(form => form.style.display = 'none');
    const exerciseForm = document.getElementById('exerciseForm');
    if(exerciseForm) exerciseForm.style.display = 'none';
    const settingsModal = document.getElementById('settingsModal');
    if(settingsModal) settingsModal.style.display = 'none';
    const menu = document.getElementById('menu');
    if(menu) menu.style.display = 'none';


    initializeGoogleSignIn();
    checkLoginStateOnLoad();

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) logoutBtn.addEventListener('click', handleGoogleSignOut);

    initializeModal();
    if (typeof checkServerStatus === "function") checkServerStatus();

    document.querySelectorAll('.saveMealButton').forEach(button => {
        if (!button.dataset.originalText) { // Store original text for all save buttons
            button.dataset.originalText = button.textContent;
        }
        button.addEventListener('click', (event) => {
            const form = event.target.closest('.meal-form');
            if (form) {
                const mealType = form.id.replace('Form', '');
                // If it was an edit, the specific onclick in editMeal would have handled it.
                // This is for adding a new meal.
                if (!button.dataset.editingId) { // Only call addMeal if not in edit mode (handled by editMeal's specific onclick)
                    addMeal(mealType);
                }
            }
        });
    });
    
    document.querySelectorAll('.generateMacrosButton').forEach(button => {
        button.addEventListener('click', (event) => {
            const form = event.target.closest('.meal-form');
            if(form) {
                const mealType = form.id.replace('Form', '');
                const dishNameInput = form.querySelector(`#${mealType}DishName`); // More specific selector
                const saveButton = form.querySelector('.saveMealButton');
                const editingId = saveButton ? saveButton.dataset.editingId : null;

                if (dishNameInput) {
                    handleMealNameInput(dishNameInput.value, mealType, editingId);
                }
            }
        });
    });

    const menuButton = document.getElementById('menuButton');

    const header = document.querySelector('.header'); // The menu is positioned relative to this

    if (menuButton && menu && header) {
        menuButton.addEventListener('click', function (event) {
            event.stopPropagation();

            const isMenuOpen = menu.style.display === 'block';

            if (isMenuOpen) {
                menu.style.display = 'none';
            } else {
                menu.style.display = 'block';

                const buttonRect = menuButton.getBoundingClientRect(); // Button's position relative to viewport
                const headerRect = header.getBoundingClientRect();   // Header's position relative to viewport

                // Calculate menu's left relative to the header, to align with button's left
                menu.style.left = `${buttonRect.left - headerRect.left}px`;

                // Calculate menu's top relative to the header, to align with button's bottom
                menu.style.top = `${buttonRect.bottom - headerRect.top}px`;
            }
        });

        // To make it dynamically update on screen resize:
        window.addEventListener('resize', function() {
            if (menu.style.display === 'block') { // Only reposition if the menu is open
                const buttonRect = menuButton.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();

                menu.style.left = `${buttonRect.left - headerRect.left}px`;
                menu.style.top = `${buttonRect.bottom - headerRect.top}px`;
            }
        });

        // Click outside to close logic for the menu
        document.addEventListener('click', function(event) {
            if (menu.style.display === 'block' &&
                !menu.contains(event.target) &&      // Click was not inside the menu
                event.target !== menuButton &&       // Click was not on the menu button itself
                !menuButton.contains(event.target)) { // Click was not on a child of menuButton
                menu.style.display = 'none';
            }
        });

    } else {
        if (!menuButton) console.error("Menu button (#menuButton) not found!");
        if (!menu) console.error("Menu element (#menu) not found!"); // 'menu' is already defined and checked above
        if (!header) console.error("Header element (.header) not found!");
    }

    document.addEventListener('click', function (event) {
        // This listener is primarily for modals now.
        // Menu closing is handled by the more specific listener above.
        
        // Modal closing by clicking overlay is handled by imageModal's own event listener.
        // This listener can handle settings modal if it's not using imageModal as overlay.
        const activeSettingsModal = document.getElementById('settingsModal');
        if (activeSettingsModal && activeSettingsModal.style.display !== 'none') {
            if (event.target === activeSettingsModal) { // Click on overlay for settings modal
                 activeSettingsModal.style.display = 'none';
            }
        }
    });

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
            if (menu) menu.style.display = 'none'; // Close menu when opening login
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
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', e => { e.preventDefault(); alert('Standard login not implemented.'); });
    }

    const forgotPassword = document.getElementById('forgotPassword');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', e => { e.preventDefault(); alert('Forgot password not implemented.'); });
    }

    const saveExerciseButton = document.getElementById('saveExerciseButton');
    if(saveExerciseButton) saveExerciseButton.addEventListener('click', addExercise);

    const settingsMenuItem = document.querySelector('.menu-item-settings');
    const settingsForm = document.getElementById('settingsForm');

    if(settingsMenuItem && settingsModal && settingsForm) {
        settingsMenuItem.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            document.getElementById('dailyCalories').value = goals.calories;
            document.getElementById('dailyFat').value = goals.fat;
            document.getElementById('dailyCarbs').value = goals.carbs;
            document.getElementById('dailyProtein').value = goals.protein;
            if (menu) menu.style.display = 'none'; // Close menu when opening settings
        });

        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            goals.calories = parseInt(document.getElementById('dailyCalories').value) || goals.calories;
            goals.fat = parseInt(document.getElementById('dailyFat').value) || goals.fat;
            goals.carbs = parseInt(document.getElementById('dailyCarbs').value) || goals.carbs;
            goals.protein = parseInt(document.getElementById('dailyProtein').value) || goals.protein;
            saveToLocalStorage();
            updateDisplay(); 
            settingsModal.style.display = 'none';
        });
    }
});