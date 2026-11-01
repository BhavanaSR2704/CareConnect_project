import os
import json
import sqlite3
from pathlib import Path
from functools import wraps
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash,
    abort,
    jsonify,
    send_from_directory,
    make_response
)
from werkzeug.security import generate_password_hash, check_password_hash

try:
    import requests
except ImportError:
    requests = None

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "tiptur-health-hub-secure-key-2026")
DB_PATH = BASE_DIR / "database.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as db:
        # Existing users table preserved
        db.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "username TEXT UNIQUE NOT NULL, "
            "password_hash TEXT NOT NULL, "
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        # Structured hospitals table
        db.execute(
            "CREATE TABLE IF NOT EXISTS hospitals ("
            "id TEXT PRIMARY KEY, "
            "region TEXT NOT NULL, "
            "name TEXT NOT NULL, "
            "subtitle TEXT, "
            "address TEXT NOT NULL, "
            "lat REAL NOT NULL, "
            "lng REAL NOT NULL, "
            "phones TEXT, "
            "emergency_phone TEXT, "
            "timings TEXT, "
            "page TEXT, "
            "services TEXT, "
            "verified INTEGER DEFAULT 1, "
            "verification_note TEXT, "
            "icu_available INTEGER DEFAULT 0, "
            "bed_count TEXT"
            ")"
        )
        # Seed hospital data from static/data/hospitals.json if empty
        count = db.execute("SELECT COUNT(*) as c FROM hospitals").fetchone()["c"]
        if count == 0:
            json_file = BASE_DIR / "static" / "data" / "hospitals.json"
            if json_file.is_file():
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        for region, h_list in data.items():
                            for h in h_list:
                                db.execute(
                                    "INSERT OR REPLACE INTO hospitals "
                                    "(id, region, name, subtitle, address, lat, lng, phones, emergency_phone, timings, page, services, verified, verification_note, icu_available, bed_count) "
                                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                    (
                                        h.get("id"),
                                        region,
                                        h.get("name"),
                                        h.get("subtitle", ""),
                                        h.get("address", ""),
                                        h.get("lat", 0.0),
                                        h.get("lng", 0.0),
                                        json.dumps(h.get("phones", [])),
                                        h.get("emergency_phone", ""),
                                        h.get("timings", ""),
                                        h.get("page", ""),
                                        json.dumps(h.get("services", [])),
                                        1 if h.get("verified", True) else 0,
                                        h.get("verification_note", ""),
                                        1 if h.get("icu_available", False) else 0,
                                        h.get("bed_count", "")
                                    )
                                )
                except Exception as e:
                    print("Could not seed hospitals table:", e)

def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to continue.")
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("page", page="home.html"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        with get_db() as db:
            user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("page", page="home.html"))
        flash("Incorrect username or password. Please try again.")
    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        if len(username) < 3:
            flash("Username must contain at least 3 characters.")
        elif len(password) < 8:
            flash("Password must contain at least 8 characters.")
        elif password != confirm:
            flash("Passwords do not match.")
        else:
            try:
                with get_db() as db:
                    db.execute(
                        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                        (username, generate_password_hash(password))
                    )
                flash("Registration successful. Please log in.")
                return redirect(url_for("login"))
            except sqlite3.IntegrityError:
                flash("That username is already registered. Choose another.")
    return render_template("register.html")

@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.")
    return redirect(url_for("login"))

# API Route: Structured Hospitals Data
@app.route("/api/hospitals")
def get_hospitals_api():
    region = request.args.get("region")
    with get_db() as db:
        if region:
            rows = db.execute("SELECT * FROM hospitals WHERE region = ?", (region,)).fetchall()
        else:
            rows = db.execute("SELECT * FROM hospitals").fetchall()

        results = []
        for r in rows:
            results.append({
                "id": r["id"],
                "region": r["region"],
                "name": r["name"],
                "subtitle": r["subtitle"],
                "address": r["address"],
                "lat": r["lat"],
                "lng": r["lng"],
                "phones": json.loads(r["phones"]) if r["phones"] else [],
                "emergency_phone": r["emergency_phone"],
                "timings": r["timings"],
                "page": r["page"],
                "services": json.loads(r["services"]) if r["services"] else [],
                "verified": bool(r["verified"]),
                "verification_note": r["verification_note"],
                "icu_available": bool(r["icu_available"]),
                "bed_count": r["bed_count"]
            })
    return jsonify(results)

