from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import requests
import os
from base64 import b64encode
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # This enables CORS for all routes

# Load environment variables from .env file
load_dotenv()

# Retrieve the API key from environment variables
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key:
    raise ValueError("No OpenAI API key found. Set the OPENAI_API_KEY environment variable.")

@app.route('/estimate_macros', methods=['POST', 'OPTIONS'])
def estimate_macros():
    if request.method == "OPTIONS":
        return _build_cors_preflight_response()
    elif request.method == "POST":
        data = request.json
        if 'meal_name' not in data:
            return jsonify({'error': 'No meal name provided'}), 400
        meal_name = data['meal_name']
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_api_key}"
        }
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "user",
                    "content": f"Please estimate the macros for the meal named '{meal_name}'. Try to estimate the calories, protein, carbs, and fat in grams based on common recipes and serving sizes. Use the format: 'Name: {meal_name}, Cals: a, Protein: b g, Carbs: c g, Fat: d g'."
                }
            ],
            "max_tokens": 150
        }
        try:
            openai_response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            if openai_response.status_code != 200:
                app.logger.error(f"OpenAI API error: {openai_response.status_code} - {openai_response.text}")
                return jsonify({'error': 'Failed to estimate macros'}), openai_response.status_code
            result = openai_response.json()
            response_data = jsonify(result['choices'][0]['message']['content'])
            return _corsify_actual_response(response_data)
        except Exception as e:
            app.logger.error(f"Error in estimate_macros: {str(e)}")
            return jsonify({'error': 'Internal server error'}), 500

@app.route('/analyze_image', methods=['POST', 'OPTIONS'])
def analyze_image():
    if request.method == "OPTIONS":
        return _build_cors_preflight_response()
    elif request.method == "POST":
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400
        image_file = request.files['image']
        base64_image = b64encode(image_file.read()).decode('utf-8')
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_api_key}"
        }
        payload = {
            "model": "gpt-4o-mini",  # Kept the original model name
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Please estimate how many calories is in this meal. Try to estimate the mass of each piece of food and then multiply the weight with the caloric density of each food. Also try to estimate the macros; protein, carbs, and fat in grams. Try to figure out what the dish is and name it as well. If there is a visible barcode, use that to retrieve the information. The final output should only write out the name and the full nutrient for the whole meal. Remove all other unnecessary information, just output the name of the food and the whole meal's nutrients without any extra words. Use the format: 'Name: [Dish Name], Cals: a, Protein: b g, Carbs: c g, Fat: d g'."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 300
        }
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        if response.status_code != 200:
            return jsonify({'error': 'Failed to analyze image'}), response.status_code
        result = response.json()
        return _corsify_actual_response(jsonify(result['choices'][0]['message']['content']))

def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add('Access-Control-Allow-Headers', "Content-Type,Authorization")
    response.headers.add('Access-Control-Allow-Methods', "GET,PUT,POST,DELETE,OPTIONS")
    return response

def _corsify_actual_response(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response

if __name__ == '__main__':
    app.run(debug=True)
