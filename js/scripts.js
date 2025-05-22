const BACKEND_URL =  'https://beforeyoueat.onrender.com';
const GOOGLE_CLIENT_ID = '212430289140-fipq7nufjjq8psmogq5n8v8p43g73jsk.apps.googleusercontent.com';

// REMOVED: let googleAuth; // No longer needed for GIS client-side

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
    document.getElementById('currentDateDisplay').textContent = currentDate.toDateString();
}

function toggleMealForm(mealType) {
    const form = document.getElementById(`${mealType}Form`);
    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const dishNameInput = document.getElementById(`${mealType}DishName`);
    const calorieInput = document.getElementById(`${mealType}Calories`);
    const fatInput = document.getElementById(`${mealType}Fat`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const proteinInput = document.getElementById(`${mealType}Protein`);

    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        uploadedImage.style.display = 'none';
        uploadedImage.src = '';
    } else {
        form.style.display = 'none';
        dishNameInput.value = '';
        calorieInput.value = '';
        proteinInput.value = '';
        carbsInput.value = '';
        fatInput.value = '';
    }
}

function toggleExerciseForm() {
    const form = document.getElementById('exerciseForm');
    form.style.display = form.style.display === 'none' || form.style.display === '' ? 'block' : 'none';
}

function addMeal(mealType, existingImage = null) {
    const dishName = document.getElementById(`${mealType}DishName`).value.trim();
    const calories = parseInt(document.getElementById(`${mealType}Calories`).value) || 0;
    const fat = parseInt(document.getElementById(`${mealType}Fat`).value) || 0;
    const carbs = parseInt(document.getElementById(`${mealType}Carbs`).value) || 0;
    const protein = parseInt(document.getElementById(`${mealType}Protein`).value) || 0;
    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const image = imageElement && imageElement.src ? imageElement.src : existingImage;

    if (!dishName && calories === 0 && fat === 0 && carbs === 0 && protein === 0) {
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
    clearInputs(mealType);
    toggleMealForm(mealType);
    initializeModal();
}

function addExercise() {
    const calories = parseInt(document.getElementById('exerciseCalories').value) || 0;
    if (calories === 0) return;
    const exerciseDate = formatDate(currentDate);
    if (!exercise[exerciseDate]) {
        exercise[exerciseDate] = 0;
    }
    exercise[exerciseDate] += calories;
    updateDisplay();
    saveToLocalStorage();
    document.getElementById('exerciseCalories').value = '';
    toggleExerciseForm();
}

function updateDisplay() {
    let totals = { calories: 0, fat: 0, carbs: 0, protein: 0 };
    const mealDate = formatDate(currentDate);
    const currentMeals = meals[mealDate] || { breakfast: [], lunch: [], dinner: [], snacks: [] };
    const currentExercise = exercise[mealDate] || 0;

    for (let mealType in currentMeals) {
        const mealItems = document.getElementById(`${mealType}Items`);
        mealItems.innerHTML = '';
        if (Array.isArray(currentMeals[mealType])) {
            currentMeals[mealType].forEach((meal) => {
                totals.calories += meal.calories;
                totals.fat += meal.fat;
                totals.carbs += meal.carbs;
                totals.protein += meal.protein;
                const mealItem = document.createElement('div');
                mealItem.className = 'meal-item';
                mealItem.innerHTML = `
                    <div class="drag-area"><div class="dot-matrix"></div></div>
                    ${meal.image ? `<img src="${meal.image}" alt="" class="meal-image">` : ''}
                    <div class="meal-info">
                        <h4>${meal.dishName}</h4>
                        <p>Cals: ${meal.calories} | Fat: ${meal.fat}g | Carbs: ${meal.carbs}g | Protein: ${meal.protein}g</p>
                    </div>
                    <div class="button-area">
                        <button class="duplicate-button" data-meal-type="${mealType}" data-id="${meal.id}"><i class="fas fa-copy"></i></button>
                        <button class="edit-button" data-meal-type="${mealType}" data-id="${meal.id}">✎</button>
                        <button class="remove-button" data-meal-type="${mealType}" data-id="${meal.id}"></button>
                    </div>`;
                mealItems.appendChild(mealItem);
            });
        }
    }

    const exerciseItems = document.getElementById('exerciseItems');
    exerciseItems.innerHTML = '';
    if (currentExercise > 0) {
        const exerciseItem = document.createElement('div');
        exerciseItem.className = 'exercise-item';
        exerciseItem.innerHTML = `
            <div class="exercise-info"><p>Calories burned: ${currentExercise}</p></div>
            <div class="button-area"><button class="remove-button remove-exercise-button"></button></div>`;
        exerciseItems.appendChild(exerciseItem);
    }
    document.getElementById('totalExercise').textContent = currentExercise;
    updateProgressBars(totals, currentExercise);
    initDragAndDrop();

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
    const mealToDuplicate = meals[mealDate][mealType].find(meal => meal.id === parseInt(id));
    if (mealToDuplicate) {
        const newMeal = { ...mealToDuplicate, id: Date.now() };
        meals[mealDate][mealType].push(newMeal);
        updateDisplay();
        saveToLocalStorage();
    }
}

function removeMeal(mealType, id) {
    const mealDate = formatDate(currentDate);
    if (meals[mealDate] && meals[mealDate][mealType]) {
        meals[mealDate][mealType] = meals[mealDate][mealType].filter(meal => meal.id !== parseInt(id));
    }
    updateDisplay();
    saveToLocalStorage();
}

function removeExercise() {
    const exerciseDate = formatDate(currentDate);
    if (exercise[exerciseDate]) {
        exercise[exerciseDate] = 0;
    }
    updateDisplay();
    saveToLocalStorage();
}

function editMeal(mealType, id) {
    const mealDate = formatDate(currentDate);
    const meal = meals[mealDate][mealType].find(meal => meal.id === parseInt(id));
    if (!meal) return;

    const form = document.getElementById(`${mealType}Form`);
    document.getElementById(`${mealType}DishName`).value = meal.dishName;
    document.getElementById(`${mealType}Calories`).value = meal.calories;
    document.getElementById(`${mealType}Fat`).value = meal.fat;
    document.getElementById(`${mealType}Carbs`).value = meal.carbs;
    document.getElementById(`${mealType}Protein`).value = meal.protein;

    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (meal.image) {
        uploadedImage.src = meal.image;
        uploadedImage.style.display = 'block';
    } else {
        uploadedImage.style.display = 'none';
    }
    form.style.display = 'block';

    const saveButton = form.querySelector(`.saveMealButton`); // Simpler selector
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Save Edit';

    saveButton.onclick = function saveEdited() {
        // Temporarily remove the old meal, then add the new one
        // This ensures the ID is updated if macros are re-generated
        const tempMeals = meals[mealDate][mealType].filter(m => m.id !== parseInt(id));
        meals[mealDate][mealType] = tempMeals;

        addMeal(mealType, meal.image); // Add as a new meal, potentially with new generated macros

        saveButton.textContent = originalText;
        saveButton.onclick = () => addMeal(mealType); // Reset to original addMeal
    };
     const generateMacrosButton = form.querySelector('.generateMacrosButton');
     generateMacrosButton.onclick = () => handleMealNameInput(document.getElementById(`${mealType}DishName`).value, mealType, id);
    initializeModal();
}

async function handleMealNameInput(mealName, mealType, id = null) {
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
            document.getElementById(`${mealType}Calories`).value = parseFloat(matches[2]).toFixed(1);
            document.getElementById(`${mealType}Fat`).value = parseFloat(matches[3]).toFixed(1);
            document.getElementById(`${mealType}Carbs`).value = parseFloat(matches[4]).toFixed(1);
            document.getElementById(`${mealType}Protein`).value = parseFloat(matches[5]).toFixed(1);
            // If editing, the save button's onclick handler will deal with saving
            // If not editing, addMeal would be called by the save button
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
                const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
                uploadedImage.src = compressedImage;
                uploadedImage.style.display = 'block';

                const blob = dataURLToBlob(compressedImage);
                const formData = new FormData();
                formData.append('image', blob, 'compressed.jpg');

                const response = await fetch(`${BACKEND_URL}/analyze_image`, { method: 'POST', body: formData });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const matches = data.match(/Name:\s*([^,]+?),\s*Cals:\s*(\d+),\s*Fat:\s*(\d+(?:\.\d+)?)\s*g,\s*Carbs:\s*(\d+(?:\.\d+)?)\s*g,\s*Protein:\s*(\d+(?:\.\d+)?)\s*g/);
                if (matches) {
                    document.getElementById(`${mealType}DishName`).value = matches[1];
                    document.getElementById(`${mealType}Calories`).value = parseFloat(matches[2]).toFixed(1);
                    document.getElementById(`${mealType}Fat`).value = parseFloat(matches[3]).toFixed(1);
                    document.getElementById(`${mealType}Carbs`).value = parseFloat(matches[4]).toFixed(1);
                    document.getElementById(`${mealType}Protein`).value = parseFloat(matches[5]).toFixed(1);
                    // User will click save button to actually add the meal
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

function compressImage(src, maxWidth, maxHeight) { /* ... (your existing compressImage function) ... */ return new Promise((resolve, reject) => {
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
    }); }
function dataURLToBlob(dataurl) { /* ... (your existing dataURLToBlob function) ... */ const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });}
function clearInputs(mealType) { /* ... (your existing clearInputs function) ... */ if (mealType) {
        const dishNameInput = document.getElementById(`${mealType}DishName`);
        const calorieInput = document.getElementById(`${mealType}Calories`);
        const fatInput = document.getElementById(`${mealType}Fat`);
        const carbsInput = document.getElementById(`${mealType}Carbs`);
        const proteinInput = document.getElementById(`${mealType}Protein`);

        if (dishNameInput) dishNameInput.value = '';
        if (calorieInput) calorieInput.value = '';
        if (fatInput) fatInput.value = '';
        if (carbsInput) carbsInput.value = '';
        if (proteinInput) proteinInput.value = '';
    } else {
        const calorieGoalInput = document.getElementById('calorieGoal');
        const fatGoalInput = document.getElementById('fatGoal');
        const carbGoalInput = document.getElementById('carbGoal');
        const proteinGoalInput = document.getElementById('proteinGoal');

        if (calorieGoalInput) calorieGoalInput.value = '';
        if (fatGoalInput) fatGoalInput.value = '';
        if (carbGoalInput) carbGoalInput.value = '';
        if (proteinGoalInput) proteinGoalInput.value = '';
    }}
function saveToLocalStorage() { /* ... (your existing saveToLocalStorage function, ensure it's not too long for brevity here) ... */ const MAX_STORAGE = 5 * 1024 * 1024; // 5 MB in bytes
    const BUFFER_PERCENTAGE = 0.1; // 10% buffer
    const TARGET_STORAGE = MAX_STORAGE * (1 - BUFFER_PERCENTAGE); // 90% of MAX_STORAGE
    function getTotalStorageSize() { let total = 0; for (let key in localStorage) { if (localStorage.hasOwnProperty(key)) { total += new Blob([key + localStorage[key]]).size; } } return total; }
    function getOldestMealEntry() { let oldestDate = null; let oldestMealType = null; let oldestMealId = null; for (let date in meals) { for (let mealType in meals[date]) { if (meals[date][mealType].length > 0) { const mealId = meals[date][mealType][0].id; if (!oldestDate || date < oldestDate) { oldestDate = date; oldestMealType = mealType; oldestMealId = mealId; } else if (date === oldestDate) { const currentOldestMealId = meals[oldestDate][oldestMealType][0].id; if (mealId < currentOldestMealId) { oldestMealType = mealType; oldestMealId = mealId; } } } } } return { date: oldestDate, mealType: oldestMealType, id: oldestMealId }; }
    function removeOldestMealEntry() { const oldestMeal = getOldestMealEntry(); if (oldestMeal.date && oldestMeal.mealType && meals[oldestMeal.date] && meals[oldestMeal.date][oldestMeal.mealType]) { meals[oldestMeal.date][oldestMeal.mealType] = meals[oldestMeal.date][oldestMeal.mealType].filter(meal => meal.id !== oldestMeal.id); if (meals[oldestMeal.date][oldestMeal.mealType].length === 0) { delete meals[oldestMeal.date][oldestMeal.mealType]; } if (Object.keys(meals[oldestMeal.date]).length === 0) { delete meals[oldestMeal.date]; } localStorage.setItem('meals', JSON.stringify(meals)); return true; } return false; }
    let totalStorageSize = getTotalStorageSize();
    while (totalStorageSize > TARGET_STORAGE) { if (!removeOldestMealEntry()) { return; } totalStorageSize = getTotalStorageSize(); }
    localStorage.setItem('meals', JSON.stringify(meals)); localStorage.setItem('exercise', JSON.stringify(exercise)); localStorage.setItem('goals', JSON.stringify(goals)); localStorage.setItem('currentDate', formatDate(currentDate));}
function loadFromLocalStorage() { /* ... (your existing loadFromLocalStorage function) ... */ if (localStorage.getItem('meals')) { meals = JSON.parse(localStorage.getItem('meals')); } if (localStorage.getItem('exercise')) { exercise = JSON.parse(localStorage.getItem('exercise')); } if (localStorage.getItem('goals')) { goals = JSON.parse(localStorage.getItem('goals')); } if (localStorage.getItem('currentDate')) { currentDate = new Date(localStorage.getItem('currentDate')); } updateDateDisplay(); updateDisplay(); }
function initDragAndDrop() { /* ... (your existing initDragAndDrop function) ... */ const slots = ['breakfastItems', 'lunchItems', 'dinnerItems', 'snacksItems'];
    slots.forEach(slotId => {
        const slot = document.getElementById(slotId);
        if (slot && typeof Sortable !== 'undefined') { // Check if Sortable is defined
            new Sortable(slot, {
                group: 'meals',
                animation: 150,
                handle: '.drag-area',
                onEnd: function (evt) {
                    const mealTypeFrom = evt.from.id.replace('Items', '');
                    const mealTypeTo = evt.to.id.replace('Items', '');
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    const mealDate = formatDate(currentDate);
                    if (meals[mealDate] && meals[mealDate][mealTypeFrom] && meals[mealDate][mealTypeTo]) {
                        const movedMeal = meals[mealDate][mealTypeFrom].splice(oldIndex, 1)[0];
                        if (movedMeal) {
                             meals[mealDate][mealTypeTo].splice(newIndex, 0, movedMeal);
                        }
                    }
                    saveToLocalStorage();
                    updateDisplay(); // Refresh display to reflect changes
                }
            });
        }
    });
    initializeModal(); }

// --- NEW Google Identity Services (GIS) Functions ---

// Helper function to decode JWT (for client-side display only, NOT for security validation)
function decodeJwtResponse(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding JWT", e);
        return null;
    }
}

