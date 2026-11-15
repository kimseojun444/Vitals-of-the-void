"""Where AI plugs in later (nothing here calls an AI model yet).

Each function below is already called by the app and currently returns None, so the app falls back to its
rule-based logic. To add AI, implement the function (for example with the Anthropic Python SDK, `pip install anthropic`,
or a local PyTorch/ONNX model) and return the documented shape. No other file needs to change.

Suggested first integrations:
  * classify_rash_image  – a dermatology image model (or a vision-capable LLM) giving a second opinion on the photo.
  * read_device_photo    – read numbers from photos of monitors, glucometers, tonometers.
  * explain_status       – plain-language explanation of an assessment report for the astronaut.
  * extract_supplies     – turn any manifest photo/document into supply rows.
Keep medical outputs as decision support, show sources, and keep the journal out of every AI call.
"""


def classify_rash_image(image_bytes: bytes, answers: dict):
    """Return [{"id": <rash.DX key>, "prob": 0..1}] or None."""
    return None


def read_device_photo(image_bytes: bytes, variable_ids: list):
    """Return [{"id": variable id, "value": float}] or None."""
    return None


def explain_status(report: dict):
    """Return a short plain-language explanation string or None."""
    return None


def extract_supplies(filename: str, data: bytes):
    """Return a list of supply dicts (see supplies.Supplies.parse_upload) or None."""
    return None


def is_enabled():
    return False
