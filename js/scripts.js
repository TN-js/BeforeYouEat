let meals = {};
let exercise = {};
let goals = { calories: 2000, protein: 75, carbs: 275, fat: 67 };
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
    const proteinInput = document.getElementById(`${mealType}Protein`);
    const carbsInput = document.getElementById(`${mealType}Carbs`);
    const fatInput = document.getElementById(`${mealType}Fat`);

    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        // Hide the image and clear the src when the form is opened
        uploadedImage.style.display = 'none';
        uploadedImage.src = '';
    } else {
        form.style.display = 'none';
        // Clear the form fields
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
    const protein = parseInt(document.getElementById(`${mealType}Protein`).value) || 0;
    const carbs = parseInt(document.getElementById(`${mealType}Carbs`).value) || 0;
    const fat = parseInt(document.getElementById(`${mealType}Fat`).value) || 0;
    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const image = imageElement && imageElement.src ? imageElement.src : existingImage;

    if (!dishName && calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
        return;
    }

    const meal = { dishName, calories, protein, carbs, fat, image };
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

    // Re-initialize modal functionality
    initializeModal();
}

function addExercise() {
    const calories = parseInt(document.getElementById('exerciseCalories').value) || 0;

    if (calories === 0) {
        return;
    }

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
    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    let totalExercise = 0;
    const mealDate = formatDate(currentDate);
    const currentMeals = meals[mealDate] || { breakfast: [], lunch: [], dinner: [], snacks: [] };
    const currentExercise = exercise[mealDate] || 0;
    for (let mealType in currentMeals) {
        const mealItems = document.getElementById(`${mealType}Items`);
        mealItems.innerHTML = '';
        if (Array.isArray(currentMeals[mealType])) {
            currentMeals[mealType].forEach((meal, index) => {
                totals.calories += meal.calories;
                totals.protein += meal.protein;
                totals.carbs += meal.carbs;
                totals.fat += meal.fat;
                const mealItem = document.createElement('div');
                mealItem.className = 'meal-item';
                mealItem.innerHTML = `
                    <div class="drag-area">
                        <div class="dot-matrix"></div>
                    </div>
                    ${meal.image ? `<img src="${meal.image}" alt="" class="meal-image">` : ''}
                    <div class="meal-info">
                        <h4>${meal.dishName}</h4>
                        <p>Cals: ${meal.calories} | Protein: ${meal.protein}g | Carbs: ${meal.carbs}g | Fat: ${meal.fat}g</p>
                    </div>
                    <div class="button-area">
                        <button class="duplicate-button" data-meal-type="${mealType}" data-index="${index}"><i class="fas fa-copy"></i></button>
                        <button class="edit-button" data-meal-type="${mealType}" data-index="${index}">&#9998;</button>
                        <button class="remove-button" data-meal-type="${mealType}" data-index="${index}">&#128465;</button>
                    </div>
                `;
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
            <div class="exercise-info">
                <p>Calories burned: ${currentExercise}</p>
            </div>
            <div class="button-area">
                <button class="remove-button remove-exercise-button">&#128465;</button>
            </div>
        `;
        exerciseItems.appendChild(exerciseItem);
    }

    document.getElementById('totalExercise').textContent = currentExercise;

    updateProgressBars(totals, currentExercise);

    initDragAndDrop();

    document.querySelectorAll('.remove-button').forEach(button => {
        button.removeEventListener('touchstart', removeMeal); // Ensure no lingering touchstart listeners
        button.addEventListener('click', () => {
            removeMeal(button.dataset.mealType, button.dataset.index);
        });
    });

    document.querySelectorAll('.remove-exercise-button').forEach(button => {
        button.removeEventListener('touchstart', removeExercise); // Ensure no lingering touchstart listeners
        button.addEventListener('click', () => {
            removeExercise();
        });
    });

    document.querySelectorAll('.edit-button').forEach(button => {
        button.removeEventListener('touchstart', editMeal); // Ensure no lingering touchstart listeners
        button.addEventListener('click', () => {
            editMeal(button.dataset.mealType, button.dataset.index);
        });
    });

    document.querySelectorAll('.duplicate-button').forEach(button => {
        button.addEventListener('click', () => {
            duplicateMeal(button.dataset.mealType, button.dataset.index);
        });
    });
}

// Function to duplicate a meal
function duplicateMeal(mealType, index) {
    const mealDate = formatDate(currentDate);
    const currentMeals = meals[mealDate][mealType];
    const mealToDuplicate = currentMeals[index];
    const newMeal = { ...mealToDuplicate, id: Date.now() }; // Ensure new unique ID if needed

    currentMeals.push(newMeal); // Add duplicated meal to the same meal type array
    updateDisplay(); // Refresh the display to show the new duplicated meal
}

function removeMeal(mealType, index) {
    const mealDate = formatDate(currentDate);
    if (meals[mealDate] && meals[mealDate][mealType]) {
        meals[mealDate][mealType].splice(index, 1);
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

function editMeal(mealType, index) {
    const mealDate = formatDate(currentDate);
    const meal = meals[mealDate][mealType][index];
    const form = document.getElementById(`${mealType}Form`);

    document.getElementById(`${mealType}DishName`).value = meal.dishName;
    document.getElementById(`${mealType}Calories`).value = meal.calories;
    document.getElementById(`${mealType}Protein`).value = meal.protein;
    document.getElementById(`${mealType}Carbs`).value = meal.carbs;
    document.getElementById(`${mealType}Fat`).value = meal.fat;

    // Display the existing image
    const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    if (meal.image) {
        uploadedImage.src = meal.image;
        uploadedImage.style.display = 'block';
    } else {
        uploadedImage.style.display = 'none';
    }

    form.style.display = 'block';

    const saveButton = document.querySelector(`.saveMealButton[data-meal-type="${mealType}"]`);
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Save Edit';

    saveButton.onclick = function saveEdited() {
        removeMeal(mealType, index); // Remove the old entry
        addMeal(mealType, meal.image); // Pass the existing image URL to addMeal function
        saveButton.textContent = originalText; // Revert the button text
        saveButton.onclick = function (event) {
            const mealType = event.target.dataset.mealType;
            addMeal(mealType);
        };
    };

    // Update generate macros button to handle the index
    const generateMacrosButton = form.querySelector('.generateMacrosButton');
    generateMacrosButton.onclick = function generateMacros() {
        handleMealNameInput(document.getElementById(`${mealType}DishName`).value, mealType, index);
    };

    // Re-initialize modal functionality
    initializeModal();
}

async function handleMealNameInput(mealName, mealType, index = null) {
    if (!mealName) {
        alert('Please enter a meal name.');
        return;
    }

    try {
        const response = await fetch('https://beforeyoueat-0404fc673109.herokuapp.com/estimate_macros', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ meal_name: mealName })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', data);

        const matches = data.match(/Name:\s*(.*?),\s*Cals:\s*(\d+),\s*Protein:\s*(\d+(?:\.\d+)?)\s*g,\s*Carbs:\s*(\d+(?:\.\d+)?)\s*g,\s*Fat:\s*(\d+(?:\.\d+)?)\s*g/);

        if (matches) {
            const dishName = matches[1];
            const calories = parseFloat(matches[2]);
            const protein = parseFloat(matches[3]);
            const carbs = parseFloat(matches[4]);
            const fat = parseFloat(matches[5]);

            document.getElementById(`${mealType}DishName`).value = dishName;
            document.getElementById(`${mealType}Calories`).value = calories;
            document.getElementById(`${mealType}Protein`).value = protein;
            document.getElementById(`${mealType}Carbs`).value = carbs;
            document.getElementById(`${mealType}Fat`).value = fat;

            if (index !== null) {
                removeMeal(mealType, index); // Remove the old entry if index is provided
            }

            addMeal(mealType);
        } else {
            console.error('Error parsing API response:', data);
            alert(`Error estimating macros: ${data}`);
        }
    } catch (error) {
        console.error('Error estimating macros:', error);
        alert(`Error estimating macros: ${error.message}`);
    }
}

async function handleImageUpload(input, mealType) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                // Compress the image
                const compressedImage = await compressImage(e.target.result, 1000, 1000);

                const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
                uploadedImage.src = compressedImage;
                uploadedImage.style.display = 'block'; // Show the image

                // Convert base64 to a Blob
                const blob = dataURLToBlob(compressedImage);
                const formData = new FormData();
                formData.append('image', blob, 'compressed.jpg');

                // Upload the compressed image to the backend
                const response = await fetch('https://beforeyoueat-0404fc673109.herokuapp.com/analyze_image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.text(); // Get the response as text
                console.log('API Response:', data); // Log the response to check values

                // Extract the nutrient values using a regular expression
                const matches = data.match(/Name:\s*(.*?),\s*Cals:\s*(\d+),\s*Protein:\s*(\d+(?:\.\d+)?)\s*g,\s*Carbs:\s*(\d+(?:\.\d+)?)\s*g,\s*Fat:\s*(\d+(?:\.\d+)?)\s*g/);

                if (matches) {
                    const dishName = matches[1];
                    const calories = parseFloat(matches[2]);
                    const protein = parseFloat(matches[3]);
                    const carbs = parseFloat(matches[4]);
                    const fat = parseFloat(matches[5]);

                    document.getElementById(`${mealType}DishName`).value = dishName;
                    document.getElementById(`${mealType}Calories`).value = calories;
                    document.getElementById(`${mealType}Protein`).value = protein;
                    document.getElementById(`${mealType}Carbs`).value = carbs;
                    document.getElementById(`${mealType}Fat`).value = fat;

                    // Automatically save the meal after uploading the image
                    addMeal(mealType);
                } else {
                    console.error('Error parsing API response:', data);
                    alert(`Error analyzing image: ${data}`);
                }
            } catch (error) {
                console.error('Error processing image:', error);
                alert(`Error processing image: ${error.message}`);
            }
        };
        reader.readAsDataURL(file);
    }
}

// Function to compress the image
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

            resolve(canvas.toDataURL('image/jpeg', 0.8)); // Return the data URL
        };
        img.onerror = reject;
        img.src = src;
    });
}

// Function to convert base64 to Blob
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
        const dishNameInput = document.getElementById(`${mealType}DishName`);
        const calorieInput = document.getElementById(`${mealType}Calories`);
        const proteinInput = document.getElementById(`${mealType}Protein`);
        const carbsInput = document.getElementById(`${mealType}Carbs`);
        const fatInput = document.getElementById(`${mealType}Fat`);

        if (dishNameInput) dishNameInput.value = '';
        if (calorieInput) calorieInput.value = '';
        if (proteinInput) proteinInput.value = '';
        if (carbsInput) carbsInput.value = '';
        if (fatInput) fatInput.value = '';
    } else {
        const calorieGoalInput = document.getElementById('calorieGoal');
        const proteinGoalInput = document.getElementById('proteinGoal');
        const carbGoalInput = document.getElementById('carbGoal');
        const fatGoalInput = document.getElementById('fatGoal');

        if (calorieGoalInput) calorieGoalInput.value = '';
        if (proteinGoalInput) proteinGoalInput.value = '';
        if (carbGoalInput) carbGoalInput.value = '';
        if (fatGoalInput) fatGoalInput.value = '';
    }
}

function saveToLocalStorage() {
    localStorage.setItem('meals', JSON.stringify(meals));
    localStorage.setItem('exercise', JSON.stringify(exercise));
    localStorage.setItem('goals', JSON.stringify(goals));
    localStorage.setItem('currentDate', formatDate(currentDate));
}

function loadFromLocalStorage() {
    if (localStorage.getItem('meals')) {
        meals = JSON.parse(localStorage.getItem('meals'));
    }
    if (localStorage.getItem('exercise')) {
        exercise = JSON.parse(localStorage.getItem('exercise'));
    }
    if (localStorage.getItem('goals')) {
        goals = JSON.parse(localStorage.getItem('goals'));
    }
    if (localStorage.getItem('currentDate')) {
        currentDate = new Date(localStorage.getItem('currentDate'));
    }
    updateDateDisplay();
    updateDisplay();
}

function initDragAndDrop() {
    const slots = ['breakfastItems', 'lunchItems', 'dinnerItems', 'snacksItems'];

    slots.forEach(slotId => {
        const slot = document.getElementById(slotId);
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
                const movedMeal = meals[mealDate][mealTypeFrom][oldIndex];

                meals[mealDate][mealTypeFrom].splice(oldIndex, 1);
                meals[mealDate][mealTypeTo].splice(newIndex, 0, movedMeal);

                saveToLocalStorage();
                updateDisplay();
            }
        });
    });

    initializeModal();
}

function updateProgressBars(totals, exerciseCalories) {
    const effectiveCaloriesGoal = goals.calories + exerciseCalories;
    updateProgressBar('caloriesProgressFill', totals.calories, effectiveCaloriesGoal);
    updateProgressBar('proteinProgressFill', totals.protein, goals.protein);
    updateProgressBar('carbsProgressFill', totals.carbs, goals.carbs);
    updateProgressBar('fatProgressFill', totals.fat, goals.fat);
}

function updateProgressBar(fillId, total, goal) {
    const progressFill = document.getElementById(fillId);
    const percentage = Math.min(100, (total / goal) * 100);
    const overfill = total > goal;

    progressFill.style.width = `${percentage}%`;
    progressFill.textContent = `${total}${fillId === 'caloriesProgressFill' ? '' : 'g'} / ${goal}${fillId === 'caloriesProgressFill' ? '' : 'g'}`;

    if (overfill) {
        progressFill.classList.add('progress-bar-overfill');
        progressFill.style.width = '100%';
        progressFill.style.background = 'linear-gradient(to right, #b2dfdb 0%, #4caf50 70%, red 100%)';
    } else {
        progressFill.classList.remove('progress-bar-overfill');
        progressFill.style.background = 'linear-gradient(45deg, #a3d8a3, #80c8e0, #c8a3d8, #a3d8a3, #80c8e0, #c8a3d8)';
        progressFill.style.backgroundSize = '300% 300%';
        progressFill.style.animation = 'gradientAnimation 20s linear infinite';
    }
}

function initializeModal() {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');

    // Use event delegation on a parent element
    document.body.addEventListener('click', (event) => {
        const img = event.target.closest('.meal-image');
        if (img && img.src) {
            showImageModal(img.src);
        }
    });

    // Close modal when clicking outside of modal content
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}

// Function to show image in modal
function showImageModal(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    
    if (!modal || !modalImg || !loginContent) {
        console.error('Modal elements not found');
        return;
    }
    
    modalImg.src = src;
    modalImg.style.display = 'block';
    loginContent.style.display = 'none';
    modal.style.display = 'block';
}

// Function to close the modal
function closeModal() {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const loginContent = document.getElementById('loginModalContent');
    
    modal.style.display = 'none';
    modalImg.src = ''; // Clear the image src
    modalImg.style.display = 'none';
    loginContent.style.display = 'none';
    document.getElementById('settingsModal').style.display = 'none';
}

// Function to update goals display
function updateGoalsDisplay(calories, protein, carbs, fat) {
    if (calories) {
        document.getElementById('caloriesProgressFill').innerText = `0 / ${calories}`;
    }
    if (protein) {
        document.getElementById('proteinProgressFill').innerText = `0g / ${protein}g`;
    }
    if (carbs) {
        document.getElementById('carbsProgressFill').innerText = `0g / ${carbs}g`;
    }
    if (fat) {
        document.getElementById('fatProgressFill').innerText = `0g / ${fat}g`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    document.querySelectorAll('.meal-form').forEach(form => form.style.display = 'none');
    document.getElementById('exerciseForm').style.display = 'none';

    document.querySelectorAll('.saveMealButton').forEach(button => {
        button.addEventListener('click', (event) => {
            const mealType = event.target.dataset.mealType;
            addMeal(mealType);
        });
    });

    document.querySelectorAll('.remove-button').forEach(button => {
        button.addEventListener('click', () => {
            removeMeal(button.dataset.mealType, button.dataset.index);
        });
    });

    document.querySelectorAll('.remove-exercise-button').forEach(button => {
        button.addEventListener('click', () => {
            removeExercise();
        });
    });

    document.querySelectorAll('.edit-button').forEach(button => {
        button.addEventListener('click', () => {
            editMeal(button.dataset.mealType, button.dataset.index);
        });
    });

    // Toggle menu visibility
    document.getElementById('menuButton').addEventListener('click', function () {
        var menuButton = document.getElementById('menuButton');
        var menu = document.getElementById('menu');
        var header = document.querySelector('.header'); // Get the header element
        var rect = menuButton.getBoundingClientRect(); // Get the position of the button
        var headerRect = header.getBoundingClientRect(); // Get the position of the header

        if (menu.style.display === 'none' || menu.style.display === '') {
            menu.style.display = 'block';
            menu.style.position = 'absolute';
            menu.style.left = `${rect.left - headerRect.left}px`;  // Align with the left edge of the menu button relative to the header
            menu.style.top = `${rect.bottom + window.scrollY}px`;  // Position below the menu button, accounting for scroll position
            menu.style.zIndex = '1000';  // Ensure it appears above other elements
        } else {
            menu.style.display = 'none';
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (event) {
        var menu = document.getElementById('menu');
        var menuButton = document.getElementById('menuButton');
        if (!menu.contains(event.target) && event.target !== menuButton) {
            menu.style.display = 'none';
        }
    });

    // Open login modal
    document.querySelector('.menu-item-login').addEventListener('click', function () {
        var imageModal = document.getElementById('imageModal');
        var modalImage = document.getElementById('modalImage');
        var loginModalContent = document.getElementById('loginModalContent');

        modalImage.style.display = 'none';
        loginModalContent.style.display = 'block';
        imageModal.style.display = 'flex';
    });

    // Close login and settings modal when clicking outside
    document.addEventListener('click', function (event) {
        const imageModal = document.getElementById('imageModal');
        const loginModalContent = document.getElementById('loginModalContent');
        const settingsModal = document.getElementById('settingsModal');
        const settingsModalContent = document.querySelector('#settingsModal .modal-content');

        if (imageModal.style.display === 'flex' && !loginModalContent.contains(event.target) && !event.target.classList.contains('menu-item-login')) {
            imageModal.style.display = 'none';
            loginModalContent.style.display = 'none';
        }

        if (settingsModal.style.display === 'block' && !settingsModalContent.contains(event.target) && !event.target.classList.contains('menu-item-settings')) {
            settingsModal.style.display = 'none';
        }
    });

    // Placeholder for Google login
    document.getElementById('googleLogin').addEventListener('click', function () {
        alert('Google login functionality not implemented yet.');
    });

    // Placeholder for login form submission
    document.getElementById('loginForm').addEventListener('submit', function (event) {
        event.preventDefault();
        alert('Login functionality not implemented yet.');
    });

    // Placeholder for forgot password link
    document.getElementById('forgotPassword').addEventListener('click', function (event) {
        event.preventDefault();
        alert('Forgot password functionality not implemented yet.');
    });

    // Placeholder for sign up link
    document.getElementById('signUpLink').addEventListener('click', function (event) {
        event.preventDefault();
        alert('Sign up functionality not implemented yet.');
    });

    document.getElementById('saveExerciseButton').addEventListener('click', addExercise);

    // Show settings modal when settings menu item is clicked
    document.querySelector('.menu-item-settings').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'block';

        // Pre-fill the settings form with current goals
        document.getElementById('dailyCalories').value = goals.calories;
        document.getElementById('dailyProtein').value = goals.protein;
        document.getElementById('dailyCarbs').value = goals.carbs;
        document.getElementById('dailyFat').value = goals.fat;
    });

    // Handle form submission
    document.getElementById('settingsForm').addEventListener('submit', function (e) {
        e.preventDefault();

        // Retrieve form values
        const dailyCalories = parseInt(document.getElementById('dailyCalories').value);
        const dailyProtein = parseInt(document.getElementById('dailyProtein').value);
        const dailyCarbs = parseInt(document.getElementById('dailyCarbs').value);
        const dailyFat = parseInt(document.getElementById('dailyFat').value);

        // Update goals
        goals = {
            calories: dailyCalories,
            protein: dailyProtein,
            carbs: dailyCarbs,
            fat: dailyFat
        };

        // Save settings to local storage
        saveToLocalStorage();

        // Update display with new goals
        updateGoalsDisplay(goals.calories, goals.protein, goals.carbs, goals.fat);

        // Close modal
        closeModal();
    });

    // Initialize modal functionality on page load
    initializeModal();
});
