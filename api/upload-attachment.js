// POST /api/upload-attachment
//
// Accepts a multipart/form-data upload (field name: "file") from the browser,
// uploads it to Cloudinary, and returns the public HTTPS URL. Kapture needs a
// real, publicly reachable URL for upload_image_of_the_issue (and the batch
// code photo) — this is what generates it.

import { v2 as cloudinary } from 'cloudinary';
import formidable from 'formidable';
import fs from 'fs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Disable Vercel's default JSON body parser — we need the raw multipart stream
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('Cloudinary environment variables are not fully set');
    return res.status(500).json({ error: 'Server is not configured correctly' });
  }

  try {
    const form = formidable({
      maxFileSize: 8 * 1024 * 1024, // 8MB cap, adjust as needed
      multiples: false
    });

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const uploaded = files.file?.[0] || files.file; // formidable v3 returns arrays
    if (!uploaded) {
      return res.status(400).json({ error: 'No file field named "file" was found' });
    }

    const filePath = uploaded.filepath || uploaded.path;

    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'hccb-webform', // keeps uploads organized in your Cloudinary account
      resource_type: 'image'
    });

    // Clean up the temp file formidable wrote to disk
    fs.unlink(filePath, () => {});

    return res.status(200).json({ url: result.secure_url });
  } catch (err) {
    console.error('Upload failed:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
