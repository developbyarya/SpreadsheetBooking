import express, { Request, Response } from 'express';
import { JWT } from 'google-auth-library';

const app = express();
app.use(express.json());

export interface FormItem {
  id: string; // Unique slug or code, e.g. "kelas-a", "kelas-b", "sesi-1"
  title: string; // Customizable form title
  description?: string; // Optional custom instructions
  sheetId: string; // Target Google Spreadsheet ID
  sheetName: string; // Target sheet tab, e.g. "Sheet1", "Sheet2", "Kelas A"
  startRow: number; // Row number where schedule starts (default: 54)
  createdAt: number;
}

// In-memory multi-form registry
const formsMap = new Map<string, FormItem>();

// Token store: maps sheetId -> accessToken (and latest global token fallback)
const tokenMap = new Map<string, string>();
let latestToken: string | null = null;

// Cache for Service Account token
let cachedServiceAccountToken: { token: string; expiresAt: number } | null = null;

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0811762236';

// Persistent default fallback configuration
const DEFAULT_CONFIG = {
  sheetId: process.env.SPREADSHEET_ID || process.env.DEFAULT_SHEET_ID || '1y9ikk1kCJZsmrO8w5YQEXN8BFtensg8R8AcTo7xtQjQ',
  sheetName: process.env.DEFAULT_SHEET_NAME || 'Progress 2',
  startRow: Number(process.env.DEFAULT_START_ROW) || 59,
  title: process.env.DEFAULT_FORM_TITLE || 'Salinan dari Progress Report Proyek Akhir Data Science',
  description: 'Pilih slot waktu dan lengkapi data kelompok Anda',
};

/**
 * Synchronize forms from Firestore REST API (runs automatically on cold starts)
 */
async function syncFormsFromFirestore(): Promise<void> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/forms`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const docs = data.documents || [];
    for (const d of docs) {
      const f = d.fields || {};
      const id = f.id?.stringValue || d.name.split('/').pop() || 'default';
      const sheetId = f.sheetId?.stringValue;
      const sheetName = f.sheetName?.stringValue || 'Sheet1';
      const title = f.title?.stringValue || 'Jadwal Presentasi';
      const description = f.description?.stringValue || '';
      const startRow = Number(f.startRow?.integerValue || f.startRow?.stringValue) || 54;
      const createdAt = Number(f.createdAt?.integerValue || f.createdAt?.stringValue) || Date.now();

      if (sheetId) {
        formsMap.set(id, {
          id,
          title,
          description,
          sheetId,
          sheetName,
          startRow,
          createdAt,
        });
      }
    }
  } catch (err) {
    console.warn('Error syncing forms from Firestore in backend:', err);
  }
}

/**
 * Get effective Google OAuth access token:
 * 1. Primary: Google Service Account from GOOGLE_SERVICE_ACCOUNT_KEY env var (24/7)
 * 2. Fallback: Firestore sessions collection
 * 3. Fallback: Owner session token saved in memory
 */
export async function getEffectiveGoogleToken(sheetId?: string): Promise<string | null> {
  const saKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKeyRaw) {
    try {
      if (cachedServiceAccountToken && cachedServiceAccountToken.expiresAt > Date.now() + 300000) {
        return cachedServiceAccountToken.token;
      }

      const credentials = typeof saKeyRaw === 'string'
        ? JSON.parse(saKeyRaw.trim())
        : saKeyRaw;

      if (credentials.client_email && credentials.private_key) {
        const client = new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
          ],
        });

        const tokenRes = await client.getAccessToken();
        if (tokenRes.token) {
          cachedServiceAccountToken = {
            token: tokenRes.token,
            expiresAt: Date.now() + 3500000,
          };
          return tokenRes.token;
        }
      }
    } catch (err) {
      console.warn('Service Account token error:', err);
    }
  }

  // Fallback to in-memory session token
  if (sheetId && tokenMap.has(sheetId)) {
    return tokenMap.get(sheetId)!;
  }
  if (latestToken) {
    return latestToken;
  }

  // Fallback: Read session token from Firestore sessions collection
  const targetSheetId = sheetId || DEFAULT_CONFIG.sheetId;
  if (targetSheetId) {
    try {
      const sessionUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/sessions/${encodeURIComponent(targetSheetId)}`;
      const res = await fetch(sessionUrl);
      if (res.ok) {
        const docData = await res.json();
        const firestoreToken = docData.fields?.accessToken?.stringValue;
        if (firestoreToken) {
          tokenMap.set(targetSheetId, firestoreToken);
          latestToken = firestoreToken;
          return firestoreToken;
        }
      }
    } catch (sessionErr) {
      console.warn('Error reading session token from Firestore in backend:', sessionErr);
    }
  }

  return null;
}

