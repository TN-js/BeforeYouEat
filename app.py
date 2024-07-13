from flask import Flask, request, jsonify
import requests
import os
from base64 import b64encode
from flask_cors import CORS
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app, resources={r"/analyze_image": {"origins": "https://tn-js.github.io"}})  # Enable CORS for the specific route

# Load environment variables from .env file
load_dotenv()

# Retrieve the API key from environment variables
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key:
    raise ValueError("No OpenAI API key found. Set the OPENAI_API_KEY environment variable.")

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
        "model": "gpt-4o",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Please estimate how many calories is in this meal. Try to estimate the mass of each piece of food and then multiply the weight with the caloric density of each food. Also try to estimate the macros; protein, carbs and fat in grams. The final output should only write out the full nutrient for the whole meal. Remove all unnecessary information, just output the whole meals nutrients without any extra words. Use the format: 'Cals: a, Protein: b g, Carbs: c g, Fat: d g'"
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
    return jsonify(result['choices'][0]['message']['content'])

if __name__ == '__main__':
    app.run(debug=True)
