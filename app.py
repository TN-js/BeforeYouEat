# --- START OF app.py (ULTRA-SIMPLIFIED PATHING FOR SQLITE) ---
from flask import Flask, request, jsonify
import requests
import os
from base64 import b64encode
from flask_cors import CORS
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from functools import wraps
from datetime import datetime

from google.oauth2 import id_token as google_id_token_verify
from google.auth.transport import requests as google_requests

load_dotenv()
app = Flask(__name__)

IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production'
IS_LOCAL_TESTING = not IS_PRODUCTION
app.logger.info(f"Application starting. IS_PRODUCTION: {IS_PRODUCTION}, IS_LOCAL_TESTING: {IS_LOCAL_TESTING}")

if IS_LOCAL_TESTING:
    app.logger.info("Applying DEVELOPMENT CORS settings.")
    CORS(app, resources={r"/*": {"origins": ["https://tn-js.github.io", "http://127.0.0.1:5000", "http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:8000", "http://127.0.0.1:8000", "null", "file://"]}})
else:
    app.logger.info("Applying PRODUCTION CORS settings.")
    frontend_url = os.getenv('FRONTEND_URL', "https://tn-js.github.io")
    CORS(app, resources={r"/analyze_image": {"origins": frontend_url}, r"/estimate_macros": {"origins": frontend_url}, r"/health": {"origins": frontend_url}, r"/api/*": {"origins": frontend_url}})

# --- Database Configuration (USING ABSOLUTE PATH FROM .ENV FOR LOCAL) ---
if IS_LOCAL_TESTING:
    app.logger.info("Attempting to use DATABASE_URL directly from .env for LOCAL SQLite.")
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') 
    # This should now be 'sqlite:///C:/tilpro/projects/BeforeYouEat/instance/app.db'
else: # Production
    app.logger.info("Using PRODUCTION PostgreSQL database configuration from DATABASE_URL.")
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')

if not app.config.get('SQLALCHEMY_DATABASE_URI'):
    raise ValueError("DATABASE_URL is not set in .env or environment. This is critical.")
app.logger.info(f"Final SQLALCHEMY_DATABASE_URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app) # Initialize SQLAlchemy AFTER URI is set

app.debug = os.getenv('FLASK_DEBUG') == '1' if IS_LOCAL_TESTING else False
app.logger.info(f"Flask debug mode: {app.debug}")

openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key: raise ValueError("OPENAI_API_KEY not found.")
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
if not GOOGLE_CLIENT_ID: raise ValueError("GOOGLE_CLIENT_ID not found.")

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
# ... (UserSetting, MealEntry, ExerciseEntry classes - PASTE THEM HERE UNCHANGED from your last full version) ...
class UserSetting(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    daily_calories = db.Column(db.Integer, default=2000)
    daily_fat = db.Column(db.Integer, default=67); daily_carbs = db.Column(db.Integer, default=275)
    daily_protein = db.Column(db.Integer, default=75)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MealEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True) # serverId
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    entry_date = db.Column(db.Date, nullable=False); meal_type = db.Column(db.String(50), nullable=False)
    client_meal_id = db.Column(db.BigInteger, nullable=False)
    dish_name = db.Column(db.String(255)); calories = db.Column(db.Integer)
    fat = db.Column(db.Numeric(10, 2)); carbs = db.Column(db.Numeric(10, 2)); protein = db.Column(db.Numeric(10, 2))
    image_base64 = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'entry_date', 'client_meal_id', name='_user_date_client_id_uc'),)

class ExerciseEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    entry_date = db.Column(db.Date, nullable=False); calories_burned = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'entry_date', name='_user_date_exercise_uc'),)


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
            if not current_user:
                current_user = User(google_user_id=google_user_id, email=idinfo.get('email'), name=idinfo.get('name'))
                db.session.add(current_user)
                default_settings = UserSetting(user=current_user); db.session.add(default_settings)
                db.session.commit()
            kwargs['current_user'] = current_user
        except ValueError as e: app.logger.error(f"Token verification error: {e}"); return jsonify({'message': 'Token invalid/expired'}), 401
        except Exception as e: app.logger.error(f"Auth error: {e}", exc_info=True); return jsonify({'message': 'Auth error'}), 500
        return f(*args, **kwargs)
    return decorated

