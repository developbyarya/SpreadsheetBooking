import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  BookOpen,
  Tag,
  CheckCircle2,
  CalendarPlus,
  ExternalLink,
  Sparkles,
  Download,
  Search,
  Filter,
  Check,
  Award,
  ChevronDown,
} from 'lucide-react';
import { PresentationSlot, PresentationBookingPayload, SpreadsheetConfig } from '../services/sheets';

interface BookingViewProps {
  slots: PresentationSlot[];
  config: SpreadsheetConfig | null;
  onBookSlot: (
    slot: PresentationSlot,
    booking: PresentationBookingPayload
  ) => Promise<void>;
  defaultClientEmail?: string;
  defaultClientName?: string;
}

export const BookingView: React.FC<BookingViewProps> = ({
  slots,
  config,
  onBookSlot,
  defaultClientName = '',
}) => {
  // Filters & Search
  const [selectedHari, setSelectedHari] = useState<string>('all');
  const [selectedTanggal, setSelectedTanggal] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'available_only' | 'all'>('available_only');
  const [searchQuery, setSearchQuery] = useState('');

  // Booking Selection State
  const [selectedSlot, setSelectedSlot] = useState<PresentationSlot | null>(null);

  // Form Fields matching user's requested booking items
  const [kelasTeori, setKelasTeori] = useState('');
  const [namaKelompok, setNamaKelompok] = useState(defaultClientName);
  const [tema, setTema] = useState('');
  const [idKelompok, setIdKelompok] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{
    slot: PresentationSlot;
    booking: PresentationBookingPayload;
  } | null>(null);

  // Extract unique Hari list
  const uniqueHariList = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      if (s.hari) set.add(s.hari);
    });
    return Array.from(set);
  }, [slots]);

  // Extract unique Tanggal list
  const uniqueTanggalList = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      if (s.tanggal) set.add(s.tanggal);
    });
    return Array.from(set);
  }, [slots]);

  // Filter slots
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (availabilityFilter === 'available_only' && slot.isBooked) {
        return false;
      }
      if (selectedHari !== 'all' && slot.hari.toLowerCase() !== selectedHari.toLowerCase()) {
        return false;
      }
      if (selectedTanggal !== 'all' && slot.tanggal !== selectedTanggal) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          slot.urutan.toLowerCase().includes(q) ||
          slot.hari.toLowerCase().includes(q) ||
          slot.tanggal.toLowerCase().includes(q) ||
          slot.jam.toLowerCase().includes(q) ||
          slot.kelasTeori.toLowerCase().includes(q) ||
          slot.namaKelompok.toLowerCase().includes(q) ||
          slot.tema.toLowerCase().includes(q) ||
          slot.idKelompok.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [slots, availabilityFilter, selectedHari, selectedTanggal, searchQuery]);

  // Counts
  const totalAvailable = useMemo(() => slots.filter((s) => !s.isBooked).length, [slots]);
  const totalBooked = useMemo(() => slots.filter((s) => s.isBooked).length, [slots]);

  // Handle Form Submit
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    if (!namaKelompok.trim() || !idKelompok.trim()) {
      alert('Mohon isi Nama Kelompok dan ID_Kelompok!');
      return;
    }

    const payload: PresentationBookingPayload = {
      kelasTeori: kelasTeori.trim(),
      namaKelompok: namaKelompok.trim(),
      tema: tema.trim(),
      idKelompok: idKelompok.trim(),
    };

    setIsSubmitting(true);
    try {
      await onBookSlot(selectedSlot, payload);
      setBookingSuccess({
        slot: selectedSlot,
        booking: payload,
      });
      setSelectedSlot(null);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Gagal membooking slot presentasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google Calendar URL generator
  const getGoogleCalendarUrl = (slot: PresentationSlot, booking: PresentationBookingPayload) => {
    // Extract dates
    const dateFormatted = slot.tanggal.replace(/[-/]/g, '');
    const title = `Presentasi: ${booking.namaKelompok} (${booking.idKelompok}) - ${booking.tema || 'Tugas Kelompok'}`;
    const details = `Jadwal Presentasi Kelompok:\nUrutan: ${slot.urutan}\nHari: ${slot.hari}\nTanggal: ${slot.tanggal}\nJam: ${slot.jam}\nKelas Teori: ${booking.kelasTeori}\nTema: ${booking.tema}\n\nTercatat pada baris ${slot.rowNumber} di Google Spreadsheet.`;

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      details,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Download .ics file
  const downloadIcs = (slot: PresentationSlot, booking: PresentationBookingPayload) => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SlotSync//Jadwal Presentasi//EN',
      'BEGIN:VEVENT',
      `UID:pres-${slot.rowNumber}-${Date.now()}@slotsync.local`,
      `SUMMARY:Presentasi ${booking.namaKelompok} - ${booking.idKelompok}`,
      `DESCRIPTION:Urutan ${slot.urutan}, Jam: ${slot.jam}, Kelas: ${booking.kelasTeori}, Tema: ${booking.tema}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jadwal-presentasi-${booking.idKelompok || 'kelompok'}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Booking Success Receipt */}
      {bookingSuccess ? (
        <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Booking Presentasi Berhasil!</h2>
            <p className="text-emerald-100 text-sm mt-1">
              Data kelompok Anda telah tersimpan langsung di Baris {bookingSuccess.slot.rowNumber} Google Spreadsheet.
            </p>
          </div>

          <div className="p-8 space-y-6">
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-xs text-slate-500 font-medium">Urutan Sesi</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 font-mono">
                  No. {bookingSuccess.slot.urutan} (Baris {bookingSuccess.slot.rowNumber})
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
                  <p className="text-xs text-slate-500 font-medium">Waktu / Jam Presentasi</p>
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
                    {bookingSuccess.booking.namaKelompok} ({bookingSuccess.booking.idKelompok})
                  </p>
                  {bookingSuccess.booking.kelasTeori && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelas Teori: {bookingSuccess.booking.kelasTeori}
                    </p>
                  )}
                </div>
              </div>

              {bookingSuccess.booking.tema && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Tema Presentasi</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {bookingSuccess.booking.tema}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <a
                href={getGoogleCalendarUrl(bookingSuccess.slot, bookingSuccess.booking)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Simpan ke Google Calendar</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => downloadIcs(bookingSuccess.slot, bookingSuccess.booking)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Download .ics</span>
                </button>

                {config && (
                  <a
                    href={config.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <span>Cek di Spreadsheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBookingSuccess(null)}
              className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors text-center"
            >
              ← Lihat Jadwal Lainnya
            </button>
          </div>
        </div>
      ) : (
        /* Presentation Booking Main Interface */
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sistem Booking Jadwal Presentasi</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Pilih Slot Jadwal Presentasi
            </h1>
            <p className="text-slate-600 text-sm sm:text-base">
              Hari, tanggal, dan jam telah ditentukan mulai Baris {config?.startRow || 54}. Pilih slot yang masih kosong dan isi data kelompok Anda.
            </p>
          </div>

          {/* Quick Metrics & Filter Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Hari, Tanggal, Jam, atau Kelompok..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Status & Availability Filters */}
              <div className="flex flex-wrap items-center gap-2 self-start md:self-auto text-xs">
                <div className="flex p-0.5 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAvailabilityFilter('available_only')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      availabilityFilter === 'available_only'
                        ? 'bg-white text-emerald-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hanya Yang Kosong ({totalAvailable})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailabilityFilter('all')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      availabilityFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Slot ({slots.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Dropdowns for Hari & Tanggal */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                Filter Hari:
              </span>
              <button
                type="button"
                onClick={() => setSelectedHari('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedHari === 'all'
                    ? 'bg-emerald-100 text-emerald-900 font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua Hari
              </button>
              {uniqueHariList.map((hari) => (
                <button
                  key={hari}
                  type="button"
                  onClick={() => setSelectedHari(hari)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    selectedHari === hari
                      ? 'bg-emerald-100 text-emerald-900 font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {hari}
                </button>
              ))}

              {uniqueTanggalList.length > 1 && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Tanggal:</span>
                  <select
                    value={selectedTanggal}
                    onChange={(e) => setSelectedTanggal(e.target.value)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="all">Semua Tanggal</option>
                    {uniqueTanggalList.map((tgl) => (
                      <option key={tgl} value={tgl}>
                        {tgl}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Slots List / Grid */}
          <div className="space-y-4">
            {filteredSlots.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Tidak ada slot yang cocok</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Coba ubah filter hari atau ganti pilihan ke &quot;Semua Slot&quot; untuk melihat seluruh sesi presentasi.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSlots.map((slot) => {
                  const isSelected = selectedSlot?.rowNumber === slot.rowNumber;

                  return (
                    <div
                      key={slot.rowNumber}
                      className={`p-5 rounded-2xl border transition-all ${
                        isSelected
                          ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                          : slot.isBooked
                          ? 'bg-slate-50/80 border-slate-200/80 opacity-90'
                          : 'bg-white border-slate-200/80 hover:border-emerald-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Top bar: Urutan and Status badge */}
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold font-mono bg-slate-100 text-slate-700">
                            Urutan #{slot.urutan}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Baris {slot.rowNumber}
                          </span>
                        </div>

                        {slot.isBooked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            Terisi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Tersedia
                          </span>
                        )}
                      </div>

                      {/* Schedule info: Hari, Tanggal, Jam */}
                      <div className="py-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-sm font-bold text-slate-900">
                            {slot.hari ? `${slot.hari}, ` : ''}{slot.tanggal}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-xs font-semibold font-mono text-slate-700">
                            {slot.jam || 'Jam belum diset'}
                          </span>
                        </div>
                      </div>

                      {/* If Booked, display registered group items */}
                      {slot.isBooked ? (
                        <div className="mt-2 p-3 bg-white rounded-xl border border-slate-200/60 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-indigo-600" />
                              {slot.namaKelompok}
                            </span>
                            {slot.idKelompok && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                                {slot.idKelompok}
                              </span>
                            )}
                          </div>
                          {slot.kelasTeori && (
                            <p className="text-slate-500 text-[11px]">
                              Kelas Teori: <span className="font-medium text-slate-700">{slot.kelasTeori}</span>
                            </p>
                          )}
                          {slot.tema && (
                            <p className="text-slate-600 text-[11px] italic">
                              Tema: &quot;{slot.tema}&quot;
                            </p>
                          )}
                        </div>
                      ) : (
                        /* If Available, display select button */
                        <div className="mt-2 pt-2 flex items-center justify-between">
                          <p className="text-[11px] text-slate-500">
                            Slot presentasi belum diisi
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlot(isSelected ? null : slot);
                            }}
                            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            <span>{isSelected ? 'Batal Pilih' : 'Pilih Slot Ini'}</span>
                          </button>
                        </div>
                      )}

                      {/* INLINE BOOKING FORM WHEN SELECTED */}
                      {isSelected && (
                        <form
                          onSubmit={handleBookingSubmit}
                          className="mt-4 pt-4 border-t border-emerald-200/80 space-y-3.5 animate-in fade-in duration-150"
                        >
                          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/60 text-xs text-emerald-900">
                            <span className="font-bold">Formulir Booking:</span> Baris {slot.rowNumber} (Urutan {slot.urutan}, {slot.hari} {slot.jam})
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Kelas Teori */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                                Kelas Teori *
                              </label>
                              <div className="relative">
                                <select
                                  required
                                  value={kelasTeori}
                                  onChange={(e) => setKelasTeori(e.target.value)}
                                  className="w-full appearance-none px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800 pr-8 cursor-pointer"
                                >
                                  <option value="" disabled>Pilih Kelas (IF-A s/d IF-E)</option>
                                  {['IF-A', 'IF-B', 'IF-C', 'IF-D', 'IF-E'].map((opt) => (
                                    <option key={opt} value={opt}>
                                      Kelas {opt}
                                    </option>
                                  ))}
                                </select>
                                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>

                            {/* ID_Kelompok */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-slate-400" />
                                ID_Kelompok *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="Contoh: K-01 / Kelompok 1"
                                value={idKelompok}
                                onChange={(e) => setIdKelompok(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              />
                            </div>
                          </div>

                          {/* Nama Kelompok */}
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              Nama Kelompok / Anggota *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: Kelompok 1 (Arya, Budi, Siti)"
                              value={namaKelompok}
                              onChange={(e) => setNamaKelompok(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                          </div>

                          {/* Tema */}
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                              Tema / Topik Presentasi *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: Implementasi Sistem Cloud Architecture"
                              value={tema}
                              onChange={(e) => setTema(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSlot(null)}
                              className="text-xs text-slate-500 hover:text-slate-800"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isSubmitting ? 'Menyimpan ke Sheet...' : 'Simpan Booking Presentasi'}</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
