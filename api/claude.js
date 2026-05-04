export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { system, message } = req.body;
  if (!message) return res.status(400).json({ error: "No message" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json(data);
    return res.status(200).json({ text: data.content[0].text.trim() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
