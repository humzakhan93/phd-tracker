export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageData, mimeType } = req.body;

  if (!imageData || !mimeType) {
    return res.status(400).json({ error: "Missing imageData or mimeType" });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: `You extract job data from private hire driver app screenshots (Uber, Bolt, FalconCars, Skyline, etc).
Return ONLY valid JSON, no markdown, no explanation:
{ "fare": number or null, "jobMiles": number or null, "minutes": number or null, "notes": string or null, "date": "YYYY-MM-DD" or null }
Today is ${today}.
fare = the amount shown to the driver (not the customer price if different).
minutes = trip duration in minutes if shown.
jobMiles = distance of the trip if shown.
notes = pickup or dropoff location if shown, keep it short.
If you cannot find a value, use null.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: imageData,
                },
              },
              {
                type: "text",
                text: "Extract the job data from this screenshot.",
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", data);
      return res.status(500).json({ error: "AI service error", detail: data });
    }

    const text = (data.content || []).map((b) => b.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("scan-screenshot error:", err);
    return res.status(500).json({ error: "Failed to process screenshot" });
  }
}
