import base64
import io
import json
import os
import re
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import parse_qs, urlparse

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


def load_dotenv_file() -> None:
    env_file = Path(__file__).with_name(".env")
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


if load_dotenv:
    load_dotenv()
else:
    load_dotenv_file()

DEFAULT_SAVE_DIRECTORY = r"C:\Users\Aarons\OneDrive\SoFlo"
CARICATURE_DIRECTORY = r"C:\Users\Aarons\OneDrive\caricutures"
MODEL_ALIAS_NANO_BANANA = "gemini-2.0-flash-preview-image-generation"
MODEL_ALIAS_THIRTY_PRO_FLASH = "gemini-3.0-pro-flash"
DEFAULT_STYLE_PROMPT = (
    "Create a fun caricature of this person from the uploaded camera photo. "
    "Exaggerate facial features artistically (big smile, expressive eyes, playful style) "
    "while keeping the person clearly recognizable. Bright colors, clean background, "
    "high detail, portrait framing."
)
CARICATURE_JOBS: Dict[str, dict] = {}
JOB_LOCK = threading.Lock()


def resolve_model() -> str:
    requested = (os.getenv("GEMINI_IMAGE_MODEL") or "").strip().lower()
    aliases = {
        "nano-banana": MODEL_ALIAS_NANO_BANANA,
        "gemini-nano-banana": MODEL_ALIAS_NANO_BANANA,
        "gemini-2.0-flash-preview-image-generation": MODEL_ALIAS_NANO_BANANA,
        "3.0-pro-flash": MODEL_ALIAS_THIRTY_PRO_FLASH,
        "gemini-3.0-pro-flash": MODEL_ALIAS_THIRTY_PRO_FLASH,
        "gemini-3.0-pro-flash-preview": MODEL_ALIAS_THIRTY_PRO_FLASH,
    }
    return aliases.get(requested, requested or MODEL_ALIAS_THIRTY_PRO_FLASH)


def resolve_save_directory() -> Path:
    configured = os.getenv("CARICATURE_SAVE_DIR", DEFAULT_SAVE_DIRECTORY)
    save_dir = Path(configured).expanduser()
    save_dir.mkdir(parents=True, exist_ok=True)
    return save_dir


def resolve_caricature_directory() -> Path:
    configured = os.getenv("CARICATURE_OUTPUT_DIR", CARICATURE_DIRECTORY)
    caricature_dir = Path(configured).expanduser()
    caricature_dir.mkdir(parents=True, exist_ok=True)
    return caricature_dir


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
        base_name = sanitize_filename(email.lower())
        return f"{base_name}.jpg"
    else:
        base_name = "kiosk_capture"
        return f"{base_name}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"


def save_image_to_disk(image_bytes: bytes, email: Optional[str] = None) -> str:
    save_dir = resolve_save_directory()
    destination = save_dir / build_filename(email)
    with open(destination, "wb") as image_file:
        image_file.write(image_bytes)
    return str(destination)


def build_caricature_filename(email: str) -> str:
    base_name = sanitize_filename(email.lower())
    return f"{base_name}_caricature.jpg"


def save_image_from_bytes(image_bytes: bytes, destination: Path) -> None:
    if Image is not None:
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img.save(destination, format="JPEG", quality=95)
            return
        except Exception:
            pass
    destination.parent.mkdir(parents=True, exist_ok=True)
    with open(destination, "wb") as image_file:
        image_file.write(image_bytes)


def set_job_status(job_id: str, status: str, **updates: object) -> None:
    with JOB_LOCK:
        job = CARICATURE_JOBS.setdefault(job_id, {"status": status})
        job["status"] = status
        for key, value in updates.items():
            job[key] = value


def get_job_status(job_id: str) -> Optional[dict]:
    with JOB_LOCK:
        job = CARICATURE_JOBS.get(job_id)
        if not job:
            return None
        return dict(job)


def call_gemini_image_transform(image_bytes: bytes, prompt: str) -> Optional[bytes]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY environment variable.")

    model = resolve_model()
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        },
    }

    import requests

    response = requests.post(api_url, params={"key": api_key}, json=payload, timeout=120)
    response.raise_for_status()
    data = response.json()

    for candidate in data.get("candidates", []):
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    return None


