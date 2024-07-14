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

function toggleEditGoalsForm() {
    const form = document.getElementById('editGoalsForm');
    form.style.display = form.style.display === 'none' || form.style.display === '' ? 'block' : 'none';
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

function saveGoals() {
    goals.calories = parseInt(document.getElementById('calorieGoal').value) || 2150;
    goals.protein = parseInt(document.getElementById('proteinGoal').value) || 116;
    goals.carbs = parseInt(document.getElementById('carbGoal').value) || 289;
    goals.fat = parseInt(document.getElementById('fatGoal').value) || 38;

    updateDisplay();
    saveToLocalStorage();
    clearInputs();
    toggleEditGoalsForm();
}

function addMeal(mealType) {
    const dishName = document.getElementById(`${mealType}DishName`).value.trim();
    const calories = parseInt(document.getElementById(`${mealType}Calories`).value) || 0;
    const protein = parseInt(document.getElementById(`${mealType}Protein`).value) || 0;
    const carbs = parseInt(document.getElementById(`${mealType}Carbs`).value) || 0;
    const fat = parseInt(document.getElementById(`${mealType}Fat`).value) || 0;
    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const image = imageElement && imageElement.src ? imageElement.src : null;

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

                // Create meal image element only if the image property is not null and valid
                const imageHtml = meal.image ? `<img src="${meal.image}" class="meal-image" alt="">` : '';

                mealItem.innerHTML = `
                    <div class="drag-area">&#9776;</div>
                    ${imageHtml}
                    <div class="meal-info">
                        <p>Name: ${meal.dishName}</p>
                        <p>Calories: ${meal.calories}, Protein: ${meal.protein}g, Carbs: ${meal.carbs}g, Fat: ${meal.fat}g</p>
                    </div>
                    <div class="button-area">
                        <button class="edit-button" data-meal-type="${mealType}" data-index="${index}">Edit</button>
                        <button class="remove-button" data-meal-type="${mealType}" data-index="${index}">Remove</button>
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
            <p>Calories burned: ${currentExercise}</p>
            <div class="button-area">
                <button class="remove-button remove-exercise-button">Remove</button>
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

    document.getElementById('calorieGoalDisplay').textContent = goals.calories;
    document.getElementById('proteinGoalDisplay').textContent = goals.protein;
    document.getElementById('carbGoalDisplay').textContent = goals.carbs;
    document.getElementById('fatGoalDisplay').textContent = goals.fat;
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

    form.style.display = 'block';

    const saveButton = document.querySelector(`.saveMealButton[data-meal-type="${mealType}"]`);
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Save Edit';

    saveButton.onclick = function saveEdited() {
        removeMeal(mealType, index); // Remove the old entry
        addMeal(mealType); // Add the updated entry
        saveButton.textContent = originalText; // Revert the button text
        saveButton.onclick = function (event) {
            const mealType = event.target.dataset.mealType;
            addMeal(mealType);
        };
    };
}

function saveEditedMeal(mealType, index) {
    const dishName = document.getElementById(`${mealType}DishName`).value.trim();
    const calories = parseInt(document.getElementById(`${mealType}Calories`).value) || 0;
    const protein = parseInt(document.getElementById(`${mealType}Protein`).value) || 0;
    const carbs = parseInt(document.getElementById(`${mealType}Carbs`).value) || 0;
    const fat = parseInt(document.getElementById(`${mealType}Fat`).value) || 0;
    const imageElement = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
    const image = imageElement && imageElement.src ? imageElement.src : null;

    if (!dishName && calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
        return;
    }

    const meal = { dishName, calories, protein, carbs, fat, image };
    const mealDate = formatDate(currentDate);

    meals[mealDate][mealType][index] = meal;

    updateDisplay();
    saveToLocalStorage();
    clearInputs(mealType);
    document.getElementById(`${mealType}Form`).style.display = 'none';
}

async function handleImageUpload(input, mealType) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                // Compress the image
                const compressedImage = await compressImage(e.target.result, 500, 500);

                const uploadedImage = document.getElementById(`uploadedImage${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`);
                uploadedImage.src = compressedImage;
                uploadedImage.style.display = 'block'; // Show the image

                // Convert base64 to a Blob
                const blob = dataURLToBlob(compressedImage);
                const formData = new FormData();
                formData.append('image', blob, 'compressed.jpg');

                // Upload the compressed image to the backend
                const response = await fetch('https://nutrisnap-06e4cf9c4bb4.herokuapp.com/analyze_image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.text(); // Get the response as text
                console.log('API Response:', data); // Log the response to check values

                // Extract the nutrient values using a regular expression
                const matches = data.match(/Name:\s*(.*?),\s*Cals:\s*(\d+),\s*Protein:\s*(\d+)\s*g,\s*Carbs:\s*(\d+)\s*g,\s*Fat:\s*(\d+)\s*g/);

                if (matches) {
                    const dishName = matches[1];
                    const calories = parseInt(matches[2], 10);
                    const protein = parseInt(matches[3], 10);
                    const carbs = parseInt(matches[4], 10);
                    const fat = parseInt(matches[5], 10);

                    document.getElementById(`${mealType}DishName`).value = dishName;
                    document.getElementById(`${mealType}Calories`).value = calories;
                    document.getElementById(`${mealType}Protein`).value = protein;
                    document.getElementById(`${mealType}Carbs`).value = carbs;
                    document.getElementById(`${mealType}Fat`).value = fat;

                    // Automatically save the meal after uploading the image
                    addMeal(mealType);
                } else {
                    console.error('Error parsing API response:', data);
                    alert('Error analyzing image. Please try again.');
                }
            } catch (error) {
                console.error('Error processing image:', error);
                alert('Error processing image. Please try again.');
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

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    document.getElementById('editGoalsForm').style.display = 'none';
    document.querySelectorAll('.meal-form').forEach(form => form.style.display = 'none');
    document.getElementById('exerciseForm').style.display = 'none';

    document.getElementById('editGoalsButton').addEventListener('click', toggleEditGoalsForm);
    document.getElementById('saveGoalsButton').addEventListener('click', saveGoals);

    document.querySelectorAll('.saveMealButton').forEach(button => {
        button.removeEventListener('touchstart', addMeal); // Ensure no lingering touchstart listeners
        button.addEventListener('click', (event) => {
            const mealType = event.target.dataset.mealType;
            addMeal(mealType);
        });
    });

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

    document.getElementById('saveExerciseButton').addEventListener('click', addExercise);
    document.getElementById('saveExerciseButton').addEventListener('touchstart', addExercise);

    // Modal functionality
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const span = document.getElementsByClassName('close')[0];

    document.querySelectorAll('.meal-image').forEach(img => {
        img.addEventListener('click', () => {
            modal.style.display = 'block';
            modalImg.src = img.src;
        });
    });

    span.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
});