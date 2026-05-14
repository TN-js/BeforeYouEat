# --- START OF COMPLETE app.py ---
from flask import Flask, request, jsonify
import json
import requests
import os
from base64 import b64encode
from flask_cors import CORS
from dotenv import load_dotenv
# from flask_sqlalchemy import SQLAlchemy
# from sqlalchemy.exc import IntegrityError # Keep for potential implicit use by SQLAlchemy
from functools import wraps
from datetime import datetime

# For Google token verification
from google.oauth2 import id_token as google_id_token_verify
from google.auth.transport import requests as google_requests

# --- Load Environment Variables ---
load_dotenv() # From .env file for local, ignored if Render sets them

app = Flask(__name__)

# --- Configuration Section ---
IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production'
IS_LOCAL_TESTING = not IS_PRODUCTION
app.logger.info(f"Application starting. IS_PRODUCTION: {IS_PRODUCTION}, IS_LOCAL_TESTING: {IS_LOCAL_TESTING}")

# CORS Configuration
if IS_LOCAL_TESTING:
    app.logger.info("Applying DEVELOPMENT CORS settings.")
    CORS(app, resources={
        r"/*": {"origins": [
            "https://tn-js.github.io", "http://127.0.0.1:5000", 
            "http://127.0.0.1:5500", "http://localhost:5500",
            "http://localhost:8000", "http://127.0.0.1:8000",
            "null", "file://"
        ]}
    })
else: # Production (Render)
    app.logger.info("Applying PRODUCTION CORS settings.")
    frontend_url = os.getenv('FRONTEND_URL', "https://tn-js.github.io")
    CORS(app, resources={
        r"/analyze_image": {"origins": frontend_url},
        r"/estimate_macros": {"origins": frontend_url},
        r"/edit_macros_with_command": {"origins": frontend_url},
        r"/health": {"origins": frontend_url},
        r"/api/*": {"origins": frontend_url}
    })

"""
# --- Database Configuration ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__)) # Dir where app.py is

if IS_LOCAL_TESTING:
    app.logger.info("Using LOCAL SQLite database configuration.")
    env_db_url = os.getenv('DATABASE_URL')
    if not (env_db_url and env_db_url.startswith('sqlite:///')):
        # Fallback if .env DATABASE_URL is missing or not for SQLite
        INSTANCE_FOLDER_PATH = os.path.join(BASE_DIR, 'instance')
        DATABASE_FILE_PATH = os.path.join(INSTANCE_FOLDER_PATH, 'app.db')
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_FILE_PATH}'
        app.logger.warn(f"DATABASE_URL from .env not used or invalid for local SQLite. Using default: {app.config['SQLALCHEMY_DATABASE_URI']}")
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = env_db_url
else: # Production (Render)
    app.logger.info("Using PRODUCTION PostgreSQL database configuration from DATABASE_URL.")
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')

if not app.config.get('SQLALCHEMY_DATABASE_URI'):
    raise ValueError("DATABASE_URL is not set. Check .env or Render settings.")
app.logger.info(f"Final SQLALCHEMY_DATABASE_URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
"""


# Debug Mode
app.debug = os.getenv('FLASK_DEBUG') == '1' if IS_LOCAL_TESTING else False
app.logger.info(f"Flask debug mode: {app.debug}")

# API Keys and Client IDs
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key: raise ValueError("OPENAI_API_KEY not found.")
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
if not GOOGLE_CLIENT_ID: raise ValueError("GOOGLE_CLIENT_ID not found.")

OPENAI_MACRO_MODEL = "gpt-5.4-mini"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
MEAL_MACRO_SCHEMA = {
    "type": "object",
    "properties": {
        "dishName": {
            "type": "string",
            "description": "Clean, concise meal name with any useful quantity or weight included."
        },
        "calories": {
            "type": "number",
            "description": "Estimated total calories for the whole meal."
        },
        "fat": {
            "type": "number",
            "description": "Estimated total fat in grams for the whole meal."
        },
        "carbs": {
            "type": "number",
            "description": "Estimated total carbohydrates in grams for the whole meal."
        },
        "protein": {
            "type": "number",
            "description": "Estimated total protein in grams for the whole meal."
        }
    },
    "required": ["dishName", "calories", "fat", "carbs", "protein"],
    "additionalProperties": False
}
MEAL_MACRO_TEXT_FORMAT = {
    "type": "json_schema",
    "name": "meal_macro_estimate",
    "schema": MEAL_MACRO_SCHEMA,
    "strict": True
}

