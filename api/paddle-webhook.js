import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['paddle-signature'];

  const [tsPart, h1Part] = signature.split(';');
  const ts = tsPart.split('=')[1];
  const h1 = h1Part.split('=')[1];
  const signedPayload = `${ts}:${rawBody}`;
  const expectedHash = crypto
    .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  if (expectedHash !== h1) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);
  const db = getFirestore();

  if (event.event_type === 'transaction.completed') {
    const { roomId, plan } = event.data?.custom_data || {};
    if (!roomId) return res.status(200).json({ received: true });

    const expiry = plan === 'yearly'
      ? Date.now() + 365 * 24 * 60 * 60 * 1000
      : Date.now() + 30 * 24 * 60 * 60 * 1000;

    await db.collection('rooms').doc(roomId).update({
      isPremium: true,
      premiumPlan: plan,
      premiumExpiry: expiry,
      premiumActivatedAt: Date.now(),
      paddleTransactionId: event.data?.id,
    });
  }

  if (event.event_type === 'subscription.canceled') {
    const { roomId } = event.data?.custom_data || {};
    if (roomId) {
      await db.collection('rooms').doc(roomId).update({
        isPremium: false,
        premiumExpiry: null,
      });
    }
  }

  return res.status(200).json({ received: true });
}
