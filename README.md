# Puppeteer Automation Server (image-based locators)

Small Node.js project that exposes an Express server to run Puppeteer automations and supports image-based locators via a Python OpenCV helper.

Requirements
- Node.js 18+ (or recent)
- Python 3.8+
- pip install opencv-python

Install

```powershell
cd puppeteer-automation
npm install
pip install opencv-python
```

Run

```powershell
node server.js
# server listens on port 3000
```

Example request (curl multipart):

```bash
curl -X POST http://localhost:3000/run \
  -F "payload={\"url\":\"https://example.com\",\"actions\":[{\"type\":\"clickImage\",\"template\":\"btn.png\"}]}" \
  -F "templates=@/path/to/btn.png"
```

How it works
- Server saves uploaded template(s)
- Puppeteer opens the requested URL and screenshots the page
- Python `image_match.py` performs template matching returning coordinates
- Puppeteer clicks at returned x,y

Notes
- Template matching is scale-sensitive. For robust results consider multiple scales or feature matching.