def create_macro_payload(content, max_output_tokens=300):
    return {
        "model": OPENAI_MACRO_MODEL,
        "reasoning": {"effort": "none"},
        "text": {
            "format": MEAL_MACRO_TEXT_FORMAT,
            "verbosity": "low"
        },
        "input": [{
            "role": "system",
            "content": "You estimate meal nutrition. Return JSON only using the provided schema."
        }, {
            "role": "user",
            "content": content
        }],
        "max_output_tokens": max_output_tokens
    }

def extract_response_text(data):
    output_text = data.get('output_text')
    if isinstance(output_text, list):
        text = ''.join(part for part in output_text if isinstance(part, str)).strip()
        if text:
            return text
    elif isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    for entry in data.get('output', []):
        if not isinstance(entry, dict) or entry.get('type') != 'message':
            continue
        text_parts = []
        for piece in entry.get('content', []):
            if isinstance(piece, dict):
                if piece.get('type') == 'refusal':
                    raise ValueError(piece.get('refusal') or 'Model refused the request')
                if piece.get('type') in ('text', 'output_text'):
                    text_parts.append(piece.get('text', ''))
        text = ''.join(text_parts).strip()
        if text:
            return text
    return ''

def parse_macro_response(data):
    try:
        macro_data = json.loads(extract_response_text(data))
    except (TypeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"OpenAI response did not contain valid macro JSON: {exc}") from exc

    required_fields = ("dishName", "calories", "fat", "carbs", "protein")
    missing = [field for field in required_fields if field not in macro_data]
    if missing:
        raise ValueError(f"OpenAI macro JSON missing fields: {', '.join(missing)}")

    try:
        return {
            "dishName": str(macro_data["dishName"]).strip(),
            "calories": round(float(macro_data["calories"])),
            "fat": round(float(macro_data["fat"]), 1),
            "carbs": round(float(macro_data["carbs"]), 1),
            "protein": round(float(macro_data["protein"]), 1)
        }
    except (TypeError, ValueError) as exc:
        raise ValueError(f"OpenAI macro JSON contained non-numeric macro values: {exc}") from exc

