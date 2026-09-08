// POST /api/get-folders
//
// Proxies Kapture's "get folders by level" endpoint (used to populate the
// "Issue is regarding" L1 -> L2 -> L3 picker) so the browser never needs
// Kapture's internal admin session directly.
//
//   Real endpoint:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level
//
// IMPORTANT CAVEAT: unlike the ticket-creation endpoint (which uses a plain
// Authorization: Basic header), this folder endpoint was captured from an
// authenticated *admin browser session* — its only real credential is the
// session cookie (JSESSIONID / _KSID / etc). Session cookies expire and are
// tied to a login, so this is inherently more fragile than a proper API key:
//   - Whoever generates KAPTURE_ADMIN_SESSION_COOKIE must stay logged in /
//     periodically refresh it, or this endpoint will start failing.
//   - Ask your Kapture account rep whether there's a proper long-lived API
//     token for folder configuration reads — that would be far more robust
//     than smuggling through a staff session cookie.
//
// Frontend calls this with { level, parentFolderId? }. We translate that
// into the shape Kapture expects and relay the response back as-is.

const KAPTURE_FOLDERS_URL = 'https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionCookie = process.env.KAPTURE_ADMIN_SESSION_COOKIE;
  if (!sessionCookie) {
    console.error('KAPTURE_ADMIN_SESSION_COOKIE is not set in environment variables');
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
    // reasonable guess (matches the export's "Parent Folder Id" column) but
    // isn't confirmed against a real request/response pair yet.
    kaptureBody.parentFolderId = parentFolderId;
  }

  try {
    const kaptureRes = await fetch(KAPTURE_FOLDERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Cookie': sessionCookie,
        // Kapture's own frontend sends these trace/timing headers — harmless
        // to include, and matches what a real browser session would send.
        'X-KapTrace-ID': crypto.randomUUID(),
        'X-Request-Time': String(Date.now())
      },
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
      // A 401/403 here almost always means the session cookie has expired —
      // surface that distinctly so it's easy to diagnose from the frontend's
      // console instead of looking like a generic failure.
      return res.status(502).json({
        error: kaptureRes.status === 401 || kaptureRes.status === 403
          ? 'Kapture session appears to have expired — refresh KAPTURE_ADMIN_SESSION_COOKIE'
          : 'Kapture rejected the folder request',
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