function handleGoogleCredentialResponse(response) {
    console.log("Google Sign-In Response:", response);
    if (response.credential) {
        const idTokenPayload = decodeJwtResponse(response.credential);
        console.log("Decoded ID Token Payload:", idTokenPayload);

        if (idTokenPayload) {
            const userInfo = {
                id: idTokenPayload.sub, // Subject (user's Google ID)
                name: idTokenPayload.name,
                givenName: idTokenPayload.given_name,
                familyName: idTokenPayload.family_name,
                imageUrl: idTokenPayload.picture,
                email: idTokenPayload.email,
                id_token: response.credential // The raw ID token
            };

            localStorage.setItem('googleUser', JSON.stringify(userInfo));
            updateUIAfterSignIn(userInfo);
            closeModal();
        } else {
            alert('Could not decode Google user information.');
        }
    } else {
        console.error('Google Sign-In failed, no credential received.');
        alert('Google Sign-In failed. Please try again.');
    }
}

function updateUIAfterSignIn(userInfo) {
    if (!userInfo) {
        const storedUser = localStorage.getItem('googleUser');
        if (storedUser) {
            userInfo = JSON.parse(storedUser);
        } else {
            updateUIAfterSignOut();
            return;
        }
    }

    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = '';

    if (userInfo.imageUrl) {
        const profilePic = document.createElement('img');
        profilePic.src = userInfo.imageUrl;
        profilePic.alt = userInfo.name || 'User';
        profilePic.style.width = '30px';
        profilePic.style.height = '30px';
        profilePic.style.borderRadius = '50%';
        profilePic.style.marginRight = '10px';
        userInfoDiv.appendChild(profilePic);
    }
    const userNameSpan = document.createElement('span');
    userNameSpan.textContent = userInfo.name || userInfo.email; // Fallback to email if name is not present
    userInfoDiv.appendChild(userNameSpan);
    userInfoDiv.style.display = 'flex';

    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'none';

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'block';

    // document.getElementById('menu').style.display = ''; // Consider if this is needed
}


