/**
 * Google Sheets API Integration Service for Presentation Booking
 * 
 * Supports user spreadsheet format starting at row 54:
 * Column A (1): Urutan
 * Column B (2): Hari
 * Column C (3): Tanggal
 * Column D (4): Jam
 * Column E (5): Kelas Teori   (Booking item)
 * Column F (6): Nama Kelompok (Booking item)
 * Column G (7): Tema          (Booking item)
 * Column H (8): ID_Kelompok   (Booking item)
 */

export interface PresentationSlot {
  rowNumber: number; // 1-indexed row in the sheet (>= 54)
  urutan: string; // Column A (Urutan / Sequence)
  hari: string; // Column B (Hari, e.g. "Senin", "Selasa")
  tanggal: string; // Column C (Tanggal, e.g. "2026-11-03" or "3 November 2026")
  jam: string; // Column D (Jam, e.g. "08:00 - 08:30")
  kelasTeori: string; // Column E (Kelas Teori)
  namaKelompok: string; // Column F (Nama Kelompok)
  tema: string; // Column G (Tema / Topik Presentasi)
  idKelompok: string; // Column H (ID_Kelompok)
  isBooked: boolean; // True if namaKelompok or idKelompok is not empty
}

export interface PresentationBookingPayload {
  kelasTeori: string;
  namaKelompok: string;
  tema: string;
  idKelompok: string;
}

export interface CustomForm {
  id: string; // Unique slug or code, e.g. "kelas-a", "kelas-b", "sheet-2"
  title: string; // Customizable form title
  description?: string; // Optional custom instructions
  sheetId: string; // Target Google Spreadsheet ID
  sheetName: string; // Target sheet tab, e.g. "Sheet1", "Sheet2", "Kelas A"
  startRow: number; // Row number where schedule starts (default: 54)
  createdAt: number;
}

export interface SpreadsheetConfig {
  id: string;
  title: string;
  url: string;
  activeSheetName: string;
  sheets: string[];
  startRow: number; // Defaults to 54
}

/**
 * Extracts a Spreadsheet ID from either a raw ID or full Google Sheets URL
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // If it's already an ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Fetch spreadsheet metadata to inspect sheets/tabs
 */
export async function getSpreadsheetDetails(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetConfig> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=properties.title,sheets.properties(sheetId,title)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `Failed to fetch spreadsheet (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const sheets: string[] = (data.sheets || []).map(
    (s: { properties?: { title?: string } }) => s.properties?.title || ''
  );

  // Pick first sheet or one containing "presentasi" / "jadwal" / "booking"
  let activeSheetName = sheets.find(
    (name) =>
      name.toLowerCase().includes('presentasi') ||
      name.toLowerCase().includes('jadwal') ||
      name.toLowerCase().includes('booking') ||
      name.toLowerCase().includes('slot')
  );
  if (!activeSheetName) {
    activeSheetName = sheets[0] || 'Sheet1';
  }

  return {
    id: cleanId,
    title: data.properties?.title || 'Jadwal Presentasi',
    url: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
    activeSheetName,
    sheets,
    startRow: 54, // User requirement: data starts at row 54
  };
}

/**
 * Read presentation slots from the spreadsheet starting at row startRow (default 54)
 */
export async function fetchPresentationSlots(
  accessToken: string,
  config: SpreadsheetConfig
): Promise<PresentationSlot[]> {
  const { id, activeSheetName, startRow = 54 } = config;

  // Read range A{startRow}:H (e.g. 'Sheet1'!A54:H500)
  // Also read headers if around row 53 to auto-confirm
  const encodedRange = encodeURIComponent(`'${activeSheetName}'!A${startRow}:H600`);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to read presentation schedule from sheet');
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  const slots: PresentationSlot[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const currentRowNumber = startRow + i;

    // Check if row has at least some content (Hari, Tanggal, or Jam or Urutan)
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

    // Determine if booked: if Nama Kelompok or ID_Kelompok is filled
    const isBooked = Boolean(namaKelompok || idKelompok);

    // Only include rows that have either date, day, or time defined
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

  return slots;
}

/**
 * Books a presentation slot by updating columns E:H (Kelas Teori, Nama Kelompok, Tema, ID_Kelompok)
 * for the specific rowNumber in the user's spreadsheet.
 */
export async function bookPresentationSlot(
  accessToken: string,
  config: SpreadsheetConfig,
  slot: PresentationSlot,
  booking: PresentationBookingPayload
): Promise<void> {
  const { id, activeSheetName } = config;
  const rowNumber = slot.rowNumber;

  // Columns E (5) to H (8): [Kelas Teori, Nama Kelompok, Tema, ID_Kelompok]
  const values = [
    [
      booking.kelasTeori.trim(),
      booking.namaKelompok.trim(),
      booking.tema.trim(),
      booking.idKelompok.trim(),
    ],
  ];

  const updateRange = encodeURIComponent(`'${activeSheetName}'!E${rowNumber}:H${rowNumber}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${updateRange}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to save presentation booking to Google Sheet');
  }
}

/**
 * Cancels a presentation booking by clearing columns E:H for that rowNumber
 */