"""
# FLAG FOR ONE-TIME DB INITIALIZATION (per worker)
db_initialized_for_worker = False

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_user_id = db.Column(db.String(255), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=True)
    name = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    settings = db.relationship('UserSetting', backref='user', uselist=False, cascade="all, delete-orphan")
    meals = db.relationship('MealEntry', backref='user', lazy='dynamic', cascade="all, delete-orphan")
    exercise_entries = db.relationship('ExerciseEntry', backref='user', lazy='dynamic', cascade="all, delete-orphan")

class UserSetting(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    daily_calories = db.Column(db.Integer, default=2000)
    daily_fat = db.Column(db.Integer, default=67)
    daily_carbs = db.Column(db.Integer, default=275)
    daily_protein = db.Column(db.Integer, default=75)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MealEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True) # serverId
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    entry_date = db.Column(db.Date, nullable=False)
    meal_type = db.Column(db.String(50), nullable=False)
    client_meal_id = db.Column(db.BigInteger, nullable=False)
    dish_name = db.Column(db.String(255))
    calories = db.Column(db.Integer)
    fat = db.Column(db.Numeric(10, 2))
    carbs = db.Column(db.Numeric(10, 2))
    protein = db.Column(db.Numeric(10, 2))
    image_base64 = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'entry_date', 'client_meal_id', name='_user_date_client_id_uc'),)

class ExerciseEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    entry_date = db.Column(db.Date, nullable=False)
    calories_burned = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'entry_date', name='_user_date_exercise_uc'),)

# --- FUNCTION TO INITIALIZE DB ---
def initialize_database():
    global db_initialized_for_worker
    # This check ensures it only tries to create tables once per Gunicorn worker process
    if not db_initialized_for_worker:
        try:
            with app.app_context(): # db.create_all() needs an app context
                db.create_all()
            app.logger.info("DB Init: Database tables checked/created by initialize_database().")
            db_initialized_for_worker = True
        except Exception as e:
            app.logger.error(f"DB Init ERROR: Could not create database tables via initialize_database(): {e}", exc_info=True)

# --- HOOK TO RUN BEFORE REQUESTS ---
@app.before_request
def before_request_func():
    initialize_database()

# --- Authentication Decorator ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            try: token = request.headers['Authorization'].split(' ')[1]
            except IndexError: return jsonify({'message': 'Bearer token malformed'}), 401
        if not token: return jsonify({'message': 'Token is missing'}), 401
        try:
            idinfo = google_id_token_verify.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
            google_user_id = idinfo['sub']
            current_user = User.query.filter_by(google_user_id=google_user_id).first()
            if not current_user: # Create user and default settings if new
                current_user = User(google_user_id=google_user_id, email=idinfo.get('email'), name=idinfo.get('name'))
                db.session.add(current_user)
                default_settings = UserSetting(user=current_user)
                db.session.add(default_settings)
                db.session.commit()
                app.logger.info(f"Created new user and settings for google_user_id: {google_user_id}")
            kwargs['current_user'] = current_user
        except ValueError as e: app.logger.error(f"Token verification error: {e}"); return jsonify({'message': 'Token invalid/expired'}), 401
        except Exception as e: app.logger.error(f"Auth error: {e}", exc_info=True); return jsonify({'message': 'Auth error'}), 500
        return f(*args, **kwargs)
    return decorated

# --- API Endpoints ---
@app.route('/api/data', methods=['GET'])
@token_required
def get_user_data(current_user):
    date_str = request.args.get('date')
    if not date_str: return jsonify({'error': 'Date parameter required'}), 400
    try: entry_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError: return jsonify({'error': 'Invalid date format YYYY-MM-DD'}), 400
    
    user_settings = UserSetting.query.filter_by(user_id=current_user.id).first()
    if not user_settings:
        app.logger.warn(f"User {current_user.id} settings not found, creating defaults in get_user_data.")
        user_settings = UserSetting(user_id=current_user.id)
        db.session.add(user_settings)
        db.session.commit()
        
    goals = {'calories': user_settings.daily_calories, 'fat': user_settings.daily_fat, 'carbs': user_settings.daily_carbs, 'protein': user_settings.daily_protein}
    
    db_meals = MealEntry.query.filter_by(user_id=current_user.id, entry_date=entry_date).all()
    meals_struct = {'breakfast': [], 'lunch': [], 'dinner': [], 'snacks': []}
    for m in db_meals:
        obj = {'id': m.client_meal_id, 'serverId': m.id, 'dishName': m.dish_name, 'calories': m.calories,
               'fat': float(m.fat or 0), 'carbs': float(m.carbs or 0), 'protein': float(m.protein or 0),
               'image': m.image_base64, 'lastModified': (m.updated_at or m.created_at).isoformat(), 'needsSync': False}
        if m.meal_type in meals_struct: meals_struct[m.meal_type].append(obj)
    for mt in meals_struct: meals_struct[mt].sort(key=lambda x: x['id'])
    
    ex_db = ExerciseEntry.query.filter_by(user_id=current_user.id, entry_date=entry_date).first()
    ex_total = ex_db.calories_burned if ex_db else 0
    
    return jsonify({'goals': goals, 'meals': meals_struct, 'exercise': ex_total}), 200

@app.route('/api/sync', methods=['POST'])
@token_required
def sync_data(current_user):
    data = request.get_json()
    if not data: return jsonify({'error': 'No sync data provided'}), 400
    app.logger.info(f"Sync user {current_user.id}: Received keys: {list(data.keys())}")
    s_ids, d_ids, m_s_ids = [], [], {}

    for m_data in data.get('mealsToUpdate', []):
        cid, ed_s, mt = m_data.get('id'), m_data.get('date'), m_data.get('mealType')
        if not all([cid, ed_s, mt]): 
            app.logger.warn(f"Sync: Skip meal update (missing fields for {m_data.get('dishName', 'N/A')})")
            continue
        try: ed = datetime.strptime(ed_s, '%Y-%m-%d').date()
        except ValueError: 
            app.logger.warn(f"Sync: Skip meal update (invalid date '{ed_s}')")
            continue
        
        ex_m = MealEntry.query.filter_by(user_id=current_user.id, client_meal_id=cid, entry_date=ed).first()
        
        client_lm_str = m_data.get('lastModified')
        if client_lm_str:
            try:
                aware_client_dt = datetime.fromisoformat(client_lm_str.replace('Z', '+00:00'))
                c_lm = aware_client_dt.replace(tzinfo=None) # Convert to naive UTC
            except ValueError:
                app.logger.error(f"Sync: Could not parse client lastModified string: {client_lm_str}")
                c_lm = datetime.min 
        else:
            c_lm = datetime.min

        s_lm = ex_m.updated_at if ex_m and ex_m.updated_at else datetime.min
        if s_lm.tzinfo is not None: s_lm = s_lm.replace(tzinfo=None) # Ensure naive

        if not ex_m or c_lm >= s_lm:
            m_commit = ex_m if ex_m else MealEntry(user_id=current_user.id, client_meal_id=cid)
            if not ex_m: db.session.add(m_commit); app.logger.info(f"Sync: Adding new meal client_id {cid}")
            else: app.logger.info(f"Sync: Updating meal client_id {cid}")
            
            m_commit.entry_date=ed; m_commit.meal_type=mt; m_commit.dish_name=m_data.get('dishName')
            m_commit.calories=m_data.get('calories'); m_commit.fat=m_data.get('fat'); m_commit.carbs=m_data.get('carbs')
            m_commit.protein=m_data.get('protein'); m_commit.image_base64=m_data.get('image')
            try: 
                db.session.flush() 
                m_s_ids[cid] = m_commit.id
            except Exception as e_f: app.logger.error(f"Sync: Flush error meal client_id {cid}: {e_f}", exc_info=True)
            s_ids.append(cid)
        else: 
            app.logger.info(f"Sync: Server meal client_id {cid} is newer. Client data for this meal not applied.")
            if ex_m: m_s_ids[cid] = ex_m.id 
            s_ids.append(cid) 

    for del_d in data.get('mealsToDelete', []):
        cid, ed_s, sid = del_d.get('client_id'), del_d.get('date'), del_d.get('serverId')
        m_del = None
        if sid: m_del = MealEntry.query.filter_by(user_id=current_user.id, id=sid).first()
        elif cid and ed_s:
            try: ed = datetime.strptime(ed_s, '%Y-%m-%d').date(); m_del = MealEntry.query.filter_by(user_id=current_user.id, client_meal_id=cid, entry_date=ed).first()
            except ValueError: continue
        elif cid: m_del = MealEntry.query.filter_by(user_id=current_user.id, client_meal_id=cid).first()
        
        if m_del: 
            db.session.delete(m_del)
            app.logger.info(f"Sync: Deleted meal client_id {cid}, serverId {m_del.id}")
        else: 
            app.logger.warn(f"Sync: Meal to delete not found for client_id {cid}")
        if cid: d_ids.append(cid)

    for d_s, cals in data.get('exercisePerDate', {}).items():
        try:
            ed = datetime.strptime(d_s, '%Y-%m-%d').date()
            ex_db = ExerciseEntry.query.filter_by(user_id=current_user.id, entry_date=ed).first()
            if cals == 0 and ex_db: db.session.delete(ex_db)
            elif cals > 0:
                if not ex_db: ex_db = ExerciseEntry(user_id=current_user.id, entry_date=ed); db.session.add(ex_db)
                ex_db.calories_burned = cals
            app.logger.info(f"Sync: Processed exercise for user {current_user.id} on {d_s}")
        except Exception as e_ex: app.logger.error(f"Sync: Error syncing exercise for {d_s}: {e_ex}", exc_info=True)

    g_d = data.get('goals')
    if g_d:
        u_s = UserSetting.query.filter_by(user_id=current_user.id).first()
        if not u_s: u_s = UserSetting(user_id=current_user.id); db.session.add(u_s) 
        u_s.daily_calories=g_d.get('calories',u_s.daily_calories);u_s.daily_fat=g_d.get('fat',u_s.daily_fat)
        u_s.daily_carbs=g_d.get('carbs',u_s.daily_carbs);u_s.daily_protein=g_d.get('protein',u_s.daily_protein)
        app.logger.info(f"Sync: Processed goals for user {current_user.id}")

    try: db.session.commit()
    except Exception as e_c: db.session.rollback(); app.logger.error(f"Sync: Commit error: {e_c}", exc_info=True); return jsonify({'error': 'Commit error during sync'}), 500
    return jsonify({'message':'Sync processed.','syncedMealClientIds':s_ids,'deletedMealClientIds':d_ids,'mealServerIds':m_s_ids}),200
"""


