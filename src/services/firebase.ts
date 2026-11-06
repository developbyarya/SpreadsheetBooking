import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { CustomForm } from './sheets';

// Define the exact scopes required for Google Sheets integration
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();
// Request Google Workspace scopes for spreadsheets and drive files
SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to track interactive sign-in flow
let isSigningIn = false;
// In-memory access token cache (NEVER persisted to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

/**
 * Initialize auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token not in memory; user needs to interactively sign in or re-auth
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Sign in with Google popup and obtain access token
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google access token from sign-in');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google sign in error:', error);
    if (error?.code === 'auth/unauthorized-domain') {
      throw new Error(
        'Domain localhost belum didaftarkan di Firebase Console. Buka Firebase Console > Authentication > Settings > Authorized domains, lalu tambahkan "localhost".'
      );
    }
    if (error?.code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google Sign-in belum diaktifkan. Buka Firebase Console > Authentication > Sign-in method, lalu aktifkan Google provider.'
      );
    }
    if (error?.code === 'auth/popup-blocked') {
      throw new Error(
        'Pop-up login diblokir oleh browser. Silakan izinkan pop-up untuk situs localhost ini.'
      );
    }
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('Jendela login ditutup sebelum proses selesai.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get current in-memory access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Update cached access token in memory (e.g. after refresh)
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/**
 * Sign out and clear in-memory token
 */
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Save or update custom form in Firestore ('forms' collection)
 */
export const saveFormToFirestore = async (form: CustomForm, ownerId?: string): Promise<void> => {
  const formRef = doc(db, 'forms', form.id);
  const data: Record<string, any> = {
    id: form.id,
    title: form.title || 'Jadwal Presentasi',
    description: form.description || '',
    sheetId: form.sheetId,
    sheetName: form.sheetName || 'Sheet1',
    startRow: Number(form.startRow) || 54,
    createdAt: form.createdAt || Date.now(),
    updatedAt: Date.now(),
    isClosed: Boolean(form.isClosed),
    closedAt: typeof form.closedAt === 'number' ? form.closedAt : null,
    openAt: typeof form.openAt === 'number' ? form.openAt : null,
    closedMessage: form.closedMessage || '',
    ...(ownerId ? { ownerId } : {}),
  };
  await setDoc(formRef, data, { merge: true });
};

/**
 * Fetch all custom forms from Firestore ('forms' collection)
 */
export const fetchFormsFromFirestore = async (): Promise<CustomForm[]> => {
  try {
    const formsCol = collection(db, 'forms');
    const q = query(formsCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const forms: CustomForm[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      forms.push({
        id: docSnap.id,
        title: data.title || 'Jadwal Presentasi',
        description: data.description || '',
        sheetId: data.sheetId || '',
        sheetName: data.sheetName || 'Sheet1',
        startRow: Number(data.startRow) || 54,
        createdAt: Number(data.createdAt) || Date.now(),
        closedAt: typeof data.closedAt === 'number' ? data.closedAt : data.closedAt ? Number(data.closedAt) : null,
        openAt: typeof data.openAt === 'number' ? data.openAt : data.openAt ? Number(data.openAt) : null,
        isClosed: Boolean(data.isClosed),
        closedMessage: data.closedMessage || '',
      });
    });
    return forms;
  } catch (err) {
    console.warn('Query with orderBy failed, falling back to basic collection get:', err);
    try {
      const formsCol = collection(db, 'forms');
      const snapshot = await getDocs(formsCol);
      const forms: CustomForm[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        forms.push({
          id: docSnap.id,
          title: data.title || 'Jadwal Presentasi',
          description: data.description || '',
          sheetId: data.sheetId || '',
          sheetName: data.sheetName || 'Sheet1',
          startRow: Number(data.startRow) || 54,
          createdAt: Number(data.createdAt) || Date.now(),
          closedAt: typeof data.closedAt === 'number' ? data.closedAt : data.closedAt ? Number(data.closedAt) : null,
          openAt: typeof data.openAt === 'number' ? data.openAt : data.openAt ? Number(data.openAt) : null,
          isClosed: Boolean(data.isClosed),
          closedMessage: data.closedMessage || '',
        });
      });
      return forms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (fallbackErr) {
      console.error('Error fetching forms from Firestore:', fallbackErr);
      return [];
    }
  }
};

