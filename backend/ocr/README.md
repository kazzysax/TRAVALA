# backend/ocr

OCR/translation proxy for Quick Scan: an image (menu, sign, etc.) goes in,
paired original/translated text lines come out. A backend proxy specifically
so vision/translate API keys never reach the frontend (technical-plan.md 3.5).

## Requires before this actually runs

- `VISION_API_KEY` - written against Google Cloud Vision's REST API; swap
  `src/lib/vision.js` for AWS Textract/Azure/etc. if you'd rather use those.
- `TRANSLATE_API_KEY` - written against Google Cloud Translate v2's REST API;
  swap `src/lib/translate.js` for DeepL/etc. if preferred.

technical-plan.md leaves the exact provider choice open ("default
recommendation is fine") - Google was picked here only because both its
Vision and Translate REST APIs need nothing but an API key, no SDK install.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `POST /scan` `{ imageBase64, targetLanguage }` -> `{ lines: [{ original, translated }, ...] }`
