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
  const data = {
    ...form,
    createdAt: form.createdAt || Date.now(),
    updatedAt: Date.now(),
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
        createdAt: data.createdAt || Date.now(),
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
          createdAt: data.createdAt || Date.now(),
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
        createdAt: data.createdAt || Date.now(),
      };
    }
    return null;
  } catch (err) {
    console.error(`Error fetching form ${formId} from Firestore:`, err);
    return null;
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
  bookedAt: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  confirmToken?: string;
  expiresAt?: number; // timestamp 15 minutes from creation
  confirmedAt?: number;
  bookedByAdmin?: boolean;
}

/**
 * Validate UPN Informatika student email format:
 * Pattern: 123xxxxxx@student.upnyk.ac.id
 * 123 = Jurusan Informatika
 * xxxxxx = 6 digit NIM (Angkatan & Nomor Urut Mahasiswa)
 */
export const isValidUpnInformatikaEmail = (email: string, bypassMode = false): boolean => {
  const clean = (email || '').trim().toLowerCase();
  if (bypassMode || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMAIL_BYPASS === 'true')) {
    // In bypass mode, accept any valid email address format
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }
  return /^123\d{6}@student\.upnyk\.ac\.id$/i.test(clean);
};

export const getBookingDocId = (sheetId: string, sheetName: string, rowNumber: number): string => {
  const cleanSheet = (sheetId || '').trim();
  const cleanTab = (sheetName || 'Sheet1').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${cleanSheet}_${cleanTab}_row${rowNumber}`;
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
 * Prevents race conditions and duplicates before email confirmation.
 */
export const createPendingBookingHold = async (
  booking: Omit<BookingRecord, 'id' | 'bookedAt' | 'status' | 'confirmToken' | 'expiresAt'>
): Promise<{
  success: boolean;
  bookingId: string;
  confirmToken?: string;
  expiresAt?: number;
  error?: string;
}> => {
  try {
    const docId = getBookingDocId(booking.sheetId, booking.sheetName, booking.rowNumber);
    const bookingRef = doc(db, 'bookings', docId);

    // Check existing booking doc
    const existingSnap = await getDoc(bookingRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as BookingRecord;
      if (existing.status === 'confirmed') {
        return {
          success: false,
          bookingId: docId,
          error: `Slot ini telah resmi dibooking oleh ${existing.namaKelompok}. Silakan pilih slot lain.`,
        };
      }
      if (existing.status === 'pending' && existing.expiresAt && Date.now() < existing.expiresAt) {
        // Still within 15 min hold by another user
        const remainingSeconds = Math.ceil((existing.expiresAt - Date.now()) / 1000);
        const remainingMins = Math.ceil(remainingSeconds / 60);
        return {
          success: false,
          bookingId: docId,
          error: `Slot ini sedang ditahan sementara oleh kelompok lain (menunggu konfirmasi email, sisa ~${remainingMins} menit).`,
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
      id: docId,
      status: 'pending',
      confirmToken,
      expiresAt,
      bookedAt: Date.now(),
    };

    await setDoc(bookingRef, data, { merge: true });

    return {
      success: true,
      bookingId: docId,
      confirmToken,
      expiresAt,
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
    const snap = await getDoc(bookingRef);

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
      // Mark as cancelled or delete
      await deleteDoc(bookingRef).catch(() => {});
      return {
        success: false,
        expired: true,
        error: 'Masa berlaku konfirmasi telah berakhir (lebih dari 15 menit). Slot telah dilepas kembali agar dapat dipilih mahasiswa lain.',
      };
    }

    // Confirm booking
    const confirmedData: Partial<BookingRecord> = {
      status: 'confirmed',
      confirmedAt: Date.now(),
      confirmToken: '', // Clear token
    };

    await setDoc(bookingRef, confirmedData, { merge: true });

    return {
      success: true,
      booking: { ...booking, ...confirmedData },
    };
  } catch (err) {
    console.error('Error verifying booking token in Firestore:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal memverifikasi konfirmasi booking.',
    };
  }
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
  }
): Promise<void> => {
  try {
    const docId = getBookingDocId(booking.sheetId, booking.sheetName, booking.rowNumber);
    const bookingRef = doc(db, 'bookings', docId);
    const data: BookingRecord = {
      ...booking,
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
  rowNumber: number
): Promise<void> => {
  try {
    const docId = getBookingDocId(sheetId, sheetName, rowNumber);
    const bookingRef = doc(db, 'bookings', docId);
    await deleteDoc(bookingRef);
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