/**
 * Fetch a single form by ID (slug) from Firestore
 */
export const fetchFormByIdFromFirestore = async (formId: string): Promise<CustomForm | null> => {
  try {
    const formRef = doc(db, 'forms', formId);
    const docSnap = await getDoc(formRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        title: data.title || 'Jadwal Presentasi',
        description: data.description || '',
        sheetId: data.sheetId || '',
        sheetName: data.sheetName || 'Sheet1',
        startRow: Number(data.startRow) || 54,
        createdAt: Number(data.createdAt) || Date.now(),
        closedAt: typeof data.closedAt === 'number' ? data.closedAt : data.closedAt ? Number(data.closedAt) : null,
        openAt: typeof data.openAt === 'number' ? data.openAt : data.openAt ? Number(data.openAt) : null,
        isClosed: Boolean(data.isClosed),
        closedMessage: data.closedMessage || '',
      };
    }
    return null;
  } catch (err) {
    console.error(`Error fetching form ${formId} from Firestore:`, err);
    return null;
  }
};

/**
 * Real-time listener for a form from Firestore
 */
export const subscribeToFormFromFirestore = (
  formId: string,
  onUpdate: (form: CustomForm | null) => void
) => {
  try {
    const formRef = doc(db, 'forms', formId);
    return onSnapshot(
      formRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          onUpdate({
            id: docSnap.id,
            title: data.title || 'Jadwal Presentasi',
            description: data.description || '',
            sheetId: data.sheetId || '',
            sheetName: data.sheetName || 'Sheet1',
            startRow: Number(data.startRow) || 54,
            createdAt: Number(data.createdAt) || Date.now(),
            closedAt: typeof data.closedAt === 'number' ? data.closedAt : data.closedAt ? Number(data.closedAt) : null,
            openAt: typeof data.openAt === 'number' ? data.openAt : data.openAt ? Number(data.openAt) : null,
            isClosed: Boolean(data.isClosed),
            closedMessage: data.closedMessage || '',
          });
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        console.warn(`Firestore subscription to form ${formId} note:`, err);
      }
    );
  } catch (err) {
    console.warn('Failed to setup Firestore onSnapshot:', err);
    return () => {};
  }
};

/**
 * Delete a form document from Firestore
 */
export const deleteFormFromFirestore = async (formId: string): Promise<void> => {
  const formRef = doc(db, 'forms', formId);
  await deleteDoc(formRef);
};

/**
 * Save active session token to Firestore so public visitors can load and book slots
 */
export const saveSessionTokenToFirestore = async (
  sheetId: string,
  token: string,
  ownerId?: string
): Promise<void> => {
  try {
    const sessionData = {
      sheetId,
      accessToken: token,
      updatedAt: Date.now(),
      ...(ownerId ? { ownerId } : {}),
    };
    await setDoc(doc(db, 'sessions', sheetId), sessionData, { merge: true });
    await setDoc(doc(db, 'sessions', 'latest'), sessionData, { merge: true });
  } catch (err) {
    console.warn('Could not save session token to Firestore:', err);
  }
};

/**
 * Fetch active session token for a spreadsheet from Firestore
 */
