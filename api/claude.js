export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "No message" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet",
        max_tokens: 700,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: message }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    console.log("Claude response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(500).json({
        error: "Claude failed",
        details: data
      });
    }

    const text = data?.content?.[0]?.text || "No response generated";

    return res.status(200).json({ text });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "Server crash",
      message: err.message
    });
  }
}