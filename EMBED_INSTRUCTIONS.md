# How to Embed the Kiosk in Wix (with Camera Access)

## The Problem
Wix embeds external pages in iframes, but browsers block camera/microphone access by default for security.

## Solution: Use Custom HTML Embed in Wix

1. **In Wix Editor:**
   - Click the **+** button to add elements
   - Go to **Embed Code** → **Embed HTML**
   - Drag the HTML embed element to your page

2. **Paste this code into the HTML embed:**

```html
<iframe
  src="https://kiosk-test-case.vercel.app/camera.html"
  allow="camera *; microphone *; geolocation *"
  width="100%"
  height="800px"
  style="border: none;"
  allowfullscreen>
</iframe>
```

3. **Adjust the settings:**
   - Set the width to `100%` to fill the container
   - Adjust height as needed (800px is a good starting point)
   - Make sure to enable "Run on Page Load" in the embed settings

## Alternative: Direct Link
If camera permissions still don't work in the iframe, use a button that opens the page in a new window:

```html
<a href="https://kiosk-test-case.vercel.app/camera.html"
   target="_blank"
   style="display: inline-block; padding: 15px 30px; background: #b98c43; color: white; text-decoration: none; border-radius: 999px; font-weight: bold;">
  Open Photo Booth
</a>
```

## Important Notes:
- The `allow="camera *; microphone *"` attribute is **required** for camera access
- Some browsers may still prompt users to allow camera access
- Works best when opened in a full window/tab rather than an iframe
- Mobile Safari has stricter iframe camera restrictions - recommend using the direct link approach for mobile