export const fetchSessionTokenFromFirestore = async (sheetId?: string): Promise<string | null> => {
  try {
    if (sheetId) {
      const snap = await getDoc(doc(db, 'sessions', sheetId));
      if (snap.exists() && snap.data()?.accessToken) {
        return snap.data().accessToken;
      }
    }
    const latestSnap = await getDoc(doc(db, 'sessions', 'latest'));
    if (latestSnap.exists() && latestSnap.data()?.accessToken) {
      return latestSnap.data().accessToken;
    }
  } catch (err) {
    console.warn('Could not fetch session token from Firestore:', err);
  }
  return null;
};

export interface BookingRecord {
  id: string; // `${cleanSheetId}_${sheetName}_row${rowNumber}`
  formId?: string;
  sheetId: string;
  sheetName: string;
  rowNumber: number;
  urutan: string;
  hari: string;
  tanggal: string;
  jam: string;
  kelasTeori: string;
  namaKelompok: string;
  tema: string;
  idKelompok: string;
  email?: string;
  room?: 1 | 2; // Room 1 (Cols E:H) or Room 2 (Cols I:L)
  bookedAt: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  confirmToken?: string;
  expiresAt?: number; // timestamp 15 minutes from creation
  confirmedAt?: number;
  bookedByAdmin?: boolean;
}

export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
  angkatan?: string;
  nomorUrut?: number;
}

/**
 * Validate UPN Informatika student email format and rules:
 * Pattern: 123xxxxxx@student.upnyk.ac.id (9-digit NIM)
 * - 123 = Jurusan Informatika
 * - Digit 4-5 = Angkatan (tidak boleh '00')
 * - Digit 6 = Kode jenjang (1 digit angka)
 * - 3 Digit Terakhir = Nomor urut (tidak boleh '000' dan harus lebih kecil dari 300, yaitu 001 - 299)
 * Contoh valid: 123230089@student.upnyk.ac.id
 */
export const validateUpnInformatikaEmail = (
  email: string,
  bypassMode = false
): EmailValidationResult => {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) {
    return { isValid: false, error: 'Email mahasiswa wajib diisi.' };
  }

  if (bypassMode || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMAIL_BYPASS === 'true')) {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    return {
      isValid: valid,
      error: valid ? undefined : 'Format email tidak valid (contoh: user@example.com).',
    };
  }

  const match = clean.match(/^123(\d{2})(\d)(\d{3})@student\.upnyk\.ac\.id$/);
  if (!match) {
    return {
      isValid: false,
      error: 'Format email harus 123xxxxxx@student.upnyk.ac.id (9 digit NIM Informatika, contoh: 123230089@student.upnyk.ac.id).',
    };
  }

  const [, angkatan, , last3] = match;

  if (angkatan === '00') {
    return {
      isValid: false,
      error: 'Digit ke 4-5 (angkatan) tidak boleh 00 (contoh yang benar: 123230089@student.upnyk.ac.id).',
    };
  }

  if (last3 === '000') {
    return {
      isValid: false,
      error: '3 digit terakhir nomor urut mahasiswa tidak boleh 000.',
    };
  }

  const last3Num = parseInt(last3, 10);
  if (last3Num >= 300) {
    return {
      isValid: false,
      error: `3 digit terakhir nomor urut (${last3}) harus lebih kecil dari 300 (maksimal 299).`,
    };
  }

  return {
    isValid: true,
    angkatan,
    nomorUrut: last3Num,
  };
};

/**
 * Validate UPN Informatika student email format boolean helper
 */
export const isValidUpnInformatikaEmail = (email: string, bypassMode = false): boolean => {
  return validateUpnInformatikaEmail(email, bypassMode).isValid;
};

