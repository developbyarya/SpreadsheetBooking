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

/**
 * Get effective Google OAuth access token:
 * 1. Primary: Google Service Account from GOOGLE_SERVICE_ACCOUNT_KEY env var (24/7)
 * 2. Fallback: Owner session token saved in memory
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
  return latestToken;
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
app.get('/api/forms', (_req: Request, res: Response) => {
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
      targetForm = Array.from(formsMap.values())[0];
    }

    if (!targetForm) {
      res.status(503).json({
        error: 'Belum ada jadwal form yang aktif. Silakan minta admin/dosen untuk login dan membuat link jadwal.',
      });
      return;
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

export default app;
