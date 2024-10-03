from flask import Flask, request, jsonify
import requests
import os
from base64 import b64encode
from flask_cors import CORS
from dotenv import load_dotenv

app = Flask(__name__)

# Enable CORS for the specific routes
CORS(app, resources={
    r"/analyze_image": {"origins": "https://tn-js.github.io"},
    r"/estimate_macros": {"origins": "https://tn-js.github.io"}
})

# Load environment variables from .env file
load_dotenv()

# Retrieve the API key from environment variables
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key:
    raise ValueError("No OpenAI API key found. Set the OPENAI_API_KEY environment variable.")

@app.route('/estimate_macros', methods=['POST'])
def estimate_macros():
    if 'meal_name' not in request.json:
        return jsonify({'error': 'No meal name provided'}), 400

    meal_name = request.json['meal_name']

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": f"Please estimate the macros for the meal named '{meal_name}'. Try to estimate the name of the dish that was inputted (if you suspect it was misspelled or shortened), calories, fat, carbs, and protein in grams based on common recipes and serving sizes. The final output should only write out the name and the full nutrients for the whole meal. Remove all other unnecessary information, just output the name of the food and the whole meal's nutrients without any extra words. Use the format: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."
            }
        ],
        "max_tokens": 150
    }

    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200:
        return jsonify({'error': 'Failed to estimate macros'}), response.status_code

    result = response.json()
    return jsonify(result['choices'][0]['message']['content'])

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    image_file = request.files['image']
    base64_image = b64encode(image_file.read()).decode('utf-8')

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Please estimate how many calories is in this meal. Try to estimate the mass of each piece of food and then multiply the weight with the caloric density of each food. Also try to estimate the macros; fat, carbs, and protein in grams. Try to figure out what the dish is and name it as well. If there is a visible barcode, use that to retrieve the information. The final output should only write out the name and the full nutrients for the whole meal. Remove all other unnecessary information, just output the name of the food and the whole meal's nutrients without any extra words. Use the format: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."
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

    app.logger.debug(f"Payload sent to OpenAI: {payload}")

    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200:
        app.logger.error(f"Failed to analyze image: {response.status_code}")
        return jsonify({'error': 'Failed to analyze image'}), response.status_code

    result = response.json()
    app.logger.debug(f"Response from OpenAI: {result}")

    content = result['choices'][0]['message']['content']
    app.logger.debug(f"Content received: {content}")

    return jsonify(content)

if __name__ == '__main__':
    app.run(debug=True)
