# Before You Eat

**Before You Eat** is a mobile-friendly web application that streamlines the process of logging and estimating nutritional content for your meals. With just a couple of taps, you can upload an image of your food—or type its name—and instantly receive approximate calorie, protein, carb, and fat values. Designed for simplicity, the app stores all data locally, making it effortlessly accessible without any account setup.

## Key Features

- **Instant Nutritional Estimates**: Upload or snap a photo of your meal, and the app automatically generates estimated macros (calories, fat, carbs, and protein) using OpenAI’s GPT-4o-mini model.

- **Text-Based Meal Input**: Don’t have a photo? Simply type in a dish name and hit "Generate Macros." The app interprets your input - even if misspelled - and provides an estimated macro profile.

- **Daily Goals Tracking**: Set custom macro goals for each day. The app visualizes your progress with intuitive bars, making it easy to see how close you are to meeting your targets.

- **Flexible Meal Organization**: Easily categorize meals under breakfast, lunch, dinner, snacks, or even log exercises. Drag-and-drop entries between these categories for better organization.

- **Local Data Storage**: All logs are saved in your browser’s local storage, providing instant access without any login. The storage system automatically removes older entries when space (approximately 5 MB) runs low, ensuring uninterrupted logging.

## How It Works

1. **Capture or Upload an Image**:
    Tap “Upload” or “Capture” and select your meal photo.
    ![Capture or Upload an Image](images/step1-upload-image.png)

2. **Nutritional Analysis**:
    The photo is sent to the GPT-4o-mini model with a custom prompt. The model returns the estimated nutritional content in the format: `Name: [Name of dish] ,Cals: a, Protein: b [g], Carbs: c [g], Fat: d [g]`. Alternatively, type a dish name and hit “Generate Macros” or manually input values and save.
    ![Nutritional Analysis](images/step2-analysis.png)

3. **Quick Logging**:
    The extracted nutritional values are automatically added to your daily log.
    ![Quick Logging](images/step3-logging.png)

## Technologies and Frameworks

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Python, Flask, Render, OpenAI's gpt-4o-mini API for image and text-based meal analysis
- **Storage**: Browser local storage (no dedicated database or user accounts)

## Demo

https://tn-js.github.io/BeforeYouEat/

## License

This project is licensed under the MIT License.
