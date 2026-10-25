SMART ECOTRACK — FLASK + SQLITE VERSION
=======================================

This version does not use Firebase, cloud accounts, API keys or IDs.
It uses Python, Flask and a local SQLite file named ecotrack.db.

FILES
-----
app.py          Flask backend and API
index.html      Single-page login/dashboard interface
style.css       Design
script.js       Frontend behaviour
ecotrack.db     Created automatically when the app starts

REQUIREMENTS
------------
1. Install Python 3.
2. Open this folder in VS Code.
3. Open a terminal in this folder.
4. Run:
       python -m pip install flask
5. Start the app:
       python app.py
6. Open the local address shown in the terminal, normally:
       http://127.0.0.1:5000

HOW IT WORKS
------------
- Create an account using an email and password.
- Passwords are stored as hashes, not plain text.
- Energy records are stored in SQLite.
- Each record is linked to the signed-in user's database ID.
- Users can view and delete their own records.
- Carbon estimate = (consumed kWh - solar kWh) * 0.82.

IMPORTANT
---------
This is a student project starter, not a production-ready authentication system.
Before deploying publicly, change app.secret_key to a long random secret, turn off
debug mode, use HTTPS, and add protections such as CSRF controls and rate limiting.
The default secret key is only for local development.

The database file is created automatically in this project folder after you run app.py.
Back up ecotrack.db if you want to preserve your records.