# --- API Endpoints (Keep as is) ---
# @app.route('/api/data', ...)
# @app.route('/api/sync', ...)
# @app.route('/estimate_macros', ...)
# @app.route('/analyze_image', ...)
# @app.route('/health', ...)
@app.route('/api/data', methods=['GET'])
@token_required
def get_user_data(current_user):
    date_str = request.args.get('date')
    if not date_str: return jsonify({'error': 'Date parameter required'}), 400
    try: entry_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError: return jsonify({'error': 'Invalid date format YYYY-MM-DD'}), 400
    user_settings = UserSetting.query.filter_by(user_id=current_user.id).first()
    if not user_settings: user_settings = UserSetting(user_id=current_user.id); db.session.add(user_settings); db.session.commit()
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
    data = request.get_json();
    if not data: return jsonify({'error': 'No sync data provided'}), 400
    app.logger.info(f"Sync user {current_user.id}: {list(data.keys())}")
    s_ids, d_ids, m_s_ids = [], [], {}

    for m_data in data.get('mealsToUpdate', []):
        cid, ed_s, mt = m_data.get('id'), m_data.get('date'), m_data.get('mealType')
        if not all([cid, ed_s, mt]): app.logger.warn(f"Sync: Skip meal update (missing fields)"); continue
        try: ed = datetime.strptime(ed_s, '%Y-%m-%d').date()
        except ValueError: app.logger.warn(f"Sync: Skip meal update (invalid date)"); continue
        ex_m = MealEntry.query.filter_by(user_id=current_user.id, client_meal_id=cid, entry_date=ed).first()
        c_lm_s = m_data.get('lastModified'); c_lm = datetime.fromisoformat(c_lm_s.replace('Z','+00:00')) if c_lm_s else datetime.min.replace(tzinfo=None)
        s_lm = ex_m.updated_at.replace(tzinfo=None) if ex_m and ex_m.updated_at else datetime.min.replace(tzinfo=None)
        if not ex_m or c_lm >= s_lm:
            m_commit = ex_m if ex_m else MealEntry(user_id=current_user.id, client_meal_id=cid)
            if not ex_m: db.session.add(m_commit)
            m_commit.entry_date=ed; m_commit.meal_type=mt; m_commit.dish_name=m_data.get('dishName')
            m_commit.calories=m_data.get('calories'); m_commit.fat=m_data.get('fat'); m_commit.carbs=m_data.get('carbs')
            m_commit.protein=m_data.get('protein'); m_commit.image_base64=m_data.get('image')
            try: db.session.flush(); m_s_ids[cid] = m_commit.id
            except Exception as e: app.logger.error(f"Sync: Flush error meal cid {cid}: {e}")
            s_ids.append(cid)
        else:
            app.logger.info(f"Sync: Server meal cid {cid} newer.");
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
        if m_del: db.session.delete(m_del); app.logger.info(f"Sync: Del meal cid {cid}, sid {m_del.id}")
        else: app.logger.warn(f"Sync: Meal to del not found cid {cid}")
        if cid: d_ids.append(cid)

    for d_s, cals in data.get('exercisePerDate', {}).items():
        try:
            ed = datetime.strptime(d_s, '%Y-%m-%d').date()
            ex_db = ExerciseEntry.query.filter_by(user_id=current_user.id, entry_date=ed).first()
            if cals == 0 and ex_db: db.session.delete(ex_db)
            elif cals > 0:
                if not ex_db: ex_db = ExerciseEntry(user_id=current_user.id, entry_date=ed); db.session.add(ex_db)
                ex_db.calories_burned = cals
        except Exception as e: app.logger.error(f"Sync: Error exercise {d_s}: {e}")

    g_d = data.get('goals')
    if g_d:
        u_s = UserSetting.query.filter_by(user_id=current_user.id).first()
        if not u_s: u_s = UserSetting(user_id=current_user.id); db.session.add(u_s)
        u_s.daily_calories=g_d.get('calories',u_s.daily_calories);u_s.daily_fat=g_d.get('fat',u_s.daily_fat)
        u_s.daily_carbs=g_d.get('carbs',u_s.daily_carbs);u_s.daily_protein=g_d.get('protein',u_s.daily_protein)

    try: db.session.commit()
    except Exception as e: db.session.rollback(); app.logger.error(f"Sync: Commit error: {e}", exc_info=True); return jsonify({'error': 'Commit error'}), 500
    return jsonify({'message':'Sync processed.','syncedMealClientIds':s_ids,'deletedMealClientIds':d_ids,'mealServerIds':m_s_ids}),200