// Initialize with a default form if empty
function ensureDefaultForm(sheetId: string, sheetName: string = 'Jadwal Presentasi', title: string = 'Jadwal Presentasi') {
  if (formsMap.size === 0) {
    formsMap.set('default', {
      id: 'default',
      title,
      description: 'Pilih slot waktu dan lengkapi data kelompok Anda',
      sheetId,
      sheetName,
      startRow: 54,
      createdAt: Date.now(),
    });
  }
}

// Endpoint to provide token to client for direct Google Sheets interaction
app.get('/api/auth-token', async (req: Request, res: Response) => {
  const sheetId = (req.query.sheetId as string) || '';
  const token = await getEffectiveGoogleToken(sheetId);
  if (!token) {
    res.status(503).json({ error: 'No active Google Sheets credentials available.' });
    return;
  }
  res.json({ accessToken: token });
});

// Register owner session with token
app.post('/api/owner-session', (req: Request, res: Response) => {
  const { sheetId, activeSheetName, startRow, accessToken, title } = req.body;
  if (!sheetId || !accessToken) {
    res.status(400).json({ error: 'Missing sheetId or accessToken' });
    return;
  }

  tokenMap.set(sheetId, accessToken);
  latestToken = accessToken;

  ensureDefaultForm(sheetId, activeSheetName, title);

  res.json({ success: true, formsCount: formsMap.size });
});

// Fetch list of sheet tabs from Google Sheets for a given spreadsheet ID
app.get('/api/sheet-tabs', async (req: Request, res: Response) => {
  try {
    const sheetId = (req.query.sheetId as string) || '';
    if (!sheetId) {
      res.status(400).json({ error: 'Missing sheetId' });
      return;
    }

    const token = await getEffectiveGoogleToken(sheetId);
    if (!token) {
      res.status(401).json({ error: 'Kredensial Google Sheets belum tersedia. Silakan hubungi admin.' });
      return;
    }

    const googleRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!googleRes.ok) {
      const err = await googleRes.json().catch(() => ({}));
      res.status(googleRes.status).json({ error: err.error?.message || 'Failed to fetch sheet tabs' });
      return;
    }

    const data = await googleRes.json();
    const sheets = (data.sheets || []).map((s: { properties?: { title?: string } }) => s.properties?.title || '');

    res.json({ title: data.properties?.title, sheets });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
});

// Get all registered forms
app.get('/api/forms', async (_req: Request, res: Response) => {
  if (formsMap.size === 0) {
    await syncFormsFromFirestore();
  }
  const list = Array.from(formsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ forms: list });
});

// Create or update a form link
app.post('/api/forms', (req: Request, res: Response) => {
  const { id, title, description, sheetId, sheetName, startRow } = req.body;

  if (!title || !sheetId || !sheetName) {
    res.status(400).json({ error: 'Title, sheetId, and sheetName are required' });
    return;
  }

  let slug = (id || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
  if (!slug) {
    slug = `form-${Date.now().toString(36)}`;
  }

  const formItem: FormItem = {
    id: slug,
    title: title.trim(),
    description: (description || '').trim(),
    sheetId: sheetId.trim(),
    sheetName: sheetName.trim(),
    startRow: Number(startRow) || 54,
    createdAt: Date.now(),
  };

  formsMap.set(slug, formItem);
  res.json({ success: true, form: formItem });
});

// Delete a form link
app.delete('/api/forms/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = formsMap.delete(id);
  res.json({ success: deleted });
});