@app.route('/estimate_macros', methods=['POST'])
def estimate_macros():
    request_data = request.get_json(silent=True) or {}
    if 'meal_name' not in request_data:
        return jsonify({'error': 'No meal name provided'}), 400
    meal_name = request_data['meal_name']
    prompt_text = f"""Estimate the macros for this meal name: {meal_name}

Infer the likely dish if the input is misspelled or shortened. Use common recipes and serving sizes. If the input includes a mass, portion count, or useful quantity, preserve that in dishName. Return JSON with total whole-meal calories, fat, carbs, and protein."""
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = create_macro_payload(prompt_text, max_output_tokens=200)
    response = requests.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)
    if response.status_code != 200:
        return jsonify({'error': f"Failed to estimate macros: {response.text}"}), response.status_code

    data = response.json()
    try:
        macro_data = parse_macro_response(data)
    except ValueError as exc:
        app.logger.error(f"Parse OpenAI estimate_macros: {exc} - Resp: {data}")
        return jsonify({'error': 'Error parsing OpenAI response'}), 500

    return jsonify(macro_data)

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    image_file = request.files['image']
    mime_type = getattr(image_file, 'mimetype', None) or 'image/jpeg'
    base64_image = b64encode(image_file.read()).decode('utf-8')
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = create_macro_payload([
        {"type": "input_text", "text": "Estimate macros for this meal image. Identify the dish, estimate each visible food's portion mass, and use typical caloric density and macros. Return JSON with total whole-meal calories, fat, carbs, and protein."},
        {"type": "input_image", "image_url": f"data:{mime_type};base64,{base64_image}"}
    ], max_output_tokens=300)
    response = requests.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)
    if response.status_code != 200:
        app.logger.error(f"OpenAI analyze_image: {response.status_code} - {response.text}")
        return jsonify({'error': f"Failed to analyze image: {response.text}"}), response.status_code

    data = response.json()
    try:
        macro_data = parse_macro_response(data)
    except ValueError as exc:
        app.logger.error(f"Parse OpenAI analyze_image: {exc} - Resp: {data}")
        return jsonify({'error': 'Error parsing OpenAI image analysis response'}), 500

    return jsonify(macro_data)

