"""Start Vitals in the Void:  python run.py   then open http://localhost:8000"""
import os
import webbrowser

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    if os.environ.get("NO_BROWSER") != "1":
        webbrowser.open(f"http://localhost:{port}")
    uvicorn.run("backend.app:app", host="127.0.0.1", port=port, reload=False)
