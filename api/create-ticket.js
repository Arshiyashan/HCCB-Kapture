// POST /api/create-ticket
//
// Receives the ticket payload built by the browser (index.html) and forwards
// it to Kapture's "Add Ticket" endpoint, attaching the secret Authorization
// header server-side. The token lives only in the KAPTURE_AUTH_TOKEN
// environment variable on Vercel — it is never sent to the browser.

const KAPTURE_URL = 'https://cokebuddy.kapturecrm.com/add-ticket-from-other-source.html/v.2.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authToken = process.env.KAPTURE_AUTH_TOKEN;
  if (!authToken) {
    console.error('KAPTURE_AUTH_TOKEN is not set in environment variables');
    return res.status(500).json({ error: 'Server is not configured correctly' });
  }

  // req.body is already parsed to JSON by Vercel when Content-Type: application/json
  //
  // CONFIRMED shape from a real working curl: a single JSON OBJECT at the top
  // level (title, ticket_details, due_date, phone, email_id, flow_id, webform),
  // where "webform" is itself an ARRAY containing one object of form fields.
  // This is different from earlier guesses that wrapped the whole thing in an
  // outer array — that was wrong, this is the confirmed real shape.
  const ticketPayload = req.body;

  if (!ticketPayload || typeof ticketPayload !== 'object' || Array.isArray(ticketPayload)) {
    return res.status(400).json({ error: 'Request body must be a single JSON object (not an array)' });
  }
  if (!Array.isArray(ticketPayload.webform) || ticketPayload.webform.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty "webform" array' });
  }

  try {
    const kaptureRes = await fetch(KAPTURE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // authToken should be the FULL header value, e.g. "Basic xxxxxxxx"
        'Authorization': authToken
      },
      body: JSON.stringify(ticketPayload)
    });

    const rawText = await kaptureRes.text();
    let kaptureData;
    try {
      kaptureData = JSON.parse(rawText);
    } catch {
      kaptureData = { raw: rawText };
    }

    if (!kaptureRes.ok) {
      console.error('Kapture API error:', kaptureRes.status, rawText);
      return res.status(502).json({
        error: 'Kapture rejected the ticket request',
        status: kaptureRes.status,
        details: kaptureData
      });
    }

    // Normalize a ticket id field for the frontend, whatever Kapture calls it
    const ticketId =
      kaptureData?.ticket_id ||
      kaptureData?.id ||
      kaptureData?.data?.ticket_id ||
      null;

    return res.status(200).json({ ...kaptureData, ticket_id: ticketId });
  } catch (err) {
    console.error('Failed to reach Kapture:', err);
    return res.status(502).json({ error: 'Could not reach Kapture API' });
  }
}
