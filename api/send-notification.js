import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, title, body } = req.body;
  if (!token) return res.status(400).json({ error: 'No token' });

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    const projectId = serviceAccount.project_id;
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            webpush: {
              notification: {
                title,
                body,
                icon: '/images/hero.jpg',
                vibrate: [200, 100, 200],
              },
            },
          },
        }),
      }
    );

    const data = await fcmRes.json();
    if (!fcmRes.ok) return res.status(500).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
