import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    roomId,
    plan,
  } = req.body;

  // Verify HMAC signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  const db = getFirestore();
  const expiry = plan === 'yearly'
    ? Date.now() + 365 * 24 * 60 * 60 * 1000
    : Date.now() + 30  * 24 * 60 * 60 * 1000;

  await db.collection('rooms').doc(roomId).update({
    isPremium:             true,
    premiumPlan:           plan,
    premiumExpiry:         expiry,
    premiumActivatedAt:    Date.now(),
    razorpayPaymentId:     razorpay_payment_id,
    razorpayOrderId:       razorpay_order_id,
  });

  return res.status(200).json({ success: true });
}