function handleGoogleSignOut() {
    localStorage.removeItem('googleUser');
    updateUIAfterSignOut();

    // If you used google.accounts.id.prompt() and want to disable One Tap for the current session:
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    console.log("User signed out from the app.");
    // Optionally, you can revoke the token if you have the user's email,
    // but this is more for if they want to choose a different account next time.
    // const userEmail = userInfo?.email; // if you have access to it
    // if (userEmail && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    //    google.accounts.id.revoke(userEmail, done => {
    //        console.log('Consent revoked: ' + done.successful);
    //    });
    // }
}

function updateUIAfterSignOut() {
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = '';
    userInfoDiv.style.display = 'none';

    const loginMenuItem = document.querySelector('.menu-item-login');
    if (loginMenuItem) loginMenuItem.style.display = 'block';

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.style.display = 'none';
}

function checkLoginStateOnLoad() {
    const storedUser = localStorage.getItem('googleUser');
    if (storedUser) {
        try {
            const userInfo = JSON.parse(storedUser);
            updateUIAfterSignIn(userInfo);
        } catch (e) {
            console.error("Error parsing stored user info:", e);
            localStorage.removeItem('googleUser'); // Clear corrupted data
            updateUIAfterSignOut();
        }
    } else {
        updateUIAfterSignOut();
    }
}

