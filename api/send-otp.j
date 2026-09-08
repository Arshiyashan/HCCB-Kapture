// POST /api/send-otp
//
// Proxies Kapture's OTP-send endpoint so the secret "key" value never ships
// inside the public form's browser code.
//
//   Real endpoint:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/send-otp
//   Body: { key, phone, ticketId }
//
// The endpoint is marked "noauth" on Kapture's side, meaning it doesn't need
// a logged-in session — just the "key" value (store this in
// KAPTURE_OTP_KEY). That makes this proxy simpler and more robust than
// get-folders.js, which does depend on a fragile admin session cookie.
//
// NOTE: this wires up SENDING the OTP for real. Verifying the code the
// customer types back in still needs its own Kapture endpoint — you hadn't
// given me that one yet, so index.html's verify step still checks for the
// demo code 123456. Send me that verify-otp curl whenever you have it and
// I'll wire the other half up the same way.

const KAPTURE_SEND_OTP_URL = 'https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/send-otp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const otpKey = process.env.KAPTURE_OTP_KEY;
  if (!otpKey) {
    console.error('KAPTURE_OTP_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server is not configured correctly' });
  }

  const { phone, ticketId } = req.body || {};
  if (!phone || !/^\d{10}$/.test(String(phone))) {
    return res.status(400).json({ error: 'Request body must include a valid 10-digit "phone"' });
  }

  try {
    const kaptureRes = await fetch(KAPTURE_SEND_OTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: otpKey,
        phone: String(phone),
        ticketId: ticketId || ''
      })
    });

    const rawText = await kaptureRes.text();
    let kaptureData;
    try {
      kaptureData = JSON.parse(rawText);
    } catch {
      kaptureData = { raw: rawText };
    }

    if (!kaptureRes.ok) {
      console.error('Kapture send-otp error:', kaptureRes.status, rawText);
      return res.status(502).json({
        error: 'Kapture rejected the OTP request',
        status: kaptureRes.status,
        details: kaptureData
      });
    }

    return res.status(200).json(kaptureData);
  } catch (err) {
    console.error('Failed to reach Kapture send-otp API:', err);
    return res.status(502).json({ error: 'Could not reach Kapture OTP API' });
  }
}
