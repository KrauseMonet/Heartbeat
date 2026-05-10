export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { plan, roomId } = req.body;

  const amounts = {
    monthly: 14900,  // ₹149 in paise
    yearly:  99900,  // ₹999 in paise
  };

  const keyId     = process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amounts[plan] ?? amounts.monthly,
        currency: 'INR',
        notes: { roomId, plan },
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json(data);

    return res.status(200).json({
      orderId:  data.id,
      amount:   data.amount,
      currency: data.currency,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
