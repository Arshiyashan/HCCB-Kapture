// api/send-otp.js
//
// Proxies Kapture's noauth Send OTP API:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/send-otp
//   Body: { key, phone, ticketId }
//
// The secret `key` lives only in the KAPTURE_OTP_KEY env var (Vercel →
// Settings → Environment Variables) and never reaches the browser.
//
// NOTE: Kapture's exact success/failure response shape for this endpoint
// hasn't been fully confirmed yet (we only have one working sample). This
// checks the HTTP status plus any explicit `status`/`success` field in the
// body, and falls back to res.ok if neither is present. If sends start
// failing unexpectedly, check DevTools → Network → this request's
// Response/Preview tab (same trick that caught the get-folders `dataList`
// issue) and adjust the `success` check below.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const KAPTURE_OTP_KEY = process.env.KAPTURE_OTP_KEY;
  if (!KAPTURE_OTP_KEY) {
    // Calm, expected fallback — the frontend treats this specific status as
    // "demo mode", not an alarming failure.
    return res.status(501).json({ error: 'OTP key not configured' });
  }

  const { phone, ticketId } = req.body || {};
  if (!phone || !/^\d{10}$/.test(String(phone))) {
    return res.status(400).json({ error: 'A valid 10-digit phone number is required' });
  }

  try {
    const kaptureRes = await fetch(
      'https://cokebuddy.kapturecrm.com/ms/ticket-action/noauth/send-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: KAPTURE_OTP_KEY,
          phone: String(phone),
          ticketId: ticketId || ''
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
      return res.status(502).json({ success: false, error: 'Kapture rejected the OTP send request', details: data });
    }

    return res.status(200).json({ success: true, details: data });
  } catch (err) {
    console.error('send-otp error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reach Kapture', message: err.message });
  }
}
