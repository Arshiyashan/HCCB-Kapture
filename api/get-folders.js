// POST /api/get-folders
//
// Proxies Kapture's "get folders by level" endpoint (used to populate the
// "Issue is regarding" L1 -> L2 -> L3 picker) so the browser never talks to
// Kapture's internal endpoint directly.
//
//   Real endpoint:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level
//
// CONFIRMED WORKING: this endpoint takes a fixed Authorization: Basic header
// (a reusable username:password credential, NOT a session cookie tied to a
// login — much more robust, this one won't expire the way a session cookie
// would). Store the full header value (including "Basic ") in
// KAPTURE_FOLDERS_AUTH_TOKEN.
 
const KAPTURE_FOLDERS_URL = 'https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level';
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const authToken = process.env.KAPTURE_FOLDERS_AUTH_TOKEN;
  if (!authToken) {
    console.error('KAPTURE_FOLDERS_AUTH_TOKEN is not set in environment variables');
    return res.status(500).json({ error: 'Server is not configured correctly' });
  }
 
  const { level, parentFolderId } = req.body || {};
  if (level !== 1 && level !== 2 && level !== 3) {
    return res.status(400).json({ error: 'Request body must include a numeric "level" (1, 2, or 3)' });
  }
 
  const kaptureBody = { level, fetchEnableFolders: true };
  if (parentFolderId != null) {
    // NOTE: confirm this is really the field Kapture expects for level 2/3
    // lookups once you can test against a live level-2/3 call — the curl you
    // captured only showed a level-1 request, so this key name is a
    // reasonable guess but isn't confirmed against a real request/response
    // pair for a deeper level yet.
    kaptureBody.parentFolderId = parentFolderId;
  }
 
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    // authToken should be the FULL header value, e.g. "Basic aGNjYjpIY2NiQDEyMw=="
    'Authorization': authToken
  };
 
  try {
    const kaptureRes = await fetch(KAPTURE_FOLDERS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(kaptureBody)
    });
 
    const rawText = await kaptureRes.text();
    let kaptureData;
    try {
      kaptureData = JSON.parse(rawText);
    } catch {
      kaptureData = { raw: rawText };
    }
 
    if (!kaptureRes.ok) {
      console.error('Kapture folders API error:', kaptureRes.status, rawText);
      return res.status(502).json({
        error: 'Kapture rejected the folder request',
        status: kaptureRes.status,
        details: kaptureData
      });
    }
 
    return res.status(200).json(kaptureData);
  } catch (err) {
    console.error('Failed to reach Kapture folders API:', err);
    return res.status(502).json({ error: 'Could not reach Kapture folders API' });
  }
}
 