// Public endpoint: Fetch slots for a specific form or sheet
app.get('/api/public/slots', async (req: Request, res: Response) => {
  try {
    const formId = (req.query.formId as string) || (req.query.form as string) || '';
    const querySheetId = (req.query.sheetId as string) || '';
    const querySheetName = (req.query.sheetName as string) || (req.query.tab as string) || '';
    const queryStartRow = Number(req.query.startRow) || 54;
    const queryTitle = (req.query.title as string) || 'Jadwal Presentasi';

    // If formsMap is empty (cold start in serverless), sync from Firestore
    if (formsMap.size === 0) {
      await syncFormsFromFirestore();
    }

    let targetForm: FormItem | undefined;

    if (formId && formsMap.has(formId)) {
      targetForm = formsMap.get(formId);
    } else if (querySheetId) {
      targetForm = Array.from(formsMap.values()).find(
        (f) => f.sheetId === querySheetId && (!querySheetName || f.sheetName.toLowerCase() === querySheetName.toLowerCase())
      );
      if (!targetForm) {
        targetForm = {
          id: formId || (querySheetName ? `${querySheetId}-${querySheetName}` : querySheetId),
          title: queryTitle,
          sheetId: querySheetId,
          sheetName: querySheetName || 'Sheet1',
          startRow: queryStartRow,
          createdAt: Date.now(),
        };
        if (formId) {
          formsMap.set(formId, targetForm);
        }
      }
    } else if (formsMap.size > 0) {
      targetForm = formsMap.get('default') || Array.from(formsMap.values())[0];
    }

    // Always ensure a valid form is ready (fallback to persistent default)
    if (!targetForm) {
      targetForm = {
        id: 'default',
        title: DEFAULT_CONFIG.title,
        description: DEFAULT_CONFIG.description,
        sheetId: DEFAULT_CONFIG.sheetId,
        sheetName: DEFAULT_CONFIG.sheetName,
        startRow: DEFAULT_CONFIG.startRow,
        createdAt: Date.now(),
      };
      formsMap.set('default', targetForm);
    }

    const { sheetId, sheetName, startRow, title, description, id: currentFormId } = targetForm;
    const token = await getEffectiveGoogleToken(sheetId);

    if (!token) {
      res.status(503).json({
        error: 'Sesi atau kredensial Google Sheets belum aktif. Hubungi dosen/admin.',
        form: targetForm,
      });
      return;
    }

    const encodedRange = encodeURIComponent(`'${sheetName}'!A${startRow}:H600`);
    const googleRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!googleRes.ok) {
      const err = await googleRes.json().catch(() => ({}));
      res.status(googleRes.status).json({
        error: err.error?.message || `Gagal membaca sheet tab '${sheetName}' dari Google Sheets`,
        form: targetForm,
      });
      return;
    }

    const data = await googleRes.json();
    const rows: string[][] = data.values || [];

    const slots = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const currentRowNumber = startRow + i;

      if (!row || row.length === 0 || !row.some((c) => c && c.toString().trim().length > 0)) {
        continue;
      }

      const urutan = (row[0] || `${i + 1}`).toString().trim();
      const hari = (row[1] || '').toString().trim();
      const tanggal = (row[2] || '').toString().trim();
      const jam = (row[3] || '').toString().trim();
      const kelasTeori = (row[4] || '').toString().trim();
      const namaKelompok = (row[5] || '').toString().trim();
      const tema = (row[6] || '').toString().trim();
      const idKelompok = (row[7] || '').toString().trim();

      const isBooked = Boolean(namaKelompok || idKelompok);

      if (hari || tanggal || jam || isBooked) {
        slots.push({
          rowNumber: currentRowNumber,
          urutan: urutan || `${slots.length + 1}`,
          hari,
          tanggal,
          jam,
          kelasTeori,
          namaKelompok,
          tema,
          idKelompok,
          isBooked,
        });
      }
    }

    res.json({
      slots,
      form: {
        id: currentFormId,
        title,
        description,
        sheetId,
        sheetName,
        startRow,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching public slots:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Public endpoint: Submit booking without student login
app.post('/api/public/book', async (req: Request, res: Response) => {
  try {
    const { formId, sheetId: bodySheetId, sheetName: bodySheetName, rowNumber, kelasTeori, namaKelompok, tema, idKelompok } = req.body;

    if (!rowNumber || !namaKelompok || !idKelompok) {
      res.status(400).json({ error: 'Data booking tidak lengkap (Nama Kelompok & ID_Kelompok wajib diisi)' });
      return;
    }

    let targetSheetId = bodySheetId;
    let targetSheetName = bodySheetName;

    if (formId && formsMap.has(formId)) {
      const f = formsMap.get(formId)!;
      targetSheetId = f.sheetId;
      targetSheetName = f.sheetName;
    }

    if (!targetSheetId || !targetSheetName) {
      if (formsMap.size > 0) {
        const first = Array.from(formsMap.values())[0];
        targetSheetId = first.sheetId;
        targetSheetName = first.sheetName;
      }
    }

    const token = await getEffectiveGoogleToken(targetSheetId);
    if (!token) {
      res.status(503).json({ error: 'Kredensial Google Sheets belum aktif. Hubungi dosen pengampu.' });
      return;
    }

    // Check collision on column F (Nama Kelompok)
    const checkRange = encodeURIComponent(`'${targetSheetName}'!F${rowNumber}`);
    const checkRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${checkRange}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const existingName = checkData.values?.[0]?.[0];
      if (existingName && existingName.toString().trim().length > 0) {
        res.status(409).json({
          error: `Slot ini baru saja dibooking oleh kelompok lain (${existingName}). Silakan pilih slot lain.`,
        });
        return;
      }
    }

    // Write Columns E:H (Kelas Teori, Nama Kelompok, Tema, ID_Kelompok)
    const values = [
      [
        (kelasTeori || '').toString().trim(),
        (namaKelompok || '').toString().trim(),
        (tema || '').toString().trim(),
        (idKelompok || '').toString().trim(),
      ],
    ];

    const updateRange = encodeURIComponent(`'${targetSheetName}'!E${rowNumber}:H${rowNumber}`);
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`;

    const writeRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!writeRes.ok) {
      const err = await writeRes.json().catch(() => ({}));
      res.status(writeRes.status).json({
        error: err.error?.message || 'Gagal menyimpan booking ke spreadsheet',
      });
      return;
    }

    res.json({
      success: true,
      rowNumber,
      message: 'Booking presentasi berhasil disimpan ke Google Sheet',
    });
  } catch (error: unknown) {
    console.error('Error in public booking:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

// Send booking confirmation link to student institutional email
app.post('/api/send-confirmation', async (req: Request, res: Response) => {
  try {
    const { email, bookingId, confirmToken, slotDetails, appUrl, formTitle } = req.body;

    if (!email || !bookingId || !confirmToken || !slotDetails) {
      res.status(400).json({ error: 'Data email konfirmasi tidak lengkap' });
      return;
    }

    const baseUrl = appUrl || process.env.APP_URL || 'https://spreadsheet-booking.vercel.app';
    const confirmationLink = `${baseUrl.replace(/\/+$/, '')}/?action=confirm&bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(confirmToken)}`;

    const title = formTitle || 'Jadwal Presentasi';
    const subject = `[Konfirmasi] Booking Jadwal Presentasi: ${slotDetails.namaKelompok || 'Kelompok'}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { background: #059669; color: #ffffff; padding: 24px 32px; text-align: center; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
          .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 32px; }
          .slot-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; }
          .slot-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .slot-label { color: #64748b; font-weight: 500; }
          .slot-val { color: #0f172a; font-weight: 700; }
          .btn-container { text-align: center; margin: 30px 0 20px; }
          .btn { display: inline-block; background-color: #059669; color: #ffffff !important; font-weight: 700; font-size: 15px; padding: 14px 28px; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.4); }
          .warning-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; margin-top: 24px; font-size: 13px; color: #92400e; }
          .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
            <p>Konfirmasi Pemesanan Slot Jadwal Presentasi</p>
          </div>
          <div class="content">
            <p>Halo Mahasiswa Teknik Informatika UPN,</p>
            <p>Anda menerima email ini karena kelompok Anda baru saja memilih slot jadwal presentasi pada form SlotSync. Mohon konfirmasi pemesanan Anda:</p>
            
            <div class="slot-card">
              <div class="slot-row"><span class="slot-label">Hari & Tanggal:</span> <span class="slot-val">${slotDetails.hari}, ${slotDetails.tanggal}</span></div>
              <div class="slot-row"><span class="slot-label">Waktu:</span> <span class="slot-val">${slotDetails.jam} (Urutan #${slotDetails.urutan})</span></div>
              <div class="slot-row"><span class="slot-label">Kelas Teori:</span> <span class="slot-val">${slotDetails.kelasTeori}</span></div>
              <div class="slot-row"><span class="slot-label">Nama Kelompok:</span> <span class="slot-val">${slotDetails.namaKelompok}</span></div>
              <div class="slot-row"><span class="slot-label">ID Kelompok:</span> <span class="slot-val">${slotDetails.idKelompok}</span></div>
              <div class="slot-row"><span class="slot-label">Tema:</span> <span class="slot-val">${slotDetails.tema}</span></div>
            </div>

            <div class="btn-container">
              <a href="${confirmationLink}" target="_blank" class="btn">Konfirmasi & Simpan ke Spreadsheet</a>
            </div>

            <div class="warning-box">
              ⚠️ <strong>PENTING:</strong> Slot presentasi ini <strong>hanya ditahan selama 15 menit</strong>. Jika Anda tidak mengklik tombol konfirmasi di atas dalam waktu 15 menit, slot akan otomatis dilepas kembali dan data <strong>TIDAK</strong> akan dicatat ke Google Spreadsheet.
            </div>

            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Jika tombol di atas tidak dapat diklik, salin tautan berikut di browser Anda:<br/><a href="${confirmationLink}" style="word-break: break-all; color: #059669;">${confirmationLink}</a></p>
          </div>
          <div class="footer">
            Email otomatis dikirimkan oleh SlotSync • Jurusan Informatika UPN "Veteran" Yogyakarta
          </div>
        </div>
      </body>
      </html>
    `;

    let emailSent = false;
    let providerUsed = 'none';

    // 1. Try Resend if RESEND_API_KEY is configured
    if (process.env.RESEND_API_KEY) {
      try {
        const resendFrom = process.env.RESEND_FROM || 'SlotSync <onboarding@resend.dev>';
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [email],
            subject,
            html: htmlContent,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
          providerUsed = 'resend';
        } else {
          const errData = await resendRes.json().catch(() => ({}));
          console.warn('Resend API error:', errData);
        }
      } catch (resendErr) {
        console.warn('Failed to send via Resend:', resendErr);
      }
    }

    // 2. Try Nodemailer / Gmail SMTP if GMAIL_USER or SMTP_HOST is configured
    if (!emailSent && (process.env.GMAIL_USER || process.env.SMTP_HOST)) {
      try {
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport(
          process.env.GMAIL_USER
            ? {
                service: 'gmail',
                auth: {
                  user: process.env.GMAIL_USER,
                  pass: process.env.GMAIL_APP_PASSWORD,
                },
              }
            : {
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                },
              }
        );

        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.GMAIL_USER || '"SlotSync" <noreply@slotsync.app>',
          to: email,
          subject,
          html: htmlContent,
        });

        emailSent = true;
        providerUsed = 'smtp';
      } catch (smtpErr) {
        console.warn('Failed to send via SMTP:', smtpErr);
      }
    }

    console.log(`[Email Confirmation] Target: ${email}, Link: ${confirmationLink}, Sent: ${emailSent} (${providerUsed})`);

    res.json({
      success: true,
      emailSent,
      providerUsed,
      previewUrl: !emailSent ? confirmationLink : undefined,
      message: emailSent
        ? `Link konfirmasi berhasil dikirimkan ke ${email}.`
        : `Email berhasil disiapkan. (Gunakan tautan konfirmasi: ${confirmationLink})`,
    });
  } catch (error: unknown) {
    console.error('Error sending confirmation email:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Server error' });
  }
});

export default app;
