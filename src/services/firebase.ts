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
  bookedAt: number;
  status: 'confirmed' | 'cancelled';
  bookedByAdmin?: boolean;
}

export const getBookingDocId = (sheetId: string, sheetName: string, rowNumber: number): string => {
  const cleanSheet = (sheetId || '').trim();
  const cleanTab = (sheetName || 'Sheet1').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${cleanSheet}_${cleanTab}_row${rowNumber}`;
};

/**
 * Save booking redundancy to Firestore ('bookings' collection)
 */
export const saveBookingToFirestore = async (
  booking: Omit<BookingRecord, 'id' | 'bookedAt' | 'status'> & {
    status?: 'confirmed' | 'cancelled';
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