export const getBookingDocId = (sheetId: string, sheetName: string, rowNumber: number, room: 1 | 2 = 1): string => {
  const cleanSheet = (sheetId || '').trim();
  const cleanTab = (sheetName || 'Sheet1').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${cleanSheet}_${cleanTab}_row${rowNumber}_room${room}`;
};

/**
 * Check if a booking is active (either confirmed, or pending within 15 min expiration)
 */
export const isBookingActive = (booking: BookingRecord): boolean => {
  if (booking.status === 'confirmed') return true;
  if (booking.status === 'pending') {
    return Boolean(booking.expiresAt && Date.now() < booking.expiresAt);
  }
  return false;
};

/**
 * Create a 15-minute temporary pending hold on a slot in Firestore.
 * Supports auto-fallback between Room 1 and Room 2.
 */
export const createPendingBookingHold = async (
  booking: Omit<BookingRecord, 'id' | 'bookedAt' | 'status' | 'confirmToken' | 'expiresAt'>
): Promise<{
  success: boolean;
  bookingId: string;
  confirmToken?: string;
  expiresAt?: number;
  room?: 1 | 2;
  error?: string;
}> => {
  try {
    const allBookings = await fetchBookingsFromFirestore(booking.sheetId, booking.sheetName);
    const now = Date.now();

    // 1. Determine target room: use booking.room if passed, else auto-detect
    let targetRoom: 1 | 2 = booking.room === 2 ? 2 : 1;
    const cleanSheet = (booking.sheetId || '').trim();
    const cleanTab = (booking.sheetName || 'Sheet1').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
    const legacyDocId = `${cleanSheet}_${cleanTab}_row${booking.rowNumber}`;

    // Check existing bookings on this row in Firestore
    const rowBookings = allBookings.filter((b) => b.rowNumber === booking.rowNumber && b.status !== 'cancelled' && isBookingActive(b));
    const isR1Taken = rowBookings.some((b) => (b.room === 1 || !b.room || b.id.endsWith('_room1') || b.id === legacyDocId));
    const isR2Taken = rowBookings.some((b) => (b.room === 2 || b.id.endsWith('_room2')));

    if (targetRoom === 1 && isR1Taken) {
      if (!isR2Taken) {
        // Auto-switch to Room 2
        targetRoom = 2;
      } else {
        return {
          success: false,
          bookingId: '',
          error: `Kedua ruangan (Room 1 & Room 2) pada sesi waktu ini sudah penuh atau sedang di-hold. Silakan pilih sesi lain.`,
        };
      }
    } else if (targetRoom === 2 && isR2Taken) {
      if (!isR1Taken) {
        targetRoom = 1;
      } else {
        return {
          success: false,
          bookingId: '',
          error: `Kedua ruangan pada sesi waktu ini sudah penuh. Silakan pilih sesi lain.`,
        };
      }
    }

    const docId = getBookingDocId(booking.sheetId, booking.sheetName, booking.rowNumber, targetRoom);
    const bookingRef = doc(db, 'bookings', docId);

    // 2. Uniqueness Validations across all bookings
    const cleanEmail = (booking.email || '').trim().toLowerCase();
    const cleanId = (booking.idKelompok || '').trim().toLowerCase();

    // Rule 1: Email hanya boleh digunakan sekali
    if (cleanEmail) {
      const emailConflict = allBookings.find((b) => {
        if (b.rowNumber === booking.rowNumber && (b.room === targetRoom || b.id === docId)) return false;
        if (!isBookingActive(b)) return false;
        const bEmail = (b.email || '').trim().toLowerCase();
        return bEmail === cleanEmail;
      });

      if (emailConflict) {
        return {
          success: false,
          bookingId: docId,
          error: `Email "${booking.email}" sudah digunakan untuk booking jadwal presentasi (Kelompok ${emailConflict.namaKelompok || 'lain'}, Urutan #${emailConflict.urutan || emailConflict.rowNumber}). Satu email hanya boleh digunakan satu kali.`,
        };
      }
    }

    // Rule 2: ID hanya boleh muncul satu kali
    if (cleanId) {
      const idConflict = allBookings.find((b) => {
        if (b.rowNumber === booking.rowNumber && (b.room === targetRoom || b.id === docId)) return false;
        if (!isBookingActive(b)) return false;
        const bId = (b.idKelompok || '').trim().toLowerCase();
        return bId === cleanId;
      });

      if (idConflict) {
        return {
          success: false,
          bookingId: docId,
          error: `ID Kelompok "${booking.idKelompok}" sudah terdaftar pada jadwal (Kelompok ${idConflict.namaKelompok || 'lain'}, Urutan #${idConflict.urutan || idConflict.rowNumber}). Setiap ID Kelompok hanya boleh mendaftar satu kali.`,
        };
      }
    }

    // Generate random confirmation token and 15-minute expiration
    const confirmToken = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes from now

    const data: BookingRecord = {
      ...booking,
      room: targetRoom,
      id: docId,
      status: 'pending',
      confirmToken,
      expiresAt,
      bookedAt: Date.now(),
    };

    // 3. ATOMIC TRANSACTION: Prevent race condition if two users click hold at the exact same millisecond
    await runTransaction(db, async (transaction) => {
      const currentDoc = await transaction.get(bookingRef);
      if (currentDoc.exists()) {
        const existingData = currentDoc.data() as BookingRecord;
        // If document exists and is currently active (confirmed or pending and not expired)
        if (existingData.status === 'confirmed') {
          throw new Error(`Ruangan ${targetRoom === 2 ? 'Room 2' : 'Room 1'} pada sesi ini baru saja dikonfirmasi oleh kelompok lain.`);
        }
        if (existingData.status === 'pending' && existingData.expiresAt && Date.now() < existingData.expiresAt) {
          // If held by another user/token
          if (existingData.confirmToken !== confirmToken) {
            throw new Error(`Ruangan ${targetRoom === 2 ? 'Room 2' : 'Room 1'} pada sesi ini sedang di-hold oleh kelompok lain.`);
          }
        }
      }
      transaction.set(bookingRef, data, { merge: true });
    });

    return {
      success: true,
      bookingId: docId,
      confirmToken,
      expiresAt,
      room: targetRoom,
    };
  } catch (err) {
    console.error('Error creating pending booking hold in Firestore:', err);
    return {
      success: false,
      bookingId: '',
      error: err instanceof Error ? err.message : 'Gagal membuat reservasi sementara di database.',
    };
  }
};

