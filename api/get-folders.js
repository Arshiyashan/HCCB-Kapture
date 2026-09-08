// POST /api/get-folders
//
// Proxies Kapture's "get folders by level" endpoint (used to populate the
// "Issue is regarding" L1 -> L2 -> L3 picker) so the browser never talks to
// Kapture's internal endpoint directly.
//
//   Real endpoint:
//   POST https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level
//
// NOTE ON AUTH: the curl you captured for this endpoint has no Authorization
// header and no Cookie header — just Origin/Referer/Sec-Fetch-* headers,
// which browsers add automatically and can't really be "faked" as a
// credential. Two real possibilities:
//   1. This endpoint is only reachable from inside Kapture's own domain/admin
//      panel (i.e. it checks Origin/Referer rather than a token), in which
//      case a server-to-server call like this one may get rejected even with
//      headers matched exactly — that's normal for internal-only endpoints,
//      not a bug in this file.
//   2. Your browser WAS sending a session cookie, but whatever tool exported
//      this curl stripped it out (some "copy as curl" options omit cookies
//      by default for security). If so, open your browser's DevTools →
//      Network tab, find this same request, open its Headers, and check if
//      there's a "Cookie:" line you didn't get in the plain curl export.
//
// This proxy is written to try WITHOUT any cookie first (matching your curl
// exactly). If Kapture responds 401/403, that confirms case 2 — set
// KAPTURE_ADMIN_SESSION_COOKIE in Vercel and this file will start sending it
// automatically; no code changes needed either way.

const KAPTURE_FOLDERS_URL = 'https://cokebuddy.kapturecrm.com/ms/ticket-configuration/ticket-configuration/get-folders-by-level';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
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

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    // Matches your curl — harmless to include, and some backends do check these.
    'Origin': 'https://cokebuddy.kapturecrm.com',
    'Referer': 'https://cokebuddy.kapturecrm.com/nui/configurations/ticket/folder',
    'X-KapTrace-ID': crypto.randomUUID(),
    'X-Request-Time': String(Date.now())
  };

  // Only added if you've set it — see the note above about whether this is
  // actually needed. Leaving it unset matches your curl exactly.
  if (process.env.KAPTURE_ADMIN_SESSION_COOKIE) {
    headers['Cookie'] = process.env.KAPTURE_ADMIN_SESSION_COOKIE;
  }

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
        error: (kaptureRes.status === 401 || kaptureRes.status === 403)
          ? 'Kapture rejected this as unauthenticated — this endpoint likely needs a session cookie after all; see this file\'s top comment for how to capture one from DevTools, then set KAPTURE_ADMIN_SESSION_COOKIE'
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
