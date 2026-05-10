export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { plan, roomId } = req.body;

  const prices = {
    monthly: process.env.PADDLE_MONTHLY_PRICE_ID,
    yearly: process.env.PADDLE_YEARLY_PRICE_ID,
  };

  try {
    const response = await fetch('https://api.paddle.com/transactions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ price_id: prices[plan], quantity: 1 }],
        custom_data: { roomId, plan },
        checkout: {
          url: `${process.env.APP_URL}?payment=success&roomId=${roomId}&plan=${plan}`,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json(data);

    return res.status(200).json({ url: data.data?.checkout?.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