/**
 * Verify token and mark booking as confirmed in Firestore
 */
export const verifyAndConfirmBookingInFirestore = async (
  bookingId: string,
  token: string
): Promise<{
  success: boolean;
  booking?: BookingRecord;
  alreadyConfirmed?: boolean;
  expired?: boolean;
  error?: string;
}> => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    // Atomic Transaction for confirmation: Ensure only 1 confirmer can flip status to confirmed
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(bookingRef);

      if (!snap.exists()) {
        return {
          success: false,
          error: 'Data booking tidak ditemukan atau telah dihapus.',
        };
      }

      const booking = snap.data() as BookingRecord;

      // Check if already confirmed
      if (booking.status === 'confirmed') {
        return {
          success: true,
          booking,
          alreadyConfirmed: true,
        };
      }

      // Check token matching
      if (!booking.confirmToken || booking.confirmToken !== token) {
        return {
          success: false,
          error: 'Token verifikasi email tidak valid atau sudah tidak berlaku.',
        };
      }

      // Check 15-minute expiration
      if (booking.expiresAt && Date.now() > booking.expiresAt) {
        transaction.delete(bookingRef);
        return {
          success: false,
          expired: true,
          error: 'Masa berlaku konfirmasi telah berakhir (lebih dari 15 menit). Slot telah dilepas kembali agar dapat dipilih mahasiswa lain.',
        };
      }

      // Confirm booking - preserve confirmToken so future visits with the same email link can be recognized
      const confirmedData: Partial<BookingRecord> = {
        status: 'confirmed',
        confirmedAt: Date.now(),
      };

      transaction.set(bookingRef, confirmedData, { merge: true });

      return {
        success: true,
        booking: { ...booking, ...confirmedData },
        alreadyConfirmed: false,
      };
    });
  } catch (err) {
    console.error('Error verifying booking token in Firestore:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal memverifikasi konfirmasi booking.',
    };
  }
};

