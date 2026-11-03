import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  BookOpen,
  Tag,
  Users,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  CalendarPlus,
  ExternalLink,
  Download,
  AlertCircle,
  Loader2,
  Lock,
  ChevronDown,
  Mail,
  MailCheck,
  Timer,
  RefreshCw,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { PresentationSlot, PresentationBookingPayload } from '../services/sheets';
import {
  isValidUpnInformatikaEmail,
  createPendingBookingHold,
  cancelBookingInFirestore,
  subscribeToBookingStatus,
  getBookingById,
} from '../services/firebase';
import { formatWIB, formatCountdown } from '../services/dateTime';

export const KELAS_TEORI_OPTIONS = ['IF-A', 'IF-B', 'IF-C', 'IF-D', 'IF-E'];

interface StepBookingFormProps {
  slots: PresentationSlot[];
  sheetTitle?: string;
  formDescription?: string;
  tabName?: string;
  sheetUrl?: string;
  sheetId?: string;
  formId?: string;
  emailBypass?: boolean;
  closedAt?: number | null;
  isClosed?: boolean;
  onBookSlot: (
    slot: PresentationSlot,
    payload: PresentationBookingPayload
  ) => Promise<void>;
  onOpenAdminLogin: () => void;
  isAdminLoggedIn?: boolean;
}

interface PendingHoldState {
  bookingId: string;
  confirmToken: string;
  expiresAt: number;
  previewUrl?: string;
  email: string;
  slot: PresentationSlot;
  payload: PresentationBookingPayload;
}

export const StepBookingForm: React.FC<StepBookingFormProps> = ({
  slots,
  sheetTitle = 'Booking Presentasi Data Science',
  formDescription,
  tabName,
  sheetUrl,
  sheetId,
  formId,
  emailBypass = false,
  closedAt,
  isClosed = false,
  onBookSlot,
  onOpenAdminLogin,
  isAdminLoggedIn = false,
}) => {
  const isBypass = Boolean(
    emailBypass || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EMAIL_BYPASS === 'true')
  );

  // Current Step:
  // 1 = Pilih Waktu & Jam
  // 2 = Email Mahasiswa (Informatika UPN)
  // 3 = Kelas Teori
  // 4 = ID_Kelompok
  // 5 = Nama Kelompok
  // 6 = Tema
  // 7 = Review & Kirim Konfirmasi Email
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [selectedSlot, setSelectedSlot] = useState<PresentationSlot | null>(null);
  const [studentEmail, setStudentEmail] = useState('');
  const [kelasTeori, setKelasTeori] = useState('');
  const [idKelompok, setIdKelompok] = useState('');
  const [namaKelompok, setNamaKelompok] = useState('');
  const [tema, setTema] = useState('');

  // Filtering for Step 1
  const [selectedHariFilter, setSelectedHariFilter] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Email Hold & Verification State (15 minutes hold)
  const [pendingHold, setPendingHold] = useState<PendingHoldState | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);

  // Booking confirmed success screen (if confirmed in this tab)
  const [bookingSuccess, setBookingSuccess] = useState<{
    slot: PresentationSlot;
    payload: PresentationBookingPayload;
  } | null>(null);

  // Countdown timer for pending hold
  useEffect(() => {
    if (!pendingHold) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((pendingHold.expiresAt - now) / 1000));
      setRemainingSeconds(diff);
      if (diff <= 0) {
        setErrorMsg('Masa penahanan slot (15 menit) telah kedaluwarsa. Slot telah dilepaskan kembali.');
        setPendingHold(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pendingHold]);

  // Real-time listener: detect when booking is confirmed on another device/tab (e.g. via phone email link)
  useEffect(() => {
    if (!pendingHold?.bookingId) return;

    let isSubscribed = true;

    // 1. Real-time Firestore snapshot listener
    const unsubscribe = subscribeToBookingStatus(
      pendingHold.bookingId,
      (updatedBooking) => {
        if (!isSubscribed) return;
        if (updatedBooking.status === 'confirmed') {
          setPendingHold(null);
          setBookingSuccess({
            slot: pendingHold.slot,
            payload: pendingHold.payload,
          });
        }
      },
      (err) => {
        console.warn('Realtime listener note:', err);
      }
    );

    // 2. Backup periodic polling every 3 seconds in case socket is sleeping or throttled
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const record = await getBookingById(pendingHold.bookingId);
        if (record && record.status === 'confirmed' && isSubscribed) {
          setPendingHold(null);
          setBookingSuccess({
            slot: pendingHold.slot,
            payload: pendingHold.payload,
          });
        }
      } catch (pollErr) {
        console.warn('Backup polling note:', pollErr);
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [pendingHold]);

  // Auto-focus input on step change
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (currentStep >= 2 && currentStep <= 6) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [currentStep]);

  // Available slots (not booked and not held by another user)
  const availableSlots = useMemo(() => {
    const now = Date.now();
    return slots.filter((s) => {
      if (s.isHeld && s.heldExpiresAt && s.heldExpiresAt > now) {
        return false;
      }
      return !s.isBooked;
    });
  }, [slots]);

  // Held slots count
  const heldSlotsCount = useMemo(() => {
    const now = Date.now();
    return slots.filter((s) => s.isHeld && s.heldExpiresAt && s.heldExpiresAt > now).length;
  }, [slots]);

  // Unique days of week
  const uniqueHari = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      if (s.hari) set.add(s.hari);
    });
    return Array.from(set);
  }, [slots]);

  // Filtered available slots
  const filteredSlots = useMemo(() => {
    if (selectedHariFilter === 'all') return availableSlots;
    return availableSlots.filter(
      (s) => s.hari.toLowerCase() === selectedHariFilter.toLowerCase()
    );
  }, [availableSlots, selectedHariFilter]);

  // Step names (7 steps total)
  const stepTitles = [
    'Pilih Waktu',
    'Email Mahasiswa',
    'Kelas Teori',
    'ID Kelompok',
    'Nama Kelompok',
    'Tema Presentasi',
    'Review & Kirim',
  ];

  // Advance step with validation
  const handleNext = () => {
    setErrorMsg(null);
    if (currentStep === 1) {
      if (!selectedSlot) {
        setErrorMsg('Silakan pilih salah satu slot waktu presentasi yang tersedia.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const cleanEmail = studentEmail.trim().toLowerCase();
      if (!cleanEmail) {
        setErrorMsg('Email mahasiswa wajib diisi.');
        return;
      }
      if (!isValidUpnInformatikaEmail(cleanEmail, isBypass)) {
        setErrorMsg(
          isBypass
            ? 'Format email tidak valid (contoh: user@example.com)'
            : 'Email harus merupakan email institusi Informatika UPN Veteran Yogyakarta: 123xxxxxx@student.upnyk.ac.id'
        );
        return;
      }
      // Rule 1: Email hanya boleh digunakan sekali
      const existingEmailSlot = slots.find(
        (s) => s.email && s.email.trim().toLowerCase() === cleanEmail && s.rowNumber !== selectedSlot?.rowNumber
      );
      if (existingEmailSlot) {
        setErrorMsg(
          `Email "${cleanEmail}" sudah digunakan untuk booking jadwal presentasi (Kelompok ${existingEmailSlot.namaKelompok || 'lain'}, Urutan #${existingEmailSlot.urutan}). Satu email hanya boleh digunakan satu kali.`
        );
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!kelasTeori.trim()) {
        setErrorMsg('Kelas Teori wajib diisi.');
        return;
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      const cleanId = idKelompok.trim().toLowerCase();
      if (!cleanId) {
        setErrorMsg('ID_Kelompok wajib diisi.');
        return;
      }
      // Rule 2: ID hanya boleh muncul satu kali
      const existingIdSlot = slots.find(
        (s) => s.idKelompok && s.idKelompok.trim().toLowerCase() === cleanId && s.rowNumber !== selectedSlot?.rowNumber
      );
      if (existingIdSlot) {
        setErrorMsg(
          `ID Kelompok "${idKelompok.trim()}" sudah terdaftar pada Urutan #${existingIdSlot.urutan} (${existingIdSlot.namaKelompok || 'Kelompok lain'}). Setiap ID Kelompok hanya boleh mendaftar satu kali.`
        );
        return;
      }
      setCurrentStep(5);
    } else if (currentStep === 5) {
      if (!namaKelompok.trim()) {
        setErrorMsg('Nama Kelompok / Anggota wajib diisi.');
        return;
      }
      setCurrentStep(6);
    } else if (currentStep === 6) {
      if (!tema.trim()) {
        setErrorMsg('Tema / Topik presentasi wajib diisi.');
        return;
      }
      setCurrentStep(7);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Send Confirmation Email and Hold the Slot for 15 minutes
  const handleInitiateBookingWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    const cleanEmail = studentEmail.trim().toLowerCase();
    if (!isValidUpnInformatikaEmail(cleanEmail, isBypass)) {
      setErrorMsg(
        isBypass
          ? 'Format email tidak valid.'
          : 'Format email salah! Gunakan email institusi UPN Informatika: 123xxxxxx@student.upnyk.ac.id'
      );
      setCurrentStep(2);
      return;
    }

    // Rule 1: Email hanya boleh digunakan sekali
    const existingEmailSlot = slots.find(
      (s) => s.email && s.email.trim().toLowerCase() === cleanEmail && s.rowNumber !== selectedSlot.rowNumber
    );
    if (existingEmailSlot) {
      setErrorMsg(
        `Email "${cleanEmail}" sudah digunakan untuk booking jadwal presentasi (Kelompok ${existingEmailSlot.namaKelompok || 'lain'}, Urutan #${existingEmailSlot.urutan}). Satu email hanya boleh digunakan satu kali.`
      );
      setCurrentStep(2);
      return;
    }

    // Rule 2: ID hanya boleh muncul satu kali
    const cleanId = idKelompok.trim().toLowerCase();
    const existingIdSlot = slots.find(
      (s) => s.idKelompok && s.idKelompok.trim().toLowerCase() === cleanId && s.rowNumber !== selectedSlot.rowNumber
    );
    if (existingIdSlot) {
      setErrorMsg(
        `ID Kelompok "${idKelompok.trim()}" sudah terdaftar pada Urutan #${existingIdSlot.urutan} (${existingIdSlot.namaKelompok || 'Kelompok lain'}). Setiap ID Kelompok hanya boleh mendaftar satu kali.`
      );
      setCurrentStep(4);
      return;
    }

    const payload: PresentationBookingPayload = {
      kelasTeori: kelasTeori.trim(),
      idKelompok: idKelompok.trim(),
      namaKelompok: namaKelompok.trim(),
      tema: tema.trim(),
      email: cleanEmail,
    };

    setIsSubmitting(true);
    setErrorMsg(null);

    // EMAIL_BYPASS Mode: Directly book and commit to Spreadsheet & Firestore without sending email
    if (isBypass) {
      try {
        await onBookSlot(selectedSlot, payload);
        setBookingSuccess({
          slot: selectedSlot,
          payload,
        });
        return;
      } catch (errBypass: unknown) {
        console.error('Error in email bypass booking:', errBypass);
        setErrorMsg(
          errBypass instanceof Error
            ? errBypass.message
            : 'Gagal memproses booking langsung.'
        );
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    const effectiveSheetId = sheetId || 'spreadsheet_booking';
    const effectiveSheetName = tabName || 'Sheet1';

    try {
      // 1. Create a 15-minute temporary pending hold in Firestore
      const holdRes = await createPendingBookingHold({
        sheetId: effectiveSheetId,
        sheetName: effectiveSheetName,
        formId: formId,
        rowNumber: selectedSlot.rowNumber,
        urutan: selectedSlot.urutan,
        hari: selectedSlot.hari,
        tanggal: selectedSlot.tanggal,
        jam: selectedSlot.jam,
        kelasTeori: payload.kelasTeori,
        namaKelompok: payload.namaKelompok,
        tema: payload.tema,
        idKelompok: payload.idKelompok,
        email: cleanEmail,
        bookedByAdmin: false,
      });

      if (!holdRes.success || !holdRes.confirmToken) {
        throw new Error(
          holdRes.error || 'Gagal memesan slot sementara. Kemungkinan slot ini baru saja diambil orang lain.'
        );
      }

      // 2. Send confirmation link via backend email service
      const appUrl = window.location.origin;
      const sendRes = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          bookingId: holdRes.bookingId,
          confirmToken: holdRes.confirmToken,
          slotDetails: {
            hari: selectedSlot.hari,
            tanggal: selectedSlot.tanggal,
            jam: selectedSlot.jam,
            urutan: selectedSlot.urutan,
            kelasTeori: payload.kelasTeori,
            namaKelompok: payload.namaKelompok,
            idKelompok: payload.idKelompok,
            tema: payload.tema,
          },
          appUrl,
          formTitle: sheetTitle,
        }),
      });

      const sendData = await sendRes.json().catch(() => ({}));

      if (!sendRes.ok) {
        console.warn('Backend email warning:', sendData);
        // If email service has an issue, still inform user
      }

      // 3. Set hold state and start 15 min countdown view
      setPendingHold({
        bookingId: holdRes.bookingId,
        confirmToken: holdRes.confirmToken,
        expiresAt: holdRes.expiresAt || Date.now() + 15 * 60 * 1000,
        previewUrl: sendData.previewUrl,
        email: cleanEmail,
        slot: selectedSlot,
        payload,
      });
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memproses booking. Silakan coba lagi.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend confirmation email
  const handleResendEmail = async () => {
    if (!pendingHold) return;
    setIsResending(true);
    setErrorMsg(null);
    try {
      const appUrl = window.location.origin;
      const sendRes = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingHold.email,
          bookingId: pendingHold.bookingId,
          confirmToken: pendingHold.confirmToken,
          slotDetails: {
            hari: pendingHold.slot.hari,
            tanggal: pendingHold.slot.tanggal,
            jam: pendingHold.slot.jam,
            urutan: pendingHold.slot.urutan,
            kelasTeori: pendingHold.payload.kelasTeori,
            namaKelompok: pendingHold.payload.namaKelompok,
            idKelompok: pendingHold.payload.idKelompok,
            tema: pendingHold.payload.tema,
          },
          appUrl,
          formTitle: sheetTitle,
        }),
      });

      const sendData = await sendRes.json().catch(() => ({}));
      if (sendData.previewUrl) {
        setPendingHold((prev) => (prev ? { ...prev, previewUrl: sendData.previewUrl } : null));
      }
      alert('Email konfirmasi telah dikirim ulang. Silakan periksa kotak masuk atau folder spam Anda.');
    } catch (e) {
      console.error(e);
      setErrorMsg('Gagal mengirim ulang email konfirmasi.');
    } finally {
      setIsResending(false);
    }
  };

  // Cancel pending hold manually
  const handleCancelHold = async () => {
    if (!pendingHold) return;
    if (confirm('Apakah Anda yakin ingin membatalkan pemesanan slot ini? Slot akan dilepaskan kembali.')) {
      try {
        const effectiveSheetId = sheetId || 'spreadsheet_booking';
        const effectiveSheetName = tabName || 'Sheet1';
        await cancelBookingInFirestore(effectiveSheetId, effectiveSheetName, pendingHold.slot.rowNumber);
      } catch (e) {
        console.warn('Cancel hold warning:', e);
      }
      setPendingHold(null);
      setErrorMsg(null);
      setCurrentStep(1);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Google Calendar URL
  const getGoogleCalendarUrl = (slot: PresentationSlot, payload: PresentationBookingPayload) => {
    const title = `Presentasi: ${payload.namaKelompok} (${payload.idKelompok})`;
    const details = `Jadwal Presentasi:\nUrutan: ${slot.urutan}\nHari: ${slot.hari}\nTanggal: ${slot.tanggal}\nJam: ${slot.jam}\nKelas: ${payload.kelasTeori}\nTema: ${payload.tema}\nEmail: ${payload.email || '-'}\n\nTercatat di Google Spreadsheet.`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      details,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Download .ics
  const downloadIcs = (slot: PresentationSlot, payload: PresentationBookingPayload) => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SlotSync//Jadwal Presentasi//EN',
      'BEGIN:VEVENT',
      `UID:pres-${slot.rowNumber}-${Date.now()}@slotsync.local`,
      `SUMMARY:Presentasi ${payload.namaKelompok} (${payload.idKelompok})`,
      `DESCRIPTION:Urutan ${slot.urutan}, Jam: ${slot.jam}, Kelas: ${payload.kelasTeori}, Tema: ${payload.tema}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jadwal-presentasi-${payload.idKelompok}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetForm = () => {
    setSelectedSlot(null);
    setStudentEmail('');
    setKelasTeori('');
    setIdKelompok('');
    setNamaKelompok('');
    setTema('');
    setCurrentStep(1);
    setBookingSuccess(null);
    setPendingHold(null);
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-between py-6 px-4 sm:px-6">
      {/* Top Header Bar */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-200">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              {sheetTitle}
            </h2>
            {tabName && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                {tabName}
              </span>
            )}
          </div>
          {formDescription ? (
            <p className="text-xs text-slate-500">
              {formDescription}
            </p>
          ) : null}
        </div>

        {/* Admin Login button only when logged in */}
        {isAdminLoggedIn && (
          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 transition-colors shadow-2xs"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Panel Admin</span>
          </button>
        )}
      </div>

      {/* Deadline Info Banner if configured */}
      {closedAt && Date.now() < closedAt && !bookingSuccess && !pendingHold && (
        <div className="max-w-3xl w-full mx-auto my-3 p-3.5 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-950 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
            <span>
              <strong>Batas Waktu Pendaftaran:</strong> {formatWIB(closedAt)}
            </span>
          </div>
          <span className="font-semibold text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2.5 py-0.5 rounded-full text-[11px] font-mono shrink-0">
            Sisa Waktu: {formatCountdown(closedAt)}
          </span>
        </div>
      )}

      {/* VIEW 1: SUCCESS CONFIRMED SCREEN */}
      {bookingSuccess ? (
        <div className="max-w-xl w-full mx-auto my-8 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Booking Berhasil Dikonfirmasi!</h2>
            <p className="text-emerald-100 text-sm mt-1">
              Data kelompok Anda telah terverifikasi dan tersimpan langsung di Google Spreadsheet.
            </p>
          </div>

          <div className="p-8 space-y-6">
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-xs text-slate-500 font-medium">Nomor Sesi</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 font-mono">
                  Urutan #{bookingSuccess.slot.urutan}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Hari & Tanggal</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {bookingSuccess.slot.hari}, {bookingSuccess.slot.tanggal}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                <Clock className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Jam Presentasi</p>
                  <p className="text-sm font-semibold text-slate-800 font-mono">
                    {bookingSuccess.slot.jam}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                <Users className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Kelompok & ID</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {bookingSuccess.payload.namaKelompok} ({bookingSuccess.payload.idKelompok})
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kelas Teori: {bookingSuccess.payload.kelasTeori}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                <Mail className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Email Mahasiswa</p>
                  <p className="text-sm font-semibold text-slate-800 font-mono">
                    {bookingSuccess.payload.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Tema Presentasi</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {bookingSuccess.payload.tema}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href={getGoogleCalendarUrl(bookingSuccess.slot, bookingSuccess.payload)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Simpan ke Google Calendar</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              <button
                type="button"
                onClick={() => downloadIcs(bookingSuccess.slot, bookingSuccess.payload)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Download File Undangan (.ics)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetForm}
              className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors text-center"
            >
              ← Isi Form untuk Kelompok Lain
            </button>
          </div>
        </div>
      ) : pendingHold ? (
        /* VIEW 2: PENDING HOLD & WAITING FOR EMAIL CONFIRMATION (15-MIN COUNTDOWN) */
        <div className="max-w-xl w-full mx-auto my-8 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 p-8 text-white text-center relative overflow-hidden">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs">
              <MailCheck className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Cek Email Anda!</h2>
            <p className="text-amber-100 text-sm mt-1 max-w-sm mx-auto">
              Link konfirmasi booking telah dikirim ke alamat email institusi Anda.
            </p>

            {/* Countdown Badge */}
            <div className="mt-5 inline-flex items-center gap-2 bg-black/25 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-white font-mono text-lg font-bold">
              <Timer className="w-5 h-5 text-amber-200 animate-pulse" />
              <span>Sisa Waktu Hold: {formatTime(remainingSeconds)}</span>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-950">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Slot Ditahan Sementara Selama 15 Menit</span>
              </div>
              <p>
                Untuk melindungi Anda dari duplikasi booking, slot ini <strong>telah kami kunci sementara</strong> agar tidak diambil kelompok lain.
              </p>
              <p className="font-medium text-amber-900">
                ⚠️ Data <strong>TIDAK AKAN TERSIMPAN</strong> di Google Spreadsheet jika Anda tidak mengklik link verifikasi di email sebelum waktu habis.
              </p>
            </div>

            {/* Target Email Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-500">Email Tujuan:</p>
              <p className="text-base font-bold font-mono text-slate-800 break-all mt-0.5">
                {pendingHold.email}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Silakan periksa folder <strong>Inbox</strong> atau folder <strong>Spam / Junk</strong> Anda.
              </p>
            </div>

            {/* Slot Details Summary */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Waktu Presentasi:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {pendingHold.slot.hari}, {pendingHold.slot.tanggal} ({pendingHold.slot.jam})
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Kelompok:</span>
                <span className="font-semibold text-slate-900">
                  {pendingHold.payload.namaKelompok} ({pendingHold.payload.idKelompok})
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Kelas Teori:</span>
                <span className="font-semibold text-slate-900">
                  {pendingHold.payload.kelasTeori}
                </span>
              </div>
            </div>

            {/* Development / Ethereal Email Preview link if available */}
            {pendingHold.previewUrl && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                <span className="text-xs text-blue-700 font-semibold block mb-1">
                  [Mode Pengujian / Dev Mailer]
                </span>
                <a
                  href={pendingHold.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Email Simulasi (Ethereal Preview)</span>
                </a>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={isResending}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
                <span>{isResending ? 'Mengirim Ulang...' : 'Kirim Ulang Email Konfirmasi'}</span>
              </button>

              <button
                type="button"
                onClick={handleCancelHold}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:text-rose-600 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan Penahanan Slot & Pilih Ulang</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 3: PROGRESSIVE MULTI-STEP FORM (7 STEPS) */
        <div className="max-w-2xl w-full mx-auto my-auto py-6">
          {/* Progress Bar & Step Tracker */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="text-emerald-700 font-bold uppercase tracking-wider text-[11px]">
                Langkah {currentStep} dari 7
              </span>
              <span>{stepTitles[currentStep - 1]}</span>
            </div>
            {/* Animated Progress Bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(currentStep / 7) * 100}%` }}
              />
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: PILIH WAKTU & JAM */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Pilih Waktu & Jam Presentasi
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Pilih salah satu slot waktu yang masih tersedia di bawah ini.
                  {heldSlotsCount > 0 && (
                    <span className="ml-1 text-amber-600 font-medium">
                      ({heldSlotsCount} slot sedang dalam hold sementara konfirmasi email).
                    </span>
                  )}
                </p>
              </div>

              {/* Day filter tabs */}
              {uniqueHari.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedHariFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      selectedHariFilter === 'all'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua Hari ({availableSlots.length})
                  </button>
                  {uniqueHari.map((hari) => (
                    <button
                      key={hari}
                      type="button"
                      onClick={() => setSelectedHariFilter(hari)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        selectedHariFilter === hari
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {hari}
                    </button>
                  ))}
                </div>
              )}

              {/* Slots Grid */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {filteredSlots.length === 0 ? (
                  <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 text-sm">
                    Semua slot pada hari ini telah terisi atau sedang di-hold. Silakan pilih hari lain.
                  </div>
                ) : (
                  filteredSlots.map((slot) => {
                    const isSelected = selectedSlot?.rowNumber === slot.rowNumber;
                    return (
                      <button
                        key={slot.rowNumber}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-4 ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/30 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xs'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                              Urutan #{slot.urutan}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {slot.hari ? `${slot.hari}, ` : ''}{slot.tanggal}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono font-medium text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{slot.jam}</span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!selectedSlot}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Lanjut: Email Mahasiswa</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: EMAIL MAHASISWA INFORMATIKA UPN */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                    Verifikasi Identitas Mahasiswa
                  </span>
                  {isBypass && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Bypass Mode Active
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Masukkan Email {isBypass ? 'Anda (Mode Test)' : 'Institusi Anda'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  {isBypass ? (
                    <span className="text-amber-700 font-medium">
                      Mode test aktif (EMAIL_BYPASS=true): verifikasi email dilewati, Anda dapat menggunakan email apapun.
                    </span>
                  ) : (
                    <>
                      Wajib menggunakan email institusi Jurusan Informatika UPN Veteran Yogyakarta:
                      <strong className="text-emerald-700 ml-1">123xxxxxx@student.upnyk.ac.id</strong>
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    placeholder="123xxxxxx@student.upnyk.ac.id (contoh: 123230001@student.upnyk.ac.id)"
                    value={studentEmail}
                    onChange={(e) => {
                      setStudentEmail(e.target.value);
                      setErrorMsg(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                    className="w-full pl-12 pr-5 py-4 text-base sm:text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-xs transition-all font-mono"
                  />
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">Format Alamat Email Mahasiswa:</p>
                  <p>
                    • <strong>123</strong> = Program Studi Informatika <br />
                    • <strong>xxxxxx</strong> = 6 digit NIM (Angkatan & Nomor Urut Mahasiswa) <br />
                    • Domain: <strong>@student.upnyk.ac.id</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!studentEmail}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <span>Lanjut: Kelas Teori</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: KELAS TEORI */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 2 / 5
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Pilih Kelas Teori Anda
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Pilih kelas teori kelompok Anda (tersedia opsi IF-A sampai IF-E)
                </p>
              </div>

              <div className="space-y-4">
                {/* Dropdown Select */}
                <div className="relative">
                  <select
                    value={kelasTeori}
                    onChange={(e) => {
                      setKelasTeori(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full appearance-none px-5 py-4 text-base sm:text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-xs transition-all font-semibold text-slate-800 pr-12 cursor-pointer"
                  >
                    <option value="" disabled>
                      -- Pilih Kelas Teori (IF-A s/d IF-E) --
                    </option>
                    {KELAS_TEORI_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        Kelas {opt}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </div>

                {/* Quick Select Buttons */}
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {KELAS_TEORI_OPTIONS.map((opt) => {
                    const isSelected = kelasTeori === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setKelasTeori(opt);
                          setErrorMsg(null);
                        }}
                        className={`py-3 px-2 rounded-xl text-sm font-bold transition-all text-center border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-600 ring-offset-2'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!kelasTeori}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <span>Lanjut: ID Kelompok</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: ID_KELOMPOK */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 3 / 5
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Masukkan ID_Kelompok Anda
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Masukkan nomor atau kode pengenal kelompok Anda (misal: K-01, Kelompok 3, G-05)
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  required
                  placeholder="Ketik ID_Kelompok..."
                  value={idKelompok}
                  onChange={(e) => setIdKelompok(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  className="w-full px-5 py-4 text-base sm:text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-xs transition-all font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md"
                >
                  <span>Lanjut: Nama Kelompok</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: NAMA KELOMPOK */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 4 / 5
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Nama Kelompok / Anggota
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Tuliskan nama kelompok beserta anggota (misal: Kelompok 3 - Arya, Budi, Siti)
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  required
                  placeholder="Ketik Nama Kelompok / Anggota..."
                  value={namaKelompok}
                  onChange={(e) => setNamaKelompok(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  className="w-full px-5 py-4 text-base sm:text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-xs transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md"
                >
                  <span>Lanjut: Tema Presentasi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: TEMA */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 5 / 5
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Tema / Topik Presentasi
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Tuliskan judul atau tema materi presentasi kelompok Anda
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  required
                  placeholder="Ketik Tema / Judul Presentasi..."
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  className="w-full px-5 py-4 text-base sm:text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-xs transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md"
                >
                  <span>Review & Konfirmasi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: REVIEW & KIRIM VERIFIKASI EMAIL */}
          {currentStep === 7 && (
            <form onSubmit={handleInitiateBookingWithEmail} className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Periksa Kembali Data Booking
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Link konfirmasi akan dikirim ke email institusi Anda. Slot akan di-hold selama 15 menit.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                {selectedSlot && (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Waktu Presentasi Terpilih
                      </span>
                      <p className="text-base font-bold text-slate-900">
                        {selectedSlot.hari ? `${selectedSlot.hari}, ` : ''}{selectedSlot.tanggal}
                      </p>
                      <p className="text-xs font-mono font-semibold text-emerald-700">
                        {selectedSlot.jam} (Urutan #{selectedSlot.urutan})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Ubah Waktu
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100 text-sm space-y-3 pt-1">
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 font-medium">Email Mahasiswa:</span>
                    <span className="font-bold font-mono text-emerald-800">{studentEmail}</span>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 font-medium">Kelas Teori:</span>
                    <span className="font-bold text-slate-900">{kelasTeori}</span>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 font-medium">ID_Kelompok:</span>
                    <span className="font-bold font-mono text-slate-900">{idKelompok}</span>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 font-medium">Nama Kelompok:</span>
                    <span className="font-bold text-slate-900">{namaKelompok}</span>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-500 font-medium">Tema Presentasi:</span>
                    <span className="font-bold text-slate-900 text-right max-w-xs">{tema}</span>
                  </div>
                </div>

                {isBypass ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Mode Test Aktif (EMAIL_BYPASS=true):</span>
                      <p className="mt-0.5 text-amber-900">
                        Verifikasi email dilewati. Saat Anda menekan tombol di bawah, data akan <strong>langsung disimpan ke Google Spreadsheet</strong> tanpa perlu membuka email.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    ℹ️ <strong>Catatan:</strong> Data <strong>belum</strong> disimpan ke spreadsheet. Setelah Anda menekan tombol di bawah, slot akan ditahan selama <strong>15 menit</strong> dan link konfirmasi dikirim ke email Anda.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-2xl text-white transition-all shadow-lg disabled:opacity-50 ${
                    isBypass
                      ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-amber-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-700/20'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isBypass ? 'Menyimpan ke Spreadsheet...' : 'Mengunci Slot & Mengirim Email...'}</span>
                    </>
                  ) : isBypass ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Konfirmasi & Simpan ke Spreadsheet (Mode Test)</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Kirim Link Konfirmasi ke Email</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-400 pt-6">
        <span>Sistem Booking Jadwal Presentasi • Verifikasi Email Mahasiswa Informatika UPN</span>
      </div>
    </div>
  );
};
