const express = require("express");
const { detectTextLines } = require("../lib/vision");
const { translateLines } = require("../lib/translate");

const router = express.Router();

/// Quick Scan: image in, paired original/translated lines out (matches
/// dashboard.html's scan-result rows: one "orig" line next to one "tr" line).
/// This is a backend proxy specifically so vision/translate API keys never
/// reach the frontend directly (technical-plan.md 3.5).
router.post("/scan", async (req, res) => {
  try {
    const { imageBase64, targetLanguage } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });
    if (!targetLanguage) return res.status(400).json({ error: "targetLanguage required" });

    const originalLines = await detectTextLines(imageBase64);
    const translatedLines = await translateLines(originalLines, targetLanguage);

    const lines = originalLines.map((original, i) => ({ original, translated: translatedLines[i] }));
    res.status(200).json({ lines });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