@app.route('/estimate_macros', methods=['POST'])
def estimate_macros():
    if 'meal_name' not in request.json: return jsonify({'error': 'No meal name provided'}), 400
    meal_name = request.json['meal_name']
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = { "model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": f"Please estimate the macros for the meal named '{meal_name}'. Output only: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."}], "max_tokens": 150 }
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200: return jsonify({'error': f'Failed to estimate macros: {response.text}'}), response.status_code
    try: return jsonify(response.json()['choices'][0]['message']['content'])
    except Exception as e: app.logger.error(f"Parse OpenAI estimate_macros: {e} - Resp: {response.text}"); return jsonify({'error': 'Error parsing OpenAI response'}), 500

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files: return jsonify({'error': 'No image uploaded'}), 400
    image_file = request.files['image']; base64_image = b64encode(image_file.read()).decode('utf-8')
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {openai_api_key}"}
    payload = { "model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": [ {"type": "text", "text": "Estimate macros for this meal image. Output only: 'Name: [Dish Name], Cals: a, Fat: b g, Carbs: c g, Protein: d g'."}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}} ]}], "max_tokens": 300 }
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
    if response.status_code != 200: app.logger.error(f"OpenAI analyze_image: {response.status_code} - {response.text}"); return jsonify({'error': f'Failed to analyze image: {response.text}'}), response.status_code
    try: return jsonify(response.json()['choices'][0]['message']['content'])
    except Exception as e: app.logger.error(f"Parse OpenAI analyze_image: {e} - Resp: {response.text}"); return jsonify({'error': 'Error parsing OpenAI image analysis response'}), 500

@app.route('/health', methods=['GET'])
def health_check(): return jsonify({'status': 'live'}), 200


# --- Main Execution & DB Setup (SIMPLIFIED AND MORE DIRECT FOR LOCAL) ---
if __name__ == '__main__':
    if IS_LOCAL_TESTING:
        # The DATABASE_URL from .env (e.g., 'sqlite:///C:/path/to/instance/app.db')
        # is ALREADY an absolute path for SQLite.
        # We just need to ensure the directory for this file exists.
        db_uri_config = app.config.get('SQLALCHEMY_DATABASE_URI')
        
        if db_uri_config and db_uri_config.startswith('sqlite:///'):
            # Extract the full file path from the URI
            # On Windows, remove leading '/' if URI is like 'sqlite:///C:/...'
            db_file_path_str = db_uri_config[len('sqlite:///'):]
            if os.name == 'nt' and db_file_path_str.startswith('/') and db_file_path_str[2] == ':':
                db_file_path_str = db_file_path_str[1:] # Remove leading / for C:/ paths

            db_file_path = os.path.abspath(db_file_path_str) # Ensure it's absolute
            
            # Get the directory containing the db file
            db_directory = os.path.dirname(db_file_path)
            
            if db_directory and not os.path.exists(db_directory):
                try:
                    os.makedirs(db_directory)
                    app.logger.info(f"Created database directory at: {db_directory}")
                except OSError as e:
                    app.logger.error(f"FATAL: Could not create database directory at {db_directory}: {e}", exc_info=True)
                    exit(1) 
            elif db_directory:
                 app.logger.info(f"Database directory already exists or not needed for: {db_directory}")
            else:
                app.logger.error(f"Could not determine database directory from DB URI: {db_uri_config}")
        else:
            app.logger.warn(f"Local testing but DB URI '{db_uri_config}' is not a recognized SQLite path for directory creation.")

    with app.app_context():
        try:
            db.create_all()
            app.logger.info("Database tables checked/created successfully.")
        except Exception as e:
            app.logger.error(f"ERROR: Could not create database tables: {e}", exc_info=True)
            exit(1) 

    if IS_LOCAL_TESTING:
        app.logger.info(f"Starting Flask development server on host 0.0.0.0, port 5000. Debug: {app.debug}")
        app.run(host='0.0.0.0', port=5000)
    else:
        app.logger.info("Application configured for production. Gunicorn or another WSGI server should be used.")
# --- END OF app.py ---