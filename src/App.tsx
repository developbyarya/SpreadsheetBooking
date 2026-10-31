/**
 * SlotSync - Presentation Schedule Booking App
 * Specifically designed for Presentation Booking starting at Row 54:
 * Columns: Urutan, Hari, Tanggal, Jam, Kelas Teori, Nama Kelompok, Tema, ID_Kelompok
 * 
 * Features:
 * - Each spreadsheet / tab has its own unique customizable link (e.g. ?form=kelas-a)
 * - Customizable title & instructions per form
 * - Owner can generate multiple forms for one link or different sheets (Sheet 1, Sheet 2, etc.)
 * - Booking does NOT require login; login is for admin / owner only!
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  setCachedAccessToken,
  saveFormToFirestore,
  fetchFormsFromFirestore,
  fetchFormByIdFromFirestore,
  deleteFormFromFirestore,
  saveSessionTokenToFirestore,
  fetchSessionTokenFromFirestore,
} from './services/firebase';
import {
  PresentationSlot,
  PresentationBookingPayload,
  SpreadsheetConfig,
  CustomForm,
  getSpreadsheetDetails,
  createPresentationSpreadsheetTemplate,
  fetchPresentationSlots,
  bookPresentationSlot,
  cancelPresentationBooking,
  addPresentationScheduleSlot,
} from './services/sheets';
import { Header } from './components/Header';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SpreadsheetPicker } from './components/SpreadsheetPicker';
import { ShareLinkModal } from './components/ShareLinkModal';
import { FormManagerModal } from './components/FormManagerModal';
import { StepBookingForm } from './components/StepBookingForm';
import { BookingView } from './components/BookingView';
import { ManagerView } from './components/ManagerView';
import {
  FileSpreadsheet,
  PlusCircle,
  AlertCircle,
  Loader2,
  Lock,
  Layers,
  Clock,
  BookOpen,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const STORAGE_KEY_SHEET_ID = 'slotsync_presentation_sheet_id';
const STORAGE_KEY_START_ROW = 'slotsync_presentation_start_row';
const STORAGE_KEY_FORMS = 'slotsync_custom_forms_list';

export default function App() {
  // Auth state (Admin / Owner only)
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Active view: 'booking' or 'manager'
  const [activeTab, setActiveTab] = useState<'booking' | 'manager'>('booking');
  const [useStepForm, setUseStepForm] = useState<boolean>(true);

  // Spreadsheet config & data state
  const [config, setConfig] = useState<SpreadsheetConfig | null>(null);
  const [slots, setSlots] = useState<PresentationSlot[]>([]);
  const [forms, setForms] = useState<CustomForm[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FORMS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Current active form metadata (for custom title & tab)
  const [activeFormItem, setActiveFormItem] = useState<CustomForm | null>(null);

  // Modals state
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFormManagerModalOpen, setIsFormManagerModalOpen] = useState(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Workspace safety confirmation dialog state
  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    details?: Array<{ label: string; value: string }>;
    confirmButtonText?: string;
    confirmButtonVariant?: 'primary' | 'danger';
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {},
  });
  const [isExecutingMutation, setIsExecutingMutation] = useState(false);

  // Load registered forms from Firestore (with fallback to backend/localStorage)
  const loadFormsFromServer = useCallback(async () => {
    try {
      // 1. First attempt: Firestore
      const firestoreForms = await fetchFormsFromFirestore();
      if (firestoreForms && firestoreForms.length > 0) {
        setForms(firestoreForms);
        localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(firestoreForms));
        return firestoreForms;
      }

      // 2. Fallback attempt: Backend /api/forms
      const res = await fetch('/api/forms');
      if (res.ok) {
        const data = await res.json();
        if (data.forms && data.forms.length > 0) {
          setForms(data.forms);
          localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(data.forms));
          return data.forms;
        }
      }
    } catch (e) {
      console.warn('Could not load forms:', e);
    }
  }, []);

  // Save or update a form to Firestore, backend & localStorage
  const handleSaveForm = async (newForm: CustomForm) => {
    // 1. Save to Firestore
    try {
      await saveFormToFirestore(newForm, user?.uid);
    } catch (e) {
      console.warn('Firestore save warning:', e);
    }

    // 2. Sync to backend
    try {
      await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
    } catch (e) {
      console.warn('Backend sync warning:', e);
    }

    // 3. Update local state
    setForms((prev) => {
      const filtered = prev.filter((f) => f.id !== newForm.id);
      const updated = [newForm, ...filtered];
      localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(updated));
      return updated;
    });

    // If currently on this form, update config
    if (config && config.id === newForm.sheetId) {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              activeSheetName: newForm.sheetName,
              startRow: newForm.startRow,
            }
          : null
      );
    }
  };

  // Delete a form from Firestore, backend & localStorage
  const handleDeleteForm = async (formId: string) => {
    try {
      await deleteFormFromFirestore(formId);
    } catch (e) {
      console.warn('Firestore delete warning:', e);
    }
    await fetch(`/api/forms/${formId}`, { method: 'DELETE' }).catch(() => {});
    setForms((prev) => {
      const updated = prev.filter((f) => f.id !== formId);
      localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(updated));
      return updated;
    });
  };

  // Sync owner token with backend & ensure default form in Firestore
  const syncSessionWithBackend = useCallback(
    async (token: string, sheetConfig: SpreadsheetConfig) => {
      try {
        // Save session token to Firestore so public visitors can load and book slots
        await saveSessionTokenToFirestore(sheetConfig.id, token, user?.uid);

        await fetch('/api/owner-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetId: sheetConfig.id,
            activeSheetName: sheetConfig.activeSheetName,
            startRow: sheetConfig.startRow,
            accessToken: token,
            title: sheetConfig.title,
            url: sheetConfig.url,
          }),
        }).catch(() => {});

        // Ensure default form exists in Firestore & backend
        const defaultForm: CustomForm = {
          id: 'default',
          title: sheetConfig.title || 'Jadwal Presentasi',
          sheetId: sheetConfig.id,
          sheetName: sheetConfig.activeSheetName || 'Sheet1',
          startRow: sheetConfig.startRow || 54,
          createdAt: Date.now(),
        };

        await saveFormToFirestore(defaultForm, user?.uid).catch(() => {});
        await fetch('/api/forms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defaultForm),
        }).catch(() => {});

        await loadFormsFromServer();
      } catch (e) {
        console.warn('Backend sync note:', e);
      }
    },
    [loadFormsFromServer, user?.uid]
  );

  // Load public slots for student without login
  const loadPublicSlots = useCallback(async (formSlug?: string, targetSheetId?: string, targetTab?: string) => {
    try {
      setIsRefreshing(true);
      setSheetError(null);

      // Attempt to load form details directly from Firestore
      let activeForm: CustomForm | null = null;
      if (formSlug) {
        activeForm = await fetchFormByIdFromFirestore(formSlug);
        if (activeForm) {
          setActiveFormItem(activeForm);
          setConfig((prev) => ({
            id: activeForm!.sheetId || prev?.id || '',
            url: prev?.url || `https://docs.google.com/spreadsheets/d/${activeForm!.sheetId}/edit`,
            sheets: prev?.sheets || [activeForm!.sheetName],
            title: activeForm!.title || 'Jadwal Presentasi',
            activeSheetName: activeForm!.sheetName || 'Jadwal Presentasi',
            startRow: activeForm!.startRow || 54,
          }));
        }
      }

      const effectiveSheetId = activeForm?.sheetId || targetSheetId;
      const effectiveSheetName = activeForm?.sheetName || targetTab;
      const effectiveStartRow = activeForm?.startRow;
      const effectiveTitle = activeForm?.title;

      // Try direct Google Sheets API fetch using session token stored in Firestore
      if (effectiveSheetId) {
        const sessionToken = await fetchSessionTokenFromFirestore(effectiveSheetId);
        if (sessionToken) {
          const sheetConfig: SpreadsheetConfig = {
            id: effectiveSheetId,
            title: effectiveTitle || 'Jadwal Presentasi',
            url: `https://docs.google.com/spreadsheets/d/${effectiveSheetId}/edit`,
            activeSheetName: effectiveSheetName || 'Sheet1',
            sheets: [effectiveSheetName || 'Sheet1'],
            startRow: Number(effectiveStartRow) || 54,
          };
          try {
            const directSlots = await fetchPresentationSlots(sessionToken, sheetConfig);
            setSlots(directSlots);
            return;
          } catch (directErr) {
            console.warn('Direct fetch with session token failed, falling back to /api/public/slots:', directErr);
          }
        }
      }

      const params = new URLSearchParams();
      if (formSlug) params.set('formId', formSlug);

      if (effectiveSheetId) params.set('sheetId', effectiveSheetId);
      if (effectiveSheetName) params.set('sheetName', effectiveSheetName);
      if (effectiveStartRow) params.set('startRow', effectiveStartRow.toString());
      if (effectiveTitle) params.set('title', effectiveTitle);

      const res = await fetch(`/api/public/slots?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
        if (data.form && !activeForm) {
          setActiveFormItem(data.form);
          setConfig((prev) => ({
            id: data.form.sheetId || prev?.id || '',
            url: prev?.url || `https://docs.google.com/spreadsheets/d/${data.form.sheetId}/edit`,
            sheets: prev?.sheets || [data.form.sheetName],
            title: data.form.title || 'Jadwal Presentasi',
            activeSheetName: data.form.sheetName || 'Jadwal Presentasi',
            startRow: data.form.startRow || 54,
          }));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.form && !activeForm) {
          setActiveFormItem(err.form);
        }
        setSheetError(err.error || 'Jadwal presentasi belum dapat dimuat.');
      }
    } catch (e: unknown) {
      console.warn('Public fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Refresh schedule slots using admin token if available
  const loadScheduleData = useCallback(
    async (token: string | null, sheetConfig: SpreadsheetConfig, formSlug?: string) => {
      if (!token) {
        await loadPublicSlots(formSlug, sheetConfig.id, sheetConfig.activeSheetName);
        return;
      }

      try {
        setIsRefreshing(true);
        setSheetError(null);
        const data = await fetchPresentationSlots(token, sheetConfig);
        setSlots(data);
        await syncSessionWithBackend(token, sheetConfig);
      } catch (err: unknown) {
        console.error('Error fetching sheet data:', err);
        setSheetError(
          err instanceof Error
            ? err.message
            : 'Gagal membaca data jadwal presentasi dari Google Sheet'
        );
      } finally {
        setIsRefreshing(false);
      }
    },
    [syncSessionWithBackend, loadPublicSlots]
  );

  // Connect spreadsheet by ID or URL (Admin)
  const connectSpreadsheetById = useCallback(
    async (token: string, id: string, customStartRow = 54) => {
      try {
        setIsLoadingSheet(true);
        setSheetError(null);
        const details = await getSpreadsheetDetails(token, id);
        details.startRow = customStartRow;
        setConfig(details);
        localStorage.setItem(STORAGE_KEY_SHEET_ID, details.id);
        localStorage.setItem(STORAGE_KEY_START_ROW, customStartRow.toString());
        await saveSessionTokenToFirestore(details.id, token, user?.uid);
        await loadScheduleData(token, details);
      } catch (err: unknown) {
        console.error('Error connecting spreadsheet:', err);
        setSheetError(
          err instanceof Error
            ? err.message
            : 'Tidak dapat menghubungkan Google Spreadsheet. Pastikan URL benar dan memiliki izin akses.'
        );
      } finally {
        setIsLoadingSheet(false);
      }
    },
    [loadScheduleData]
  );

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setIsLoadingAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsLoadingAuth(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Parse URL parameters on initial load (e.g. ?form=kelas-a or ?sheetId=...&sheetName=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const formSlug = params.get('form') || params.get('formId') || undefined;
    const sheetIdParam = params.get('sheetId') || params.get('sheet') || undefined;
    const tabParam = params.get('sheetName') || params.get('tab') || undefined;

    loadFormsFromServer();
    loadPublicSlots(formSlug, sheetIdParam, tabParam);
  }, [loadFormsFromServer, loadPublicSlots]);

  // Auto-reconnect saved spreadsheet once admin is authenticated
  useEffect(() => {
    if (user && accessToken && !config && !isLoadingSheet) {
      const savedSheetId = localStorage.getItem(STORAGE_KEY_SHEET_ID);
      const savedStartRow = parseInt(localStorage.getItem(STORAGE_KEY_START_ROW) || '54', 10);
      if (savedSheetId) {
        connectSpreadsheetById(accessToken, savedSheetId, savedStartRow);
      }
    }
  }, [user, accessToken, config, isLoadingSheet, connectSpreadsheetById]);

  // Google Sign-In for Admin
  const handleSignIn = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        setCachedAccessToken(res.accessToken);
        setIsAdminLoginModalOpen(false);
        const savedSheetId = localStorage.getItem(STORAGE_KEY_SHEET_ID);
        if (savedSheetId) {
          await saveSessionTokenToFirestore(savedSheetId, res.accessToken, res.user.uid);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setAuthError(
        err instanceof Error ? err.message : 'Sign in dibatalkan atau gagal. Silakan coba lagi.'
      );
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  // Create presentation template spreadsheet (Admin)
  const handleCreateNewSpreadsheet = async (title?: string) => {
    if (!accessToken) throw new Error('Autentikasi admin diperlukan');
    const newConfig = await createPresentationSpreadsheetTemplate(accessToken, title);
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY_SHEET_ID, newConfig.id);
    localStorage.setItem(STORAGE_KEY_START_ROW, '54');
    await loadScheduleData(accessToken, newConfig);
  };

  // Connect existing spreadsheet (Admin)
  const handleConnectExisting = async (urlOrId: string) => {
    if (!accessToken) throw new Error('Autentikasi admin diperlukan');
    const savedStartRow = parseInt(localStorage.getItem(STORAGE_KEY_START_ROW) || '54', 10);
    await connectSpreadsheetById(accessToken, urlOrId, savedStartRow);
  };

  // Public Booking Handler (NO LOGIN REQUIRED FOR ATTENDEE)
  const handlePublicBookSlot = async (
    slot: PresentationSlot,
    payload: PresentationBookingPayload
  ): Promise<void> => {
    const params = new URLSearchParams(window.location.search);
    const formSlug = params.get('form') || activeFormItem?.id || undefined;

    // Direct client call if admin token available
    if (accessToken && config) {
      await bookPresentationSlot(accessToken, config, slot, payload);
      await loadScheduleData(accessToken, config);
      return;
    }

    // Direct client call using session token stored in Firestore
    const effectiveSheetId = activeFormItem?.sheetId || config?.id;
    if (effectiveSheetId) {
      const sessionToken = await fetchSessionTokenFromFirestore(effectiveSheetId);
      if (sessionToken && config) {
        await bookPresentationSlot(sessionToken, config, slot, payload);
        await loadPublicSlots(formSlug, config.id, config.activeSheetName);
        return;
      }
    }

    // Fallback: Submit via backend public proxy
    const res = await fetch('/api/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formId: formSlug,
        sheetId: activeFormItem?.sheetId || config?.id,
        sheetName: activeFormItem?.sheetName || config?.activeSheetName,
        rowNumber: slot.rowNumber,
        kelasTeori: payload.kelasTeori,
        namaKelompok: payload.namaKelompok,
        tema: payload.tema,
        idKelompok: payload.idKelompok,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan booking ke spreadsheet');
    }

    // Reload public slots
    await loadPublicSlots(formSlug);
  };

  // Admin Safe Booking Handler (with Confirmation Dialog)
  const handleAdminRequestBooking = async (
    slot: PresentationSlot,
    payload: PresentationBookingPayload
  ): Promise<void> => {
    if (!accessToken || !config) {
      throw new Error('Silakan hubungkan Google Spreadsheet terlebih dahulu.');
    }

    return new Promise((resolve, reject) => {
      setConfirmationState({
        isOpen: true,
        title: 'Konfirmasi Booking Presentasi',
        description: `Anda akan memesan slot presentasi pada Baris ${slot.rowNumber} (Tab: ${config.activeSheetName}). Kolom Kelas Teori, Nama Kelompok, Tema, dan ID_Kelompok akan langsung diisi di Google Spreadsheet.`,
        details: [
          { label: 'Sesi / Baris', value: `Urutan #${slot.urutan} (Baris ${slot.rowNumber})` },
          { label: 'Tab Sheet', value: config.activeSheetName },
          { label: 'Hari & Tanggal', value: `${slot.hari}, ${slot.tanggal}` },
          { label: 'Jam Presentasi', value: slot.jam },
          { label: 'Kelas Teori', value: payload.kelasTeori || '—' },
          { label: 'Nama Kelompok', value: payload.namaKelompok },
          { label: 'ID_Kelompok', value: payload.idKelompok },
          { label: 'Tema Presentasi', value: payload.tema },
        ],
        confirmButtonText: 'Konfirmasi & Simpan ke Spreadsheet',
        confirmButtonVariant: 'primary',
        onConfirm: async () => {
          setIsExecutingMutation(true);
          try {
            await bookPresentationSlot(accessToken, config, slot, payload);
            setConfirmationState((prev) => ({ ...prev, isOpen: false }));
            await loadScheduleData(accessToken, config);
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            setIsExecutingMutation(false);
          }
        },
      });
    });
  };

  // Admin Clear Booking (with Confirmation Dialog)
  const handleClearBooking = async (slot: PresentationSlot) => {
    if (!accessToken || !config) return;

    setConfirmationState({
      isOpen: true,
      title: 'Reset / Kosongkan Slot Presentasi',
      description: `Ini akan menghapus data booking (${slot.namaKelompok}) pada Baris ${slot.rowNumber} di spreadsheet, sehingga slot presentasi ini kembali kosong.`,
      details: [
        { label: 'Baris Spreadsheet', value: `Baris ${slot.rowNumber}` },
        { label: 'Tab Sheet', value: config.activeSheetName },
        { label: 'Urutan', value: `Urutan #${slot.urutan}` },
        { label: 'Hari & Jam', value: `${slot.hari}, ${slot.jam}` },
        { label: 'Kelompok Terdaftar', value: `${slot.namaKelompok} (${slot.idKelompok})` },
      ],
      confirmButtonText: 'Ya, Kosongkan Slot',
      confirmButtonVariant: 'danger',
      onConfirm: async () => {
        setIsExecutingMutation(true);
        try {
          await cancelPresentationBooking(accessToken, config, slot);
          setConfirmationState((prev) => ({ ...prev, isOpen: false }));
          await loadScheduleData(accessToken, config);
        } catch (err) {
          console.error(err);
          alert('Gagal mengosongkan slot di spreadsheet');
        } finally {
          setIsExecutingMutation(false);
        }
      },
    });
  };

  // Add Schedule Slot (Admin)
  const handleAddSlot = async (newSlot: {
    urutan: string;
    hari: string;
    tanggal: string;
    jam: string;
  }) => {
    if (!accessToken || !config) return;
    await addPresentationScheduleSlot(accessToken, config, newSlot);
    await loadScheduleData(accessToken, config);
  };

  // Update Config (Start Row / Sheet Name)
  const handleUpdateConfig = async (newStartRow: number, newSheetName?: string) => {
    if (!accessToken || !config) return;
    const updated = {
      ...config,
      startRow: newStartRow,
      ...(newSheetName ? { activeSheetName: newSheetName } : {}),
    };
    setConfig(updated);
    localStorage.setItem(STORAGE_KEY_START_ROW, newStartRow.toString());
    await loadScheduleData(accessToken, updated);
  };

  // Current display title & description
  const currentTitle = activeFormItem?.title || config?.title || 'Jadwal Presentasi';
  const currentDescription = activeFormItem?.description;
  const currentTabName = activeFormItem?.sheetName || config?.activeSheetName;

  // PUBLIC VISITOR VIEW (NO LOGIN REQUIRED)
  if (!user && !isAdminLoginModalOpen) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
        {isRefreshing && slots.length === 0 ? (
          <div className="max-w-lg mx-auto px-4 py-28 text-center space-y-4">
            <Loader2 className="w-9 h-9 text-emerald-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-600">Memuat jadwal presentasi...</p>
          </div>
        ) : slots.length === 0 && !isRefreshing && sheetError ? (
          <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
              <Clock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">{currentTitle}</h2>
              <p className="text-xs sm:text-sm text-slate-600">
                {sheetError || 'Jadwal presentasi belum aktif atau belum disinkronkan oleh dosen / admin.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsAdminLoginModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Login Sebagai Admin / Dosen</span>
              </button>
            </div>
          </div>
        ) : (
          /* Progressive One Field Per Page Form */
          <StepBookingForm
            slots={slots}
            sheetTitle={currentTitle}
            formDescription={currentDescription}
            tabName={currentTabName}
            sheetUrl={config?.url}
            onBookSlot={handlePublicBookSlot}
            onOpenAdminLogin={() => setIsAdminLoginModalOpen(true)}
            isAdminLoggedIn={false}
          />
        )}

        {/* Admin Login Modal */}
        {isAdminLoginModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Login Admin / Dosen</h3>
                <p className="text-xs text-slate-500">
                  Khusus pengelola jadwal untuk menghubungkan Google Spreadsheet dan membuat link form per tab.
                </p>
              </div>

              <div className="pt-2 flex flex-col items-center gap-3">
                <GoogleSignInButton
                  onClick={handleSignIn}
                  isLoading={isLoadingAuth}
                  text="Masuk dengan Akun Google"
                  className="w-full py-2.5 text-xs shadow-xs"
                />
                {authError && (
                  <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                    {authError}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsAdminLoginModalOpen(false)}
                className="text-xs font-medium text-slate-400 hover:text-slate-600 pt-1"
              >
                Kembali ke Form Mahasiswa
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ADMIN / OWNER VIEW
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Navigation */}
      <Header
        user={user}
        spreadsheet={config}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSpreadsheetModal={() => setIsSpreadsheetModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenFormManager={() => setIsFormManagerModalOpen(true)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onRefreshData={() => {
          if (accessToken && config) loadScheduleData(accessToken, config);
        }}
        isRefreshing={isRefreshing}
        isLoadingAuth={isLoadingAuth}
        bookingsCount={slots.filter((s) => s.isBooked).length}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {!config ? (
          <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Hubungkan Google Spreadsheet Presentasi</h2>
              <p className="text-sm text-slate-600">
                Tempelkan URL Google Spreadsheet yang berisi kolom Urutan, Hari, Tanggal, Jam, Kelas Teori, Nama Kelompok, Tema, ID_Kelompok (mulai Baris 54).
              </p>
            </div>

            {sheetError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{sheetError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSpreadsheetModalOpen(true)}
                disabled={isLoadingSheet}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Hubungkan Spreadsheet Saya</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateNewSpreadsheet()}
                disabled={isLoadingSheet}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-xl text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                {isLoadingSheet ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Membuat Template...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Buat Template Baru</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="pb-16">
            {/* Admin Header Quick Switcher: Select Active Form Tab */}
            {forms.length > 1 && (
              <div className="max-w-7xl mx-auto px-4 pt-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    Pilih Tab Form:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {forms.map((f) => {
                      const isActive = config.activeSheetName === f.sheetName;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setActiveFormItem(f);
                            handleUpdateConfig(f.startRow || 54, f.sheetName);
                          }}
                          className={`px-3 py-1 rounded-lg font-medium transition-all ${
                            isActive
                              ? 'bg-purple-100 text-purple-900 font-bold border border-purple-200'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {f.title} ({f.sheetName})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFormManagerModalOpen(true)}
                  className="text-xs font-semibold text-purple-700 hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Tambah Link Tab Baru</span>
                </button>
              </div>
            )}

            {/* View Mode Switcher for Admin */}
            {activeTab === 'booking' && (
              <div className="max-w-6xl mx-auto px-4 pt-4 flex items-center justify-end gap-2">
                <span className="text-xs text-slate-500 font-medium">Tampilan Mahasiswa:</span>
                <div className="flex p-0.5 bg-slate-200/80 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setUseStepForm(true)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      useStepForm
                        ? 'bg-white text-emerald-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Form 1 Field Per Page (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseStepForm(false)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      !useStepForm
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tampilan Grid / Kalender
                  </button>
                </div>
              </div>
            )}

            {sheetError && (
              <div className="max-w-6xl mx-auto px-4 mt-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{sheetError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (accessToken && config) loadScheduleData(accessToken, config);
                    }}
                    className="underline font-semibold hover:text-amber-950"
                  >
                    Sync Ulang
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'booking' ? (
              useStepForm ? (
                <StepBookingForm
                  slots={slots}
                  sheetTitle={currentTitle}
                  formDescription={currentDescription}
                  tabName={currentTabName}
                  sheetUrl={config.url}
                  onBookSlot={handleAdminRequestBooking}
                  onOpenAdminLogin={() => setActiveTab('manager')}
                  isAdminLoggedIn={true}
                />
              ) : (
                <BookingView
                  slots={slots}
                  config={config}
                  onBookSlot={handleAdminRequestBooking}
                  defaultClientEmail={user?.email || ''}
                  defaultClientName={user?.displayName || ''}
                />
              )
            ) : (
              <ManagerView
                slots={slots}
                config={config}
                onAddSlot={handleAddSlot}
                onClearBooking={handleClearBooking}
                onUpdateConfig={handleUpdateConfig}
                onRefreshData={() => {
                  if (accessToken && config) loadScheduleData(accessToken, config);
                }}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                onOpenFormManager={() => setIsFormManagerModalOpen(true)}
                isRefreshing={isRefreshing}
              />
            )}
          </div>
        )}
      </main>

      {/* Form Manager Modal: Generate multiple forms for different sheets/tabs */}
      <FormManagerModal
        isOpen={isFormManagerModalOpen}
        onClose={() => setIsFormManagerModalOpen(false)}
        currentSpreadsheet={config}
        forms={forms}
        onSaveForm={handleSaveForm}
        onDeleteForm={handleDeleteForm}
      />

      {/* Share Link Modal */}
      <ShareLinkModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        sheetTitle={currentTitle}
        sheetId={config?.id}
      />

      {/* Spreadsheet Picker / Connection Modal */}
      <SpreadsheetPicker
        isOpen={isSpreadsheetModalOpen}
        currentSpreadsheet={config}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        onCreateNew={handleCreateNewSpreadsheet}
        onConnectExisting={handleConnectExisting}
        isCreating={isLoadingSheet}
        isConnecting={isLoadingSheet}
      />

      {/* Workspace Safety Confirmation Dialog */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        description={confirmationState.description}
        details={confirmationState.details}
        confirmButtonText={confirmationState.confirmButtonText}
        confirmButtonVariant={confirmationState.confirmButtonVariant}
        isProcessing={isExecutingMutation}
        onConfirm={confirmationState.onConfirm}
        onCancel={() => setConfirmationState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