export async function cancelPresentationBooking(
  accessToken: string,
  config: SpreadsheetConfig,
  slot: PresentationSlot
): Promise<void> {
  const { id, activeSheetName } = config;
  const rowNumber = slot.rowNumber;

  // Clear columns E:H
  const values = [['', '', '', '']];
  const updateRange = encodeURIComponent(`'${activeSheetName}'!E${rowNumber}:H${rowNumber}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${updateRange}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to cancel presentation booking in Google Sheet');
  }
}

/**
 * Adds a new presentation schedule row (prefills Urutan, Hari, Tanggal, Jam at next row)
 */
export async function addPresentationScheduleSlot(
  accessToken: string,
  config: SpreadsheetConfig,
  newSlot: {
    urutan: string;
    hari: string;
    tanggal: string;
    jam: string;
  }
): Promise<void> {
  const { id, activeSheetName } = config;
  const row = [
    newSlot.urutan,
    newSlot.hari,
    newSlot.tanggal,
    newSlot.jam,
    '',
    '',
    '',
    '',
  ];

  const range = encodeURIComponent(`'${activeSheetName}'!A:H`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to append presentation slot to Google Sheet');
  }
}

/**
 * Creates a template spreadsheet matching the exact user layout:
 * - Rows 1-52: Instructions & Course Info
 * - Row 53: Header [Urutan, Hari, Tanggal, Jam, Kelas Teori, Nama Kelompok, Tema, ID_Kelompok]
 * - Row 54+: Prefilled slots for presentations
 */
export async function createPresentationSpreadsheetTemplate(
  accessToken: string,
  customTitle?: string
): Promise<SpreadsheetConfig> {
  const title =
    customTitle?.trim() || `Jadwal Booking Presentasi (${new Date().toLocaleDateString()})`;

  // 1. Create spreadsheet with one sheet: "Jadwal Presentasi"
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'Jadwal Presentasi',
            gridProperties: {
              frozenRowCount: 53,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create presentation Google Sheet');
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;

  // Build rows 1 to 53:
  const rows: string[][] = [];

  // Row 1: Big Title
  rows.push(['JADWAL DAN BOOKING PRESENTASI KELOMPOK', '', '', '', '', '', '', '']);
  rows.push([
    'Petunjuk: Slot hari, tanggal, dan jam telah ditentukan. Silakan isi Kelas Teori, Nama Kelompok, Tema, dan ID_Kelompok mulai Baris 54.',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  // Rows 3 to 52: Empty or guidance rows
  for (let r = 3; r <= 52; r++) {
    if (r === 3) {
      rows.push(['Ketentuan:', '', '', '', '', '', '', '']);
    } else if (r === 4) {
      rows.push(['1. Durasi tiap sesi presentasi 30 - 45 menit.', '', '', '', '', '', '', '']);
    } else if (r === 5) {
      rows.push(['2. Setiap kelompok hanya dapat memilih 1 slot yang masih kosong.', '', '', '', '', '', '', '']);
    } else if (r === 6) {
      rows.push(['3. Pastikan memasukkan ID_Kelompok dan Tema dengan benar.', '', '', '', '', '', '', '']);
    } else {
      rows.push(['', '', '', '', '', '', '', '']);
    }
  }

  // Row 53: EXACT HEADERS requested by user
  rows.push([
    'Urutan',
    'Hari',
    'Tanggal',
    'Jam',
    'Kelas Teori',
    'Nama Kelompok',
    'Tema',
    'ID_Kelompok',
  ]);

  // Row 54+: Sample presentation sessions
  const sampleSessions = [
    { urutan: '1', hari: 'Senin', tanggal: '2026-11-09', jam: '08:00 - 08:45' },
    { urutan: '2', hari: 'Senin', tanggal: '2026-11-09', jam: '09:00 - 09:45' },
    { urutan: '3', hari: 'Senin', tanggal: '2026-11-09', jam: '10:00 - 10:45' },
    { urutan: '4', hari: 'Senin', tanggal: '2026-11-09', jam: '13:00 - 13:45' },
    { urutan: '5', hari: 'Senin', tanggal: '2026-11-09', jam: '14:00 - 14:45' },
    { urutan: '6', hari: 'Selasa', tanggal: '2026-11-10', jam: '08:00 - 08:45' },
    { urutan: '7', hari: 'Selasa', tanggal: '2026-11-10', jam: '09:00 - 09:45' },
    { urutan: '8', hari: 'Selasa', tanggal: '2026-11-10', jam: '10:00 - 10:45' },
    { urutan: '9', hari: 'Selasa', tanggal: '2026-11-10', jam: '13:00 - 13:45' },
    { urutan: '10', hari: 'Selasa', tanggal: '2026-11-10', jam: '14:00 - 14:45' },
    { urutan: '11', hari: 'Rabu', tanggal: '2026-11-11', jam: '08:00 - 08:45' },
    { urutan: '12', hari: 'Rabu', tanggal: '2026-11-11', jam: '09:00 - 09:45' },
    { urutan: '13', hari: 'Rabu', tanggal: '2026-11-11', jam: '10:00 - 10:45' },
    { urutan: '14', hari: 'Kamis', tanggal: '2026-11-12', jam: '08:00 - 08:45' },
    { urutan: '15', hari: 'Kamis', tanggal: '2026-11-12', jam: '09:00 - 09:45' },
  ];

  sampleSessions.forEach((s) => {
    rows.push([s.urutan, s.hari, s.tanggal, s.jam, '', '', '', '']);
  });

  // Batch update sheet values
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Jadwal Presentasi'!A1:H${rows.length}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  // Format header row 53 (0-indexed 52)
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 52,
                endRowIndex: 53,
                startColumnIndex: 0,
                endColumnIndex: 8,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.058, green: 0.462, blue: 0.431 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 10,
                  },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
        ],
      }),
    }
  );

  return {
    id: spreadsheetId,
    title,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    activeSheetName: 'Jadwal Presentasi',
    sheets: ['Jadwal Presentasi'],
    startRow: 54,
  };
}
