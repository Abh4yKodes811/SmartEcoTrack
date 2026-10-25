from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from pathlib import Path
from functools import wraps

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ecotrack.db"
app = Flask(__name__, static_folder="static")
app.secret_key = "change-this-secret-key-before-deployment"

def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection

def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS energy_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                record_date TEXT NOT NULL,
                period TEXT NOT NULL CHECK(period IN ('Daily', 'Monthly')),
                consumed_kwh REAL NOT NULL CHECK(consumed_kwh > 0),
                solar_kwh REAL NOT NULL DEFAULT 0 CHECK(solar_kwh >= 0),
                carbon_kg REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Please log in first."}), 401
        return fn(*args, **kwargs)
    return wrapper

@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")

@app.get("/<path:filename>")
def static_files(filename):
    allowed = {"index.html", "style.css", "script.js"}
    if filename in allowed:
        return send_from_directory(BASE_DIR, filename)
    return jsonify({"error": "Not found"}), 404

@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not email or "@" not in email:
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must contain at least 6 characters."}), 400
    try:
        with get_db() as db:
            cursor = db.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, generate_password_hash(password))
            )
            user_id = cursor.lastrowid
        session["user_id"] = user_id
        session["email"] = email
        return jsonify({"message": "Account created.", "email": email})
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists. Please log in."}), 409

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Incorrect email or password."}), 401
    session["user_id"] = user["id"]
    session["email"] = user["email"]
    return jsonify({"message": "Logged in.", "email": user["email"]})

@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Logged out."})

@app.get("/api/me")
def me():
    if "user_id" not in session:
        return jsonify({"loggedIn": False})
    return jsonify({"loggedIn": True, "email": session.get("email")})

@app.get("/api/records")
@login_required
def get_records():
    with get_db() as db:
        rows = db.execute(
            """SELECT id, record_date AS date, period,
                      consumed_kwh AS consumedKwh, solar_kwh AS solarKwh,
                      carbon_kg AS carbonKg
               FROM energy_records WHERE user_id = ?
               ORDER BY record_date DESC, id DESC""",
            (session["user_id"],)
        ).fetchall()
    return jsonify([dict(row) for row in rows])

@app.post("/api/records")
@login_required
def create_record():
    data = request.get_json(silent=True) or {}
    try:
        record_date = str(data["date"])
        period = str(data["period"])
        consumed = float(data["consumedKwh"])
        solar = float(data.get("solarKwh", 0))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Please enter a valid date, period and energy values."}), 400
    if period not in ("Daily", "Monthly"):
        return jsonify({"error": "Period must be Daily or Monthly."}), 400
    if consumed <= 0 or solar < 0 or solar > consumed:
        return jsonify({"error": "Consumed energy must be positive and solar energy must be between zero and consumed energy."}), 400
    carbon = round(max(consumed - solar, 0) * 0.82, 2)
    with get_db() as db:
        cursor = db.execute(
            """INSERT INTO energy_records
               (user_id, record_date, period, consumed_kwh, solar_kwh, carbon_kg)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session["user_id"], record_date, period, consumed, solar, carbon)
        )
        record_id = cursor.lastrowid
    return jsonify({"id": record_id, "date": record_date, "period": period,
                    "consumedKwh": consumed, "solarKwh": solar, "carbonKg": carbon}), 201

@app.delete("/api/records/<int:record_id>")
@login_required
def delete_record(record_id):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM energy_records WHERE id = ? AND user_id = ?",
            (record_id, session["user_id"])
        )
    if cursor.rowcount == 0:
        return jsonify({"error": "Record not found."}), 404
    return jsonify({"message": "Record deleted."})

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
