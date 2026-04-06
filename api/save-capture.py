import base64
import json
import re
from http.server import BaseHTTPRequestHandler
from typing import Optional


WEBHOOK_URL = "https://triggers.app.pinkfish.ai/ext/webhook/NeEkkkzAzF5JJpI1kqNJ71dAqvnxku531If8slLs/triggers/d6gem2d11m2s73jna0l0"


def decode_data_url(image_data: str) -> bytes:
    if not image_data:
        raise ValueError("Missing imageData.")

    if "," in image_data:
        _, image_data = image_data.split(",", 1)

    return base64.b64decode(image_data)


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]', "_", value.strip())
    cleaned = cleaned.replace(" ", "_")
    if not cleaned:
        return "kiosk_capture"
    return cleaned


def build_filename(email: Optional[str] = None) -> str:
    if email:
        # Return the email as-is without modification
        return email.lower()
    else:
        return "kiosk_capture"


def send_to_webhook(image_data_url: str, email: str, filename: str) -> dict:
    """Send image data to the webhook endpoint."""
    import requests

    payload = {
        "imageUrl": image_data_url,
        "email": email,
        "fileName": filename
    }

    response = requests.post(WEBHOOK_URL, json=payload, timeout=30)
    response.raise_for_status()
    return response.json() if response.text else {}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw_body)

            image_data_url = payload.get("imageData", "")
            if not image_data_url:
                raise ValueError("Missing imageData")

            email = payload.get("email", "").strip()
            if not email:
                raise ValueError("Missing email")

            # Build filename from email
            filename = build_filename(email)

            # Send to webhook
            webhook_response = send_to_webhook(image_data_url, email, filename)

            # Return success response
            response = {
                "status": "success",
                "email": email,
                "fileName": filename,
                "webhookResponse": webhook_response
            }

            body = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        except Exception as error:
            body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