def start_caricature_job(job_id: str, source_path: str, email: str) -> None:
    normalized_email = sanitize_filename((email or f"capture_{job_id}").lower())
    set_job_status(job_id, "queued", email=normalized_email, sourcePath=source_path)

    def worker():
        try:
            set_job_status(job_id, "processing")
            caricature_dir = resolve_caricature_directory()
            caricature_name = build_caricature_filename(email)
            caricature_path = caricature_dir / caricature_name

            # Poll for the caricature file to appear (external process generates it)
            import time
            max_wait_seconds = 120
            check_interval = 2
            elapsed = 0

            while elapsed < max_wait_seconds:
                if caricature_path.exists():
                    # Try to access the file to trigger OneDrive download if needed
                    try:
                        file_size = caricature_path.stat().st_size
                        # If file size is very small or 0, it might be a placeholder
                        # Try to read first few bytes to force download
                        with open(caricature_path, 'rb') as f:
                            f.read(1024)
                        # Check size again after accessing
                        actual_size = caricature_path.stat().st_size
                        if actual_size > 0:
                            set_job_status(job_id, "ready", path=str(caricature_path), image_path=caricature_name)
                            return
                    except Exception:
                        pass
                time.sleep(check_interval)
                elapsed += check_interval

            # Timeout - file never appeared
            set_job_status(
                job_id,
                "failed",
                error="Caricature image was not generated within the expected time.",
            )
        except Exception as error:
            set_job_status(job_id, "failed", error=str(error))

    thread = threading.Thread(target=worker, name=f"caricature-{job_id}", daemon=True)
    thread.start()


def encode_file_as_data_url(file_path: str) -> Optional[str]:
    path = Path(file_path)
    if not path.exists():
        return None

    # Access file to trigger OneDrive download if needed
    try:
        file_size = path.stat().st_size
        if file_size == 0:
            # Might be a OneDrive placeholder, try to access it
            import time
            with open(path, 'rb') as f:
                f.read(1024)
            time.sleep(0.5)
    except Exception:
        pass

    raw = path.read_bytes()
    data = base64.b64encode(raw).decode("ascii")
    suffix = path.suffix.lower()
    if suffix == ".png":
        mime = "image/png"
    else:
        mime = "image/jpeg"
    return f"data:{mime};base64,{data}"


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class CaptureHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/save-capture":
            send_json(self, 404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw_body)
            image_bytes = decode_data_url(payload.get("imageData", ""))
            email = payload.get("email")
            saved_path = save_image_to_disk(image_bytes, email)
            job_id = str(uuid.uuid4())
            start_caricature_job(job_id, saved_path, email or f"capture_{job_id}")
            send_json(
                self,
                200,
                {
                    "path": saved_path,
                    "jobId": job_id,
                    "status": "processing",
                    "email": sanitize_filename((email or f"capture_{job_id}").lower()),
                },
            )
        except Exception as error:
            send_json(self, 500, {"error": str(error)})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/caricature-result":
            send_json(self, 404, {"error": "Not found"})
            return

        query = parse_qs(parsed.query or "")
        job_id = (query.get("job_id") or [""])[0]
        email = (query.get("email") or [""])[0].strip()

        # If only email is provided, search directly in the caricature folder
        if email and not job_id:
            caricature_dir = resolve_caricature_directory()
            caricature_name = build_caricature_filename(email)
            caricature_path = caricature_dir / caricature_name

            if caricature_path.exists():
                # Try to access file to trigger OneDrive download
                try:
                    with open(caricature_path, 'rb') as f:
                        f.read(1024)
                    import time
                    time.sleep(0.5)
                except Exception:
                    pass

                image_data = encode_file_as_data_url(str(caricature_path))
                if image_data:
                    send_json(
                        self,
                        200,
                        {
                            "status": "ready",
                            "path": str(caricature_path),
                            "imageData": image_data,
                        },
                    )
                    return

            # Try to find in jobs as fallback
            with JOB_LOCK:
                matches = [
                    (candidate_id, data)
                    for candidate_id, data in CARICATURE_JOBS.items()
                    if data.get("email") == sanitize_filename(email.lower()) and data.get("status") in {"ready", "failed"}
                ]
            if len(matches) == 1:
                job_id = matches[0][0]
            else:
                send_json(self, 404, {"error": "Picture not found", "status": "not_found"})
                return

        if not job_id:
            send_json(self, 400, {"error": "Missing job_id"})
            return

        job = get_job_status(job_id)
        if not job:
            send_json(self, 404, {"error": "Job not found"})
            return

        status = job.get("status", "unknown")
        if status != "ready":
            if status == "failed":
                send_json(
                    self,
                    200,
                    {
                        "jobId": job_id,
                        "status": status,
                        "error": job.get("error"),
                    },
                )
            else:
                send_json(self, 200, {"jobId": job_id, "status": status})
            return

        image_data = encode_file_as_data_url(job["path"])
        if not image_data:
            send_json(self, 404, {"error": "Caricature image not found"})
            return

        send_json(
            self,
            200,
            {
                "jobId": job_id,
                "status": "ready",
                "path": job.get("path"),
                "imageData": image_data,
            },
        )


def main():
    host = os.getenv("CARICATURE_HOST", "0.0.0.0")
    port = int(os.getenv("CARICATURE_PORT", "5001"))
    server = HTTPServer((host, port), CaptureHandler)
    print(f"Photo capture service running at http://{host}:{port}/save-capture")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