# API Route: Conversational AI Voice Assistant powered by Gemini
@app.route("/api/voice-assistant", methods=["POST"])
def voice_assistant_api():
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    language = data.get("language") or "en-IN"
    history = data.get("history") or []
    location = data.get("location")
    region = data.get("region") or "tiptur"

    if not query:
        return jsonify({"reply": "Please ask a question regarding healthcare or hospitals in Tiptur and Gubbi."})

    # Retrieve all hospital data to ground Gemini accurately
    with get_db() as db:
        rows = db.execute("SELECT * FROM hospitals").fetchall()
        hospitals_summary = []
        for r in rows:
            hospitals_summary.append({
                "id": r["id"],
                "region": r["region"],
                "name": r["name"],
                "address": r["address"],
                "emergency_phone": r["emergency_phone"],
                "phones": json.loads(r["phones"]) if r["phones"] else [],
                "services": json.loads(r["services"]) if r["services"] else [],
                "timings": r["timings"],
                "icu": bool(r["icu_available"]),
                "lat": r["lat"],
                "lng": r["lng"]
            })

    # System instruction with strict anti-hallucination rules
    system_instruction = (
        "You are the official conversational voice assistant for the Tiptur Health Care Hub in Karnataka, India. "
        "Your role is to guide users to appropriate hospitals and clinics in Tiptur (and Gubbi for hackathon demos). "
        "Strict rules:\n"
        "1. Never invent or hallucinate hospital names, phone numbers, or emergency facilities. Rely ONLY on the provided directory.\n"
        "2. If the user asks for emergency care or severe distress, clearly mention Government General Hospital (Near Bus Stand, 108/112) or Shekhar Hospital, and advise calling 112/108.\n"
        "3. For eye care, recommend Sunanda Eye Hospital (Vidya Nagar) or Jyothi Nethralaya.\n"
        "4. For dental care, recommend Tiptur Dental Clinic or Hemanth Dental Clinic.\n"
        "5. For Gubbi inquiries, only mention Gubbi Taluk General Hospital, PHC Gubbi, or Sri Siddhartha Rural Clinic.\n"
        "6. Answer conversationally in short, spoken sentences suitable for voice text-to-speech. Keep answers under 60 words.\n"
        f"7. If the language requested is Kannada ({language} == 'kn-IN') or the user spoke in Kannada, reply fluently and politely in natural Kannada.\n"
        f"8. Current user location context: {json.dumps(location) if location else 'GPS not provided'}. Active region: {region}.\n"
        f"Verified Healthcare Facilities in Database: {json.dumps(hospitals_summary)}"
    )

    api_key = os.environ.get("GEMINI_API_KEY")
    reply_text = None
    matched_hospital = None

    # Find closest match if query mentions specific hospital
    q_lower = query.lower()
    for h in hospitals_summary:
        if (h["region"] == region or not region) and (h["id"] in q_lower or any(word in q_lower for word in h["name"].lower().split() if len(word) > 4)):
            matched_hospital = h
            break

    if api_key and requests:
        # Call Gemini model (gemini-3.8-flash first, fallback to gemini-3.1-flash-lite)
        contents = []
        for msg in history[-4:]:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
        contents.append({"role": "user", "parts": [{"text": query}]})

        models_to_try = ["gemini-3.8-flash", "gemini-3.1-flash-lite"]
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
        }

        for model_name in models_to_try:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                payload = {
                    "contents": contents,
                    "systemInstruction": {"parts": [{"text": system_instruction}]}
                }
                resp = requests.post(url, headers=headers, json=payload, timeout=9)
                if resp.status_code == 200:
                    res_json = resp.json()
                    candidates = res_json.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts:
                            reply_text = parts[0].get("text", "").strip()
                            break
            except Exception as e:
                print(f"Error calling {model_name}:", e)

    # Fallback response if Gemini API key is missing or network failed
    if not reply_text:
        is_kn = language == "kn-IN"
        if "nearest" in q_lower or "ಹತ್ತಿರ" in q_lower:
            reply_text = "ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಯನ್ನು ಪತ್ತೆಹಚ್ಚಲು ನಿಮ್ಮ ಸಾಧನದ ಜಿಪಿಎಸ್ ಆನ್ ಮಾಡಿ." if is_kn else "Please activate GPS on your device to calculate the exact distance to the nearest hospital."
        elif "eye" in q_lower or "ಕಣ್ಣು" in q_lower:
            reply_text = "ತಿಪಟೂರಿನಲ್ಲಿ ಸುನಂದಾ ಐ ಹಾಸ್ಪಿಟಲ್ ಮತ್ತು ಜ್ಯೋತಿ ನೇತ್ರಾಲಯ ಕಣ್ಣಿನ ಮುಖ್ಯ ಆಸ್ಪತ್ರೆಗಳು." if is_kn else "For eye care in Tiptur, Sunanda Eye Hospital and Jyothi Nethralaya are specialized centers."
        elif "govt" in q_lower or "ಸರ್ಕಾರಿ" in q_lower:
            reply_text = "ತಿಪಟೂರು ಸರ್ಕಾರಿ ಸಾರ್ವಜನಿಕ ಆಸ್ಪತ್ರೆ ಬಸ್ ನಿಲ್ದಾಣದ ಬಳಿ ಇದೆ. 24x7 ತುರ್ತು ಸೇವೆ ಲಭ್ಯವಿದೆ." if is_kn else "Government General Hospital is located near Tiptur Bus Stand with 24x7 emergency and medical facilities."
        else:
            reply_text = "ತಿಪಟೂರು ಹೆಲ್ತ್ ಕೇರ್ ಹಬ್ ಗೆ ಸುಸ್ವಾಗತ. ಆಸ್ಪತ್ರೆಗಳು, ತುರ್ತು ಸಂಖ್ಯೆಗಳು ಮತ್ತು ಜಿಪಿಎಸ್ ವಿವರಗಳನ್ನು ನಾನು ಒದಗಿಸಬಲ್ಲೆ." if is_kn else "Welcome to Tiptur Health Care Hub. I can assist you in finding nearby hospitals, emergency contacts, and specialities."

    # Return action and hospital match
    action = "speak"
    if "nearest" in q_lower or "location" in q_lower or "gps" in q_lower or "ಹತ್ತಿರ" in q_lower:
        action = "request_gps"

    return jsonify({
        "reply": reply_text,
        "action": action,
        "matched_hospital": matched_hospital
    })