// REMOVED: onGooglePlatformLoaded function

// --- End of GIS Functions ---


function updateProgressBars(totals, exerciseCalories) { /* ... (your existing updateProgressBars function) ... */ const effectiveCaloriesGoal = goals.calories + exerciseCalories;
    updateProgressBar('caloriesProgressFill', totals.calories, effectiveCaloriesGoal);
    updateProgressBar('fatProgressFill', totals.fat, goals.fat);
    updateProgressBar('carbsProgressFill', totals.carbs, goals.carbs);
    updateProgressBar('proteinProgressFill', totals.protein, goals.protein); }
function updateProgressBar(fillId, total, goal) { /* ... (your existing updateProgressBar function) ... */ const progressBar = document.getElementById(fillId).closest('.progress-bar');
    const progressFill = document.getElementById(fillId);
    let overfill = progressBar.querySelector('.progress-bar-overfill');
    if (!overfill) {
        overfill = document.createElement('div');
        overfill.className = 'progress-bar-overfill';
        progressBar.appendChild(overfill);
    }

    const percentage = goal > 0 ? (total / goal) * 100 : 0; // Avoid division by zero
    progressFill.style.width = `${Math.min(100, percentage)}%`;
    progressFill.textContent = `${total}${fillId === 'caloriesProgressFill' ? '' : 'g'} / ${goal}${fillId === 'caloriesProgressFill' ? '' : 'g'}`;
    
    if (percentage > 100) {
        const overfillPercentage = percentage - 100;
        overfill.style.width = `${overfillPercentage}%`;
        overfill.style.display = 'block';
    } else {
        overfill.style.width = '0';
        overfill.style.display = 'none';
    }}
