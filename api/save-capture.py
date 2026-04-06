import base64
import json
import os
import re
from http.server import BaseHTTPRequestHandler
from typing import Dict, Optional, Tuple


DEFAULT_TRIGGER_API_URL = "https://triggers.app.pinkfish.ai/ext/triggers/d79rk05214qs73kh5hc0"
DEFAULT_WEBHOOK_URL = "https://triggers.app.pinkfish.ai/ext/webhook/NeEkkkzAzF5JJpI1kqNJ71dAqvnxku531If8slLs/triggers/d79rk05214qs73kh5hc0"
DEFAULT_API_KEY_HEADER = "x-api-key"


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
        return email.lower()
    else:
        return "kiosk_capture"


def resolve_upstream() -> Tuple[str, Dict[str, str]]:
    trigger_api_url = os.getenv("PINKFISH_TRIGGER_API_URL", DEFAULT_TRIGGER_API_URL).strip()
    webhook_url = os.getenv("PINKFISH_WEBHOOK_URL", DEFAULT_WEBHOOK_URL).strip()
    api_key = os.getenv("PINKFISH_API_KEY", "").strip()
    api_key_header = os.getenv("PINKFISH_API_KEY_HEADER", DEFAULT_API_KEY_HEADER).strip()
    headers = {"Content-Type": "application/json"}

    if api_key:
        headers[api_key_header or DEFAULT_API_KEY_HEADER] = api_key
        return trigger_api_url, headers

    return webhook_url, headers


def parse_response_payload(response) -> dict:
    content_type = (response.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        return response.json()
    text = response.text.strip()
    return {"raw": text} if text else {}


def send_to_upstream(image_data_url: str, email: str, filename: str) -> dict:
    import requests

    payload = {
        "imageUrl": image_data_url,
        "email": email,
        "fileName": filename
    }
    upstream_url, headers = resolve_upstream()

    response = requests.post(upstream_url, json=payload, headers=headers, timeout=45)
    response.raise_for_status()
    parsed = parse_response_payload(response)
    parsed["upstreamUrl"] = upstream_url
    return parsed


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

            # Send to Pinkfish trigger/webhook
            upstream_response = send_to_upstream(image_data_url, email, filename)

            # Return success response
            response = {
                "status": "success",
                "email": email,
                "fileName": filename,
                "upstreamResponse": upstream_response
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization")
        self.end_headers()