@app.route('/edit_macros_with_command', methods=['POST'])
def edit_macros_with_command():
    data = request.get_json(silent=True) or {}
    required_fields = ['original_meal_name', 'new_meal_name', 'current_calories', 'current_fat', 'current_carbs', 'current_protein']
    if not all(field in data for field in required_fields):
        missing = [field for field in required_fields if field not in data]
        app.logger.error(f"edit_macros_with_command: Missing fields: {', '.join(missing)}")
        return jsonify({'error': f"Missing fields: {', '.join(missing)}"}), 400

    original_meal_name = data['original_meal_name']
    new_meal_name = data['new_meal_name']
    current_calories = data['current_calories']
    current_fat = data['current_fat']
    current_carbs = data['current_carbs']
    current_protein = data['current_protein']

    try:
        current_calories = float(current_calories)
        current_fat = float(current_fat)
        current_carbs = float(current_carbs)
        current_protein = float(current_protein)
    except (TypeError, ValueError):
        app.logger.error("edit_macros_with_command: Invalid current macro values provided.")
        return jsonify({'error': 'Invalid current macro values provided. Must be numbers.'}), 400

    prompt_content = f"""The user is editing a meal entry.
The original meal name was: '{original_meal_name}'.
The new meal name, which might include a command/message/question for you for you to process (usually the last sentence of the edit) or indicate a change in the nature of the dish, is: '{new_meal_name}'.
The current macros for this meal (based on the '{original_meal_name}' before applying any command from the new meal name) are:
Calories: {current_calories} kcal
Fat: {current_fat} g
Carbs: {current_carbs} g
Protein: {current_protein} g

Your task is to:
1. Compare the 'original meal name' with the 'new meal name' (if relevant, if it's wholly different you can probably just ignore the old name).
2. Analyze the 'new meal name' for any commands or questions (e.g., "x2", "double it", "half portion", "add 10g protein", "remove 5g fat", "set to 200g total weight", "plus one egg", "It's a sandwich, why did you put ceasar salad??") OR for changes in the fundamental nature of the dish (e.g., "cheeseburger" to "cheeseburger (plant-based)").
3. If a command or a significant change in dish nature is found, update the provided 'current macros' accordingly.
   - For scaling commands (e.g., "x2", "200g" if original implied 100g), scale all macros proportionally based on the 'current macros'.
   - For additive/subtractive commands ("add 10g protein", "remove 5g fat"), adjust only the relevant macros.
   - For changes in dish nature (like switching to a plant-based version), estimate new macros based on typical values for that dish version, leveraging the provided macros as a starting reference.
4. Provide the updated meal name and macros as JSON. Always use numbers, not words like "seventy eight". Remove any issued command from dishName.
5. If no change is necessary, return the provided macros but still use the formatting above.

Always do what you think is best for the current input though, don't rely on these guidelines too much.

NOTE: If something looks like a command to you in the meal name; prioritize that above all else. And always make the new meal name look clean and finished, we're looking for short, clean, and concise names for meals, only keep a parentheses if necessary.
"""

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = create_macro_payload(prompt_content, max_output_tokens=250)

    app.logger.info(f"Sending to OpenAI for AI Edit: Original: '{original_meal_name}', New: '{new_meal_name}' with current macros C:{current_calories} F:{current_fat} Cb:{current_carbs} P:{current_protein}")

    response = requests.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)

    if response.status_code != 200:
        app.logger.error(f"OpenAI edit_macros_with_command API error: {response.status_code} - {response.text}")
        return jsonify({'error': f"Failed to edit macros with command: {response.text}"}), response.status_code

    data = response.json()
    try:
        macro_data = parse_macro_response(data)
    except ValueError as exc:
        app.logger.error(f"Error parsing OpenAI response for edit_macros_with_command: {exc} - Response JSON: {data}")
        return jsonify({'error': 'Error parsing OpenAI response for command edit'}), 500

    return jsonify(macro_data)

@app.route('/health', methods=['GET'])
def health_check(): return jsonify({'status': 'live'}), 200

# --- Main Execution & DB Setup (for LOCAL TESTING ONLY) ---
if __name__ == '__main__':
    """
    if IS_LOCAL_TESTING:
        # Ensure the instance folder exists for local SQLite.
        db_uri_config = app.config.get('SQLALCHEMY_DATABASE_URI')
        if db_uri_config and db_uri_config.startswith('sqlite:///'):
            db_file_path_str = db_uri_config[len('sqlite:///'):]
            # On Windows, if path is /C:/..., remove leading /
            if os.name == 'nt' and db_file_path_str.startswith('/') and len(db_file_path_str) > 2 and db_file_path_str[2] == ':':
                db_file_path_str = db_file_path_str[1:]
            
            db_directory = os.path.dirname(os.path.abspath(db_file_path_str))
            
            if not os.path.exists(db_directory):
                try:
                    os.makedirs(db_directory)
                    app.logger.info(f"Created database directory at: {db_directory}")
                except OSError as e:
                    app.logger.error(f"FATAL: Could not create database directory at {db_directory}: {e}", exc_info=True)
                    exit(1) 
            else:
                 app.logger.info(f"Database directory already exists at: {db_directory}")
        else:
             app.logger.warn(f"Local testing, but DB URI '{db_uri_config}' is not a recognized SQLite path for instance folder check.")

    if IS_LOCAL_TESTING: # This db.create_all() is primarily for local setup.
        with app.app_context():
            try:
                db.create_all()
                app.logger.info("Local: Database tables checked/created successfully by __main__.")
            except Exception as e:
                app.logger.error(f"Local: ERROR creating tables in __main__: {e}", exc_info=True)
                exit(1) # Critical if local DB can't be set up


    """
    if IS_LOCAL_TESTING:
        app.logger.info(f"Starting Flask development server on host 0.0.0.0, port 5000. Debug: {app.debug}")
        app.run(host='0.0.0.0', port=5000)
    else:
        # Gunicorn imports 'app' and runs it directly.
        app.logger.info("Application configured for production. Gunicorn or another WSGI server should be used to run 'app'.")
# --- END OF COMPLETE app.py ---

