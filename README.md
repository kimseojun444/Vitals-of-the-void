# Vitals in the Void

Health monitoring and assessment software for astronauts. Built for NASA Space Apps Challenge 2026, "Create Health Monitoring Software for Astronauts on Space Missions".

## Run it

1. Install Python 3.10 or newer from python.org.
2. Open a terminal in this folder and install the requirements:
   ```
   pip install -r requirements.txt
   ```
3. Start the app:
   ```
   python run.py
   ```
   Your browser opens at http://localhost:8000. To stop the app, press Ctrl+C in the terminal.

To read supply lists from photos, also install the free Tesseract OCR program: https://github.com/tesseract-ocr/tesseract.

All data stays on this computer, in `data/vitals.db`. Delete that file to start fresh.

## How it is built

| Part | Language | Where |
|---|---|---|
| Health logic, database, API | **Python** | `backend/` |
| Screens | HTML/CSS/JavaScript in the browser | `frontend/` |
| Reference data from the team's spreadsheets | JSON + Python | `backend/reference_data.json`, `backend/reference.py` |

All the medical logic runs in Python: expected values, alerts, formulas, countermeasures, supplies, rash check and journal encryption. The browser only draws the screens. Python is where nearly all AI tooling lives (the Anthropic and OpenAI SDKs, PyTorch, scikit-learn), so AI can be added here directly.

### Files

- `backend/model.py`: personal adaptation trajectory, graded warnings and alerts, personalisation, routine and points.
- `backend/reference.py`: conditions, variables, formulas and sources. This includes the spacewalk (EVA) risk.
- `backend/countermeasures.py`: what to do for every warning or alert, plus the supplies each step needs.
- `backend/supplies.py`: Shelf → Category → Item inventory (all crew-named), run-out forecast vs. resupply lead time, "mark as ordered", datasheet import.
- `backend/rash.py`: rash check, using photo measurements and a symptom questionnaire to give a ranked list of likely rashes.
- `backend/journal.py`: private journal, encrypted with each astronaut's own password.
- `backend/plans.py`: personalised daily exercise (NASA SPRINT-based) and meal plan from the astronaut's current health status and food stock.
- `backend/ai/hooks.py`: **the places where AI plugs in later.** Nothing calls AI yet.
- `backend/app.py`: the web API. `frontend/`: the screens.

## Adding AI later

Fill in a function in `backend/ai/hooks.py`. Each one is already called by the app and falls back to the rule-based logic while it returns `None`:

- `classify_rash_image`: a second opinion on the rash photo.
- `read_device_photo`: reading numbers from photos of medical devices.
- `explain_status`: plain-language explanations of an assessment.
- `extract_supplies`: reading any supply manifest.

Keep the journal out of every AI call.

## Medical note

This is decision support for astronauts and flight surgeons. It does not diagnose. Sources are listed on the Reference screen.