/**
 * Real-time listener for booking status changes (e.g. pending -> confirmed)
 */
export const subscribeToBookingStatus = (
  bookingId: string,
  onStatusChange: (booking: BookingRecord) => void,
  onError?: (err: Error) => void
): (() => void) => {
  const bookingRef = doc(db, 'bookings', bookingId);
  return onSnapshot(
    bookingRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as BookingRecord;
        onStatusChange(data);
      }
    },
    (err) => {
      console.warn('Booking status subscription warning:', err);
      if (onError) onError(err);
    }
  );
};

/**
 * Fetch booking record by ID
 */
export const getBookingById = async (bookingId: string): Promise<BookingRecord | null> => {
  try {
    const snap = await getDoc(doc(db, 'bookings', bookingId));
    if (snap.exists()) {
      return snap.data() as BookingRecord;
    }
  } catch (err) {
    console.warn(`Error fetching booking ${bookingId}:`, err);
  }
  return null;
};

/**
 * Save booking redundancy to Firestore ('bookings' collection)
 */
export const saveBookingToFirestore = async (
  booking: Omit<BookingRecord, 'id' | 'bookedAt' | 'status'> & {
    status?: 'pending' | 'confirmed' | 'cancelled';
    room?: 1 | 2;
  }
): Promise<void> => {
  try {
    const targetRoom = booking.room === 2 ? 2 : 1;
    const docId = getBookingDocId(booking.sheetId, booking.sheetName, booking.rowNumber, targetRoom);
    const bookingRef = doc(db, 'bookings', docId);
    const data: BookingRecord = {
      ...booking,
      room: targetRoom,
      id: docId,
      status: booking.status || 'confirmed',
      bookedAt: Date.now(),
    };
    await setDoc(bookingRef, data, { merge: true });
  } catch (err) {
    console.warn('Error saving booking redundancy to Firestore:', err);
  }
};

/**
 * Mark booking as cancelled/deleted in Firestore redundancy
 */
export const cancelBookingInFirestore = async (
  sheetId: string,
  sheetName: string,
  rowNumber: number,
  room?: 1 | 2
): Promise<void> => {
  try {
    if (room) {
      const docId = getBookingDocId(sheetId, sheetName, rowNumber, room);
      await deleteDoc(doc(db, 'bookings', docId)).catch(() => {});
    } else {
      const r1 = getBookingDocId(sheetId, sheetName, rowNumber, 1);
      const r2 = getBookingDocId(sheetId, sheetName, rowNumber, 2);
      const cleanSheet = (sheetId || '').trim();
      const cleanTab = (sheetName || 'Sheet1').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
      const legacy = `${cleanSheet}_${cleanTab}_row${rowNumber}`;
      await Promise.all([
        deleteDoc(doc(db, 'bookings', r1)).catch(() => {}),
        deleteDoc(doc(db, 'bookings', r2)).catch(() => {}),
        deleteDoc(doc(db, 'bookings', legacy)).catch(() => {}),
      ]);
    }
  } catch (err) {
    console.warn('Error cancelling booking in Firestore:', err);
  }
};

/**
 * Fetch redundancy bookings from Firestore
 */
export const fetchBookingsFromFirestore = async (
  sheetId: string,
  sheetName?: string
): Promise<BookingRecord[]> => {
  try {
    const bookingsCol = collection(db, 'bookings');
    const snapshot = await getDocs(bookingsCol);
    const records: BookingRecord[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as BookingRecord;
      if (data.sheetId === sheetId && (!sheetName || data.sheetName === sheetName)) {
        records.push(data);
      }
    });
    return records;
  } catch (err) {
    console.warn('Error fetching bookings from Firestore:', err);
    return [];
  }
};
