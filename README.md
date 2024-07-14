# NutriSnap

NutriSnap is a web application that allows users to log and track their meals by uploading pictures of their food. The app uses OpenAI's GPT-4o model to approximate the nutritional content of the meals and logs this information automatically.

## Features

- **Meal Logging**: Users can upload pictures of their meals or manually input nutritional information.
- **Nutritional Analysis**: NutriSnap estimates calories, protein, carbs, and fat content from meal images.
- **Automatic Logging**: Nutritional information is extracted and logged automatically.
- **Dietary Goals**: Users can set and track dietary goals with progress bars.
- **Meal Management**: Edit and organize logged meals into breakfast, lunch, dinner, and snacks.

## How It Works

1. **Upload or Capture Meal Photo**: Users can upload or take a picture of their meal.
2. **Nutritional Analysis**: The photo is sent to the GPT-4o model with a custom prompt. The model returns the estimated nutritional content in the format: `Cals: a, Protein: b [g], Carbs: c [g], Fat: d [g]`.
3. **Data Extraction and Logging**: Nutritional values are extracted using a regular expression in the JavaScript script and logged in the app.
4. **Manual Input**: Users can also manually input the macros for their meals.

## Technologies and Frameworks

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Python, Flask, OpenAI's GPT-4o API
- **Machine Learning**: OpenAI's GPT-4o API (plans for local machine with open-source LLM)

## User Interaction

- **Mobile-First Design**: Optimized for mobile with a 9:16 format and large buttons.
- **Meal Logging**: Users can log meals via photo upload/capture or manual input.
- **Meal Management**: Edit and drag-and-drop meals between breakfast, lunch, dinner, and snacks slots.
- **Dietary Goals**: Set and track dietary goals with visual progress bars.
- **Local Storage**: Logging data is stored locally using localStorage in JavaScript.

## Setup and Installation

1. Clone the repository:
   ```
   git clone https://github.com/TN-js/NutriSnap.git
   cd NutriSnap
   ```

2. Install the dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Configuration:
   - Update the OpenAI API key.
   - Adjust backend settings to point to your server (default points to Heroku).

4. Run the application:
   ```
   python app.py
   ```
