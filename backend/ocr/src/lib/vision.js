// REQUIRES: VISION_API_KEY. Written against Google Cloud Vision's REST API
// (no SDK needed) - see .env.example for swapping providers.

async function detectTextLines(imageBase64) {
  const { VISION_API_KEY } = process.env;
  if (!VISION_API_KEY) throw new Error("VISION_API_KEY not set - see .env.example");

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision API failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const fullText = data?.responses?.[0]?.fullTextAnnotation?.text || "";
  return fullText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

module.exports = { detectTextLines };