# Service Worker & Manifest static route handlers
@app.route("/sw.js")
def service_worker():
    response = make_response(send_from_directory(BASE_DIR / "static", "sw.js"))
    response.headers["Content-Type"] = "application/javascript"
    response.headers["Service-Worker-Allowed"] = "/"
    return response

@app.route("/manifest.json")
def manifest():
    response = make_response(send_from_directory(BASE_DIR / "static", "manifest.json"))
    response.headers["Content-Type"] = "application/manifest+json"
    return response

# Download full updated project ZIP
@app.route("/download-project")
def download_project():
    zip_path = BASE_DIR / "public" / "Tiptur_Health_Care_Hub_Complete.zip"
    if zip_path.is_file():
        return send_from_directory(
            BASE_DIR / "public",
            "Tiptur_Health_Care_Hub_Complete.zip",
            as_attachment=True
        )
    return abort(404)

# Dynamic page router with login requirement
@app.route("/<path:page>")
@login_required
def page(page):
    if page in {"1.html", "login.html"}:
        return redirect(url_for("login"))
    if page == "2.html":
        page = "home.html"
    elif page == "3.html":
        page = "dashboard.html"

    template_path = BASE_DIR / "templates" / page
    if not template_path.is_file() or not page.endswith(".html"):
        abort(404)
    return render_template(page)

# Initialize database on startup
init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
