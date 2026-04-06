import base64
import io
import os
from typing import Optional

import requests
import streamlit as st
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

# -----------------------------
# Config
# -----------------------------
API_KEY = "AIzaSyBXNvPrRfbWDcuURuT6i_TYerfLlhYOl5M"
MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.0-flash-preview-image-generation")
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

DEFAULT_STYLE = (
    "Create a fun caricature of this person from the uploaded camera photo. "
    "Exaggerate facial features artistically (big smile, expressive eyes, playful style) "
    "while keeping the person clearly recognizable. Bright colors, clean background, "
    "high detail, portrait framing."
)


def pil_to_b64_jpeg(img: Image.Image, quality: int = 95) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def call_gemini_image_transform(image_bytes: bytes, prompt: str) -> Optional[Image.Image]:
    if not API_KEY:
        raise RuntimeError("Missing GEMINI_API_KEY environment variable.")

    img_b64 = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": img_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        },
    }

    resp = requests.post(
        API_URL,
        params={"key": API_KEY},
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()

    # Try to find image bytes in the response
    candidates = data.get("candidates", [])
    for c in candidates:
        content = c.get("content", {})
        for part in content.get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                out = base64.b64decode(inline["data"])
                return Image.open(io.BytesIO(out)).convert("RGB")

    return None


def main():
    st.set_page_config(page_title="Gemini Character Booth", page_icon="🎭", layout="centered")
    st.title("🎭 Gemini Character Booth")
    st.caption("Take a photo, then generate a character version with Gemini.")

    if not API_KEY:
        st.error("GEMINI_API_KEY is not set. Set it before launching.")
        st.stop()

    style_prompt = st.text_area(
        "Character style prompt",
        value=DEFAULT_STYLE,
        height=120,
    )

    cam = st.camera_input("Take a picture")

    if cam is not None:
        st.image(cam, caption="Captured photo", use_container_width=True)

        if st.button("Generate Character", type="primary"):
            with st.spinner("Generating character image with Gemini..."):
                try:
                    input_bytes = cam.getvalue()
                    result_img = call_gemini_image_transform(input_bytes, style_prompt)

                    if result_img is None:
                        st.warning(
                            "Gemini returned no image. Try a different model in GEMINI_IMAGE_MODEL or adjust prompt."
                        )
                    else:
                        st.success("Done!")
                        st.image(result_img, caption="Character result", use_container_width=True)

                        # Download button
                        out_buf = io.BytesIO()
                        result_img.save(out_buf, format="PNG")
                        st.download_button(
                            label="Download PNG",
                            data=out_buf.getvalue(),
                            file_name="character_result.png",
                            mime="image/png",
                        )
                except Exception as e:
                    st.error(f"Generation failed: {e}")

    st.divider()
    st.caption(
        "Tip: Keep your API key in an environment variable, not in code. "
        "Example: export GEMINI_API_KEY='...'."
    )


if __name__ == "__main__":
    main()
