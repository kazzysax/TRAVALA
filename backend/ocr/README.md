# backend/ocr

OCR/translation proxy for Quick Scan: an image (menu, sign, etc.) goes in,
paired original/translated text lines come out. A backend proxy specifically
so vision/translate API keys never reach the frontend (technical-plan.md 3.5).

## Requires before this actually runs

- `VISION_API_KEY` - written against Google Cloud Vision's REST API (this one
  isn't free - billing must be enabled on the Google Cloud project). Swap
  `src/lib/vision.js` for AWS Textract/Azure/etc. if you'd rather avoid that.
- Translation needs nothing - `src/lib/translate.js` uses MyMemory, which is
  free with no API key. Optionally set `MYMEMORY_EMAIL` to raise the daily
  quota from 5,000 to 50,000 characters (a free registration, not billing).

technical-plan.md leaves the exact provider choice open ("default
recommendation is fine"). Translation defaults to MyMemory specifically to
avoid a billing requirement; swap `src/lib/translate.js` for DeepL/Google/a
self-hosted LibreTranslate instance if you outgrow its quota later.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `POST /scan` `{ imageBase64, targetLanguage }` -> `{ lines: [{ original, translated }, ...] }`
