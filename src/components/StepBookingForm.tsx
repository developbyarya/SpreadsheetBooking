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
} from 'lucide-react';
import { PresentationSlot, PresentationBookingPayload } from '../services/sheets';

interface StepBookingFormProps {
  slots: PresentationSlot[];
  sheetTitle?: string;
  formDescription?: string;
  tabName?: string;
  sheetUrl?: string;
  onBookSlot: (
    slot: PresentationSlot,
    payload: PresentationBookingPayload
  ) => Promise<void>;
  onOpenAdminLogin: () => void;
  isAdminLoggedIn?: boolean;
}

export const StepBookingForm: React.FC<StepBookingFormProps> = ({
  slots,
  sheetTitle = 'Jadwal Presentasi',
  formDescription,
  tabName,
  sheetUrl,
  onBookSlot,
  onOpenAdminLogin,
  isAdminLoggedIn = false,
}) => {
  // Current Step:
  // 1 = Pilih Waktu & Jam
  // 2 = Kelas Teori
  // 3 = ID_Kelompok
  // 4 = Nama Kelompok
  // 5 = Tema
  // 6 = Review & Konfirmasi
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [selectedSlot, setSelectedSlot] = useState<PresentationSlot | null>(null);
  const [kelasTeori, setKelasTeori] = useState('');
  const [idKelompok, setIdKelompok] = useState('');
  const [namaKelompok, setNamaKelompok] = useState('');
  const [tema, setTema] = useState('');

  // Filtering for Step 1
  const [selectedHariFilter, setSelectedHariFilter] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<{
    slot: PresentationSlot;
    payload: PresentationBookingPayload;
  } | null>(null);

  // Auto-focus input on step change
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (currentStep >= 2 && currentStep <= 5) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [currentStep]);

  // Only open / available slots
  const availableSlots = useMemo(() => {
    return slots.filter((s) => !s.isBooked);
  }, [slots]);

  // Unique days of week
  const uniqueHari = useMemo(() => {
    const set = new Set<string>();
    availableSlots.forEach((s) => {
      if (s.hari) set.add(s.hari);
    });
    return Array.from(set);
  }, [availableSlots]);

  // Filtered available slots
  const filteredSlots = useMemo(() => {
    if (selectedHariFilter === 'all') return availableSlots;
    return availableSlots.filter(
      (s) => s.hari.toLowerCase() === selectedHariFilter.toLowerCase()
    );
  }, [availableSlots, selectedHariFilter]);

  // Step names
  const stepTitles = [
    'Pilih Waktu',
    'Kelas Teori',
    'ID Kelompok',
    'Nama Kelompok',
    'Tema Presentasi',
    'Konfirmasi',
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
      if (!kelasTeori.trim()) {
        setErrorMsg('Kelas Teori wajib diisi.');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!idKelompok.trim()) {
        setErrorMsg('ID_Kelompok wajib diisi.');
        return;
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      if (!namaKelompok.trim()) {
        setErrorMsg('Nama Kelompok / Anggota wajib diisi.');
        return;
      }
      setCurrentStep(5);
    } else if (currentStep === 5) {
      if (!tema.trim()) {
        setErrorMsg('Tema / Topik presentasi wajib diisi.');
        return;
      }
      setCurrentStep(6);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Submit booking
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    const payload: PresentationBookingPayload = {
      kelasTeori: kelasTeori.trim(),
      idKelompok: idKelompok.trim(),
      namaKelompok: namaKelompok.trim(),
      tema: tema.trim(),
    };

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onBookSlot(selectedSlot, payload);
      setBookingSuccess({
        slot: selectedSlot,
        payload,
      });
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memproses booking. Kemungkinan slot ini baru saja diambil kelompok lain. Coba pilih slot lain.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google Calendar URL
  const getGoogleCalendarUrl = (slot: PresentationSlot, payload: PresentationBookingPayload) => {
    const title = `Presentasi: ${payload.namaKelompok} (${payload.idKelompok})`;
    const details = `Jadwal Presentasi:\nUrutan: ${slot.urutan}\nHari: ${slot.hari}\nTanggal: ${slot.tanggal}\nJam: ${slot.jam}\nKelas: ${payload.kelasTeori}\nTema: ${payload.tema}\n\nTercatat di Google Spreadsheet.`;
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
    setKelasTeori('');
    setIdKelompok('');
    setNamaKelompok('');
    setTema('');
    setCurrentStep(1);
    setBookingSuccess(null);
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
          <p className="text-xs text-slate-500">
            {formDescription || 'Pilih slot waktu dan lengkapi data kelompok Anda • Tanpa perlu login'}
          </p>
        </div>

        {/* Unobtrusive Admin Login button for owner */}
        <button
          type="button"
          onClick={onOpenAdminLogin}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{isAdminLoggedIn ? 'Panel Admin' : 'Login Admin / Dosen'}</span>
        </button>
      </div>

      {/* SUCCESS SCREEN */}
      {bookingSuccess ? (
        <div className="max-w-xl w-full mx-auto my-8 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Booking Berhasil Dicatat!</h2>
            <p className="text-emerald-100 text-sm mt-1">
              Data kelompok Anda telah tersimpan langsung di Google Spreadsheet.
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
      ) : (
        /* PROGRESSIVE STEP CONTAINER */
        <div className="max-w-2xl w-full mx-auto my-auto py-6">
          {/* Progress Bar & Step Tracker */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="text-emerald-700 font-bold uppercase tracking-wider text-[11px]">
                Langkah {currentStep} dari 5
              </span>
              <span>{stepTitles[currentStep - 1]}</span>
            </div>
            {/* Animated Progress Bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(currentStep / 5) * 100}%` }}
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
                    Semua slot pada hari ini telah terisi. Silakan pilih hari lain.
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
                  <span>Lanjut: Kelas Teori</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: KELAS TEORI */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 1 / 4
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Apa Kelas Teori Anda?
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Masukkan nama kelas teori kelompok Anda (misal: Kelas A, Kelas B, TI-3A, dsb.)
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  required
                  placeholder="Ketik Kelas Teori..."
                  value={kelasTeori}
                  onChange={(e) => setKelasTeori(e.target.value)}
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
                  <span>Lanjut: ID Kelompok</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: ID_KELOMPOK */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 2 / 4
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

          {/* STEP 4: NAMA KELOMPOK */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 3 / 4
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

          {/* STEP 5: TEMA */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Field 4 / 4
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

          {/* STEP 6: REVIEW & KONFIRMASI */}
          {currentStep === 6 && (
            <form onSubmit={handleFinalSubmit} className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Periksa Kembali Data Booking
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Pastikan informasi berikut sudah tepat sebelum disimpan ke Google Spreadsheet.
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
                  className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-lg shadow-emerald-700/20 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan ke Spreadsheet...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Konfirmasi & Simpan Booking</span>
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
        <span>Sistem Booking Jadwal Presentasi • Terhubung langsung dengan Google Sheets</span>
      </div>
    </div>
  );
};
