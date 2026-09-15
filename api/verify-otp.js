// api/verify-otp.js
//
// Proxies Kapture's noauth Verify OTP API:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/verify-otp
//   Body: { key, phone, otp }
//
// Uses the same KAPTURE_OTP_KEY env var as send-otp.js. Server-side only —
// never sent to the browser.
//
// NOTE: same caveat as send-otp.js — Kapture's exact response shape for a
// right/wrong code hasn't been fully confirmed beyond one working sample.
// This falls back to HTTP status if no explicit status/success field is
// present. If verification starts behaving oddly, check DevTools → Network
// → this request's Response/Preview tab and adjust the `success` check.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const KAPTURE_OTP_KEY = process.env.KAPTURE_OTP_KEY;
  if (!KAPTURE_OTP_KEY) {
    // Same calm fallback as send-otp.js — frontend accepts the documented
    // demo code (123456) while this status is returned.
    return res.status(501).json({ error: 'OTP key not configured' });
  }

  const { phone, otp } = req.body || {};
  if (!phone || !/^\d{10}$/.test(String(phone))) {
    return res.status(400).json({ error: 'A valid 10-digit phone number is required' });
  }
  if (!otp || !/^\d{4,8}$/.test(String(otp))) {
    return res.status(400).json({ error: 'A valid OTP code is required' });
  }

  try {
    const kaptureRes = await fetch(
      'https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/verify-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: KAPTURE_OTP_KEY,
          phone: String(phone),
          otp: String(otp)
        })
      }
    );

    const text = await kaptureRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const success = kaptureRes.ok && data.status !== false && data.success !== false;

    if (!success) {
      return res.status(401).json({ verified: false, details: data });
    }

    return res.status(200).json({ verified: true, details: data });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ verified: false, error: 'Failed to reach Kapture', message: err.message });
  }
}