function initializeModal() { /* ... (your existing initializeModal function) ... */ const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');

    // Use event delegation on a parent element
    document.body.addEventListener('click', (event) => {
        const img = event.target.closest('.meal-image');
        if (img && img.src && modal.style.display !== 'flex' /* Only if not login modal */) {
            showImageModal(img.src);
        }
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
             // Check if login content is visible, if so, don't close on simple modal click
            if (loginContent.style.display === 'none' || loginContent.style.display === '') {
                closeModal();
            }
        }
    });}
function showImageModal(src) { /* ... (your existing showImageModal function) ... */ const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    
    if (!modal || !modalImg || !loginContent) {
        return;
    }
    
    modalImg.src = src;
    modalImg.style.display = 'block';
    loginContent.style.display = 'none'; // Ensure login form is hidden
    modal.style.display = 'block'; // Use block for image modal, flex for login
}
function closeModal() { /* ... (your existing closeModal function) ... */ const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    const signupContent = document.getElementById('signupModalContent'); // Ensure signup is also hidden
    
    modal.style.display = 'none';
    modalImg.src = '';
    modalImg.style.display = 'none';
    loginContent.style.display = 'none';
    if (signupContent) signupContent.style.display = 'none';

    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.style.display = 'none';}
function updateGoalsDisplay(calories, fat, carbs, protein) { /* ... (your existing updateGoalsDisplay function) ... */ if (calories) {
        document.getElementById('caloriesProgressFill').innerText = `0 / ${calories}`;
    }
    if (fat) {
        document.getElementById('fatProgressFill').innerText = `0g / ${fat}g`;
    }
    if (carbs) {
        document.getElementById('carbsProgressFill').innerText = `0g / ${carbs}g`;
    }
    if (protein) {
        document.getElementById('proteinProgressFill').innerText = `0g / ${protein}g`;
    }}

function initializeGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        console.log("Initializing Google Identity Services...");
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse
        });

        const googleButtonContainer = document.getElementById('googleLoginButtonContainer');
        if (googleButtonContainer) {
            google.accounts.id.renderButton(
                googleButtonContainer,
                { theme: "outline", size: "large", type: "standard", text: "signin_with" } // Customize as needed
            );
        } else {
            console.error('Google login button container not found.');
        }
        // google.accounts.id.prompt(); // Optional: For One Tap sign-in
    } else {
        // GIS library not loaded yet, try again shortly
        console.warn("Google Identity Services client not ready, will retry initialization.");
        setTimeout(initializeGoogleSignIn, 500); // Retry after a short delay
    }
}


document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    document.querySelectorAll('.meal-form').forEach(form => form.style.display = 'none');
    document.getElementById('exerciseForm').style.display = 'none';

    // Initialize Google Sign-In using GIS
    initializeGoogleSignIn(); // Call the new GIS initialization
    checkLoginStateOnLoad();  // Check if user was already logged in

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleGoogleSignOut);
    }

    initializeModal();
    checkServerStatus();

    document.querySelectorAll('.saveMealButton').forEach(button => {
        button.addEventListener('click', (event) => {
            const mealType = button.closest('.meal-form').id.replace('Form', ''); // More robust way to get mealType
            addMeal(mealType);
        });
    });

    // ... (your other event listeners for remove, edit, menu, modal interactions etc. should largely remain the same)
    // Make sure their selectors are still valid after HTML changes.

    // Toggle menu visibility
    document.getElementById('menuButton').addEventListener('click', function () {
        var menuButton = document.getElementById('menuButton');
        var menu = document.getElementById('menu');
        var header = document.querySelector('.header');
        var rect = menuButton.getBoundingClientRect();
        var headerRect = header.getBoundingClientRect();
        var buttonLeftOffset = 20;
        var buttonTopOffset = 20;
        if (menu.style.display === 'none' || menu.style.display === '') {
            menu.style.display = 'block';
            menu.style.position = 'absolute';
            menu.style.left = `${rect.left - headerRect.left - buttonLeftOffset}px`;
            menu.style.top = `${rect.bottom + window.scrollY - buttonTopOffset}px`;
            menu.style.zIndex = '1000';
        } else {
            menu.style.display = 'none';
        }
    });

    document.addEventListener('click', function (event) {
        var menu = document.getElementById('menu');
        var menuButton = document.getElementById('menuButton');
        if (menu && menuButton && !menu.contains(event.target) && event.target !== menuButton) {
            menu.style.display = 'none';
        }

        // Combined modal closing logic
        const imageModal = document.getElementById('imageModal');
        const loginModalContent = document.getElementById('loginModalContent');
        const signupModalContent = document.getElementById('signupModalContent');
        const settingsModal = document.getElementById('settingsModal');
        const settingsModalContent = settingsModal ? settingsModal.querySelector('.modal-content') : null;

        // Close image modal (non-login part)
        if (imageModal && imageModal.style.display !== 'none' && event.target === imageModal &&
            (!loginModalContent || loginModalContent.style.display === 'none') &&
            (!signupModalContent || signupModalContent.style.display === 'none')) {
            closeModal();
        }

        // Close login/signup modal (if imageModal is used for it)
        if (imageModal && imageModal.style.display === 'flex' &&
            (!loginModalContent || !loginModalContent.contains(event.target)) &&
            (!signupModalContent || !signupModalContent.contains(event.target)) &&
            !event.target.closest('.menu-item-login') && // Don't close if clicking the login menu item
            event.target !== imageModal.querySelector('#googleLoginButtonContainer') && // Don't close if clicking inside GIS button
            !event.target.closest('#googleLoginButtonContainer iframe')) { // Also check for iframe
            // closeModal(); // This might be too aggressive, let users click the X or outside specifically for login
        }


        if (settingsModal && settingsModal.style.display === 'block' &&
            settingsModalContent && !settingsModalContent.contains(event.target) &&
            !event.target.classList.contains('menu-item-settings')) {
            closeModal(); // closeModal will also hide settingsModal
        }
    });

    document.querySelector('.menu-item-login').addEventListener('click', function () {
        const imageModal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');
        const loginModalContent = document.getElementById('loginModalContent');
        const signupModalContent = document.getElementById('signupModalContent');

        if (modalImage) modalImage.style.display = 'none';
        if (loginModalContent) loginModalContent.style.display = 'block';
        if (signupModalContent) signupModalContent.style.display = 'none';
        if (imageModal) imageModal.style.display = 'flex'; // Use flex if your login modal is designed for it
    });

    const signUpLink = document.getElementById('signUpLink');
    if (signUpLink) {
        signUpLink.addEventListener('click', function (event) {
            event.preventDefault();
            document.getElementById('loginModalContent').style.display = 'none';
            document.getElementById('signupModalContent').style.display = 'block';
        });
    }

    const backToLoginLink = document.getElementById('backToLoginLink');
    if (backToLoginLink) {
        backToLoginLink.addEventListener('click', function (event) {
            event.preventDefault();
            document.getElementById('signupModalContent').style.display = 'none';
            document.getElementById('loginModalContent').style.display = 'block';
        });
    }
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function (event) {
            event.preventDefault();
            alert('Standard email/password login not implemented yet.');
        });
    }

    const forgotPassword = document.getElementById('forgotPassword');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', function (event) {
            event.preventDefault();
            alert('Forgot password functionality not implemented yet.');
        });
    }


    document.getElementById('saveExerciseButton').addEventListener('click', addExercise);
    document.querySelector('.menu-item-settings').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'block';
        document.getElementById('dailyCalories').value = goals.calories;
        document.getElementById('dailyFat').value = goals.fat;
        document.getElementById('dailyCarbs').value = goals.carbs;
        document.getElementById('dailyProtein').value = goals.protein;
    });
    document.getElementById('settingsForm').addEventListener('submit', function (e) {
        e.preventDefault();
        goals = {
            calories: parseInt(document.getElementById('dailyCalories').value) || 0,
            fat: parseInt(document.getElementById('dailyFat').value) || 0,
            carbs: parseInt(document.getElementById('dailyCarbs').value) || 0,
            protein: parseInt(document.getElementById('dailyProtein').value) || 0
        };
        saveToLocalStorage();
        updateGoalsDisplay(goals.calories, goals.fat, goals.carbs, goals.protein);
        updateDisplay(); // Also call updateDisplay to refresh progress bars with current totals
        closeModal();
    });
});