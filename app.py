# --- START OF COMPLETE app.py ---
from flask import Flask, request, jsonify
import requests
import os
from base64 import b64encode
from flask_cors import CORS
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError # Keep for potential implicit use by SQLAlchemy
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
        r"/health": {"origins": frontend_url},
        r"/api/*": {"origins": frontend_url}
    })

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

# Debug Mode
app.debug = os.getenv('FLASK_DEBUG') == '1' if IS_LOCAL_TESTING else False
app.logger.info(f"Flask debug mode: {app.debug}")

# API Keys and Client IDs
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key: raise ValueError("OPENAI_API_KEY not found.")
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
if not GOOGLE_CLIENT_ID: raise ValueError("GOOGLE_CLIENT_ID not found.")

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

@app.route('/estimate_macros', methods=['POST'])
def estimate_macros():
    if 'meal_name' not in request.json: return jsonify({'error': 'No meal name provided'}), 400
    meal_name = request.json['meal_name']
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = { "model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": f"Please estimate the macros for the meal named '{meal_name}'. Try to estimate the name of the dish that was inputted (if you suspect it was misspelled or shortened), calories, fat, carbs, and protein in grams based on common recipes and serving sizes. The final output should only write out the name and the full nutrients for the whole meal. Remove all other unnecessary information (if a meal name input includes the mass, then keep that in your output name though, it could be useful.), just output the name of the food and the whole meal's nutrients without any extra words. Use the format: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."}], "max_tokens": 150 }
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200: return jsonify({'error': f'Failed to estimate macros: {response.text}'}), response.status_code
    try: return jsonify(response.json()['choices'][0]['message']['content'])
    except Exception as e: app.logger.error(f"Parse OpenAI estimate_macros: {e} - Resp: {response.text}"); return jsonify({'error': 'Error parsing OpenAI response'}), 500

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files: return jsonify({'error': 'No image uploaded'}), 400
    image_file = request.files['image']; base64_image = b64encode(image_file.read()).decode('utf-8')
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = { "model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": [ {"type": "text", "text": "Estimate macros for this meal image. Try to estimate the mass of each piece of food and then multiply the weight with the caloric density of each food. Also try to estimate the macros; fat, carbs, and protein in grams. Try to figure out what the dish is and name it as well. The final output should only write out the name and the full nutrients for the whole meal. Remove all other unnecessary information, just output the name of the food and the whole meal's nutrients without any extra words. Use the format: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}} ]}], "max_tokens": 300 }
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200: app.logger.error(f"OpenAI analyze_image: {response.status_code} - {response.text}"); return jsonify({'error': f'Failed to analyze image: {response.text}'}), response.status_code
    try: return jsonify(response.json()['choices'][0]['message']['content'])
    except Exception as e: app.logger.error(f"Parse OpenAI analyze_image: {e} - Resp: {response.text}"); return jsonify({'error': 'Error parsing OpenAI image analysis response'}), 500

@app.route('/edit_macros_with_command', methods=['POST'])
def edit_macros_with_command():
    data = request.json
    # Add 'original_meal_name' to required fields
    required_fields = ['original_meal_name', 'new_meal_name', 'current_calories', 'current_fat', 'current_carbs', 'current_protein']
    if not all(field in data for field in required_fields):
        missing = [field for field in required_fields if field not in data]
        app.logger.error(f"edit_macros_with_command: Missing fields: {', '.join(missing)}")
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    original_meal_name = data['original_meal_name'] # Get original meal name
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
    except ValueError:
        app.logger.error("edit_macros_with_command: Invalid current macro values provided.")
        return jsonify({'error': 'Invalid current macro values provided. Must be numbers.'}), 400

    # Update the prompt to include original_meal_name and guide the AI
    prompt_content = f"""The user is editing a meal entry.
The original meal name was: '{original_meal_name}'.
The new meal name, which might include a command for you to process or indicate a change in the nature of the dish, is: '{new_meal_name}'.
The current macros for this meal (based on the '{original_meal_name}' before applying any command from the new meal name) are:
Calories: {current_calories} kcal
Fat: {current_fat} g
Carbs: {current_carbs} g
Protein: {current_protein} g

Your task is to:
1. Compare the 'original meal name' with the 'new meal name' (if relevant, if it's wholly different you can probably just ignore the old name).
2. Analyze the 'new meal name' for any commands (e.g., "x2", "double it", "half portion", "add 10g protein", "remove 5g fat", "set to 200g total weight", "plus one egg") OR for changes in the fundamental nature of the dish (e.g., "cheeseburger" to "cheeseburger (plant-based)").
3. If a command or a significant change in dish nature is found, update the provided 'current macros' accordingly.
   - For scaling commands (e.g., "x2", "200g" if original implied 100g), scale all macros proportionally based on the 'current macros'.
   - For additive commands (e.g., "add 10g protein", "plus one egg"), estimate the macros of the added item and add them to the 'current macros'.
   - If the dish nature changes (e.g., "cheeseburger" to "cheeseburger (plant-based)"), adjust the 'current macros' to reflect typical values for the new dish type. You can use the 'current macros' (from the original dish) as a rough starting point if the change is subtle, but if the change is drastic (like meat to plant-based), your estimation should primarily be based on the 'new meal name'.
4. The [Dish Name] in your output should reflect the 'new_meal_name', possibly cleaned up or expanded if applicable, you can be creative and fun, just keep it somewhat practical (e.g., "Chicken Breast 100g x2" could become "Chicken Breast 200g", or "cheeseburger (plant-based)" might be kept as is or slightly rephrased if appropriate).
5. If no clear command or significant dish change is found in 'new meal name' and it's very similar to 'original meal name', you can assume no major macro change or only a minor clarification in the name. Return the current macros and the new name.
6. You can add small comments at the end of the dish name if you want to or feel it's expected of you (like in parentheses).

Output ONLY the final name and the full updated nutrients for the whole meal.
Use this exact format: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'.

Example 1 (Scaling):
original_meal_name: "Chicken Breast 100g"
new_meal_name: "Chicken Breast 100g x2"
current_macros (for 100g): Cals: 165, Fat: 3.6g, Carbs: 0g, Protein: 31g
Output: 'Name: Chicken Breast 200g, Cals: 330, Fat: 7.2g, Carbs: 0g, Protein: 62g'

Example 2 (Additive):
original_meal_name: "Oats 50g"
new_meal_name: "Oats 50g with extra 10g almonds"
current_macros for "Oats 50g": Cals: 190, Fat: 3.5g, Carbs: 32g, Protein: 6.5g
Output: 'Name: Oats 50g with 10g almonds, Cals: 248, Fat: 8.6g, Carbs: 34.1g, Protein: 8.6g' (approx. for 10g almonds added)

Example 3 (Dish Nature Change):
original_meal_name: "Cheeseburger"
new_meal_name: "Cheeseburger (plant-based)"
current_macros for "Cheeseburger": Cals: 350, Fat: 18g, Carbs: 30g, Protein: 20g
Output: 'Name: Cheeseburger (plant-based), Cals: 300, Fat: 12g, Carbs: 35g, Protein: 15g' (Illustrative - AI would estimate based on typical plant-based burger macros, possibly different from original beef burger macros)

Example 4 (No significant change):
original_meal_name: "My Salad"
new_meal_name: "My Delicious Salad"
current_macros for "My Salad": Cals: 250, Fat: 10g, Carbs: 15g, Protein: 20g
Output: 'Name: My Delicious Salad, Cals: 250, Fat: 10g, Carbs: 15g, Protein: 20g'
"""

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = {
        "model": "gpt-4.1-mini-2025-04-14",
        "messages": [{"role": "user", "content": prompt_content}],
        "max_tokens": 200
    }
    
    app.logger.info(f"Sending to OpenAI for AI Edit: Original: '{original_meal_name}', New: '{new_meal_name}' with current macros C:{current_calories} F:{current_fat} Cb:{current_carbs} P:{current_protein}")

    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)

    if response.status_code != 200:
        app.logger.error(f"OpenAI edit_macros_with_command API error: {response.status_code} - {response.text}")
        return jsonify({'error': f'Failed to edit macros with command: {response.text}'}), response.status_code
    
    try:
        ai_response_content = response.json()['choices'][0]['message']['content']
        app.logger.info(f"OpenAI AI Edit response: {ai_response_content}")
        return jsonify(ai_response_content)
    except Exception as e:
        app.logger.error(f"Error parsing OpenAI response for edit_macros_with_command: {e} - Response: {response.text}")
        return jsonify({'error': 'Error parsing OpenAI response for command edit'}), 500

@app.route('/health', methods=['GET'])
def health_check(): return jsonify({'status': 'live'}), 200

# --- Main Execution & DB Setup (for LOCAL TESTING ONLY) ---
if __name__ == '__main__':
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

    if IS_LOCAL_TESTING:
        app.logger.info(f"Starting Flask development server on host 0.0.0.0, port 5000. Debug: {app.debug}")
        app.run(host='0.0.0.0', port=5000)
    else:
        # Gunicorn imports 'app' and runs it directly.
        app.logger.info("Application configured for production. Gunicorn or another WSGI server should be used to run 'app'.")
# --- END OF COMPLETE app.py ---