import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  Search,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  Users,
  CheckCircle2,
  CalendarDays,
  Clock,
  BookOpen,
  Tag,
  Share2,
  Layers,
} from 'lucide-react';
import { PresentationSlot, SpreadsheetConfig } from '../services/sheets';

interface ManagerViewProps {
  slots: PresentationSlot[];
  config: SpreadsheetConfig | null;
  onAddSlot: (slot: {
    urutan: string;
    hari: string;
    tanggal: string;
    jam: string;
  }) => Promise<void>;
  onClearBooking: (slot: PresentationSlot, room?: 1 | 2) => Promise<void>;
  onUpdateConfig: (newStartRow: number, newSheetName?: string) => Promise<void>;
  onRefreshData: () => void;
  onOpenShareModal?: () => void;
  onOpenFormManager?: () => void;
  isRefreshing?: boolean;
}

export const ManagerView: React.FC<ManagerViewProps> = ({
  slots,
  config,
  onAddSlot,
  onClearBooking,
  onUpdateConfig,
  onRefreshData,
  onOpenShareModal,
  onOpenFormManager,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'booked'>('all');
  const [hariFilter, setHariFilter] = useState<string>('all');

  // Modals
  const [isAddSlotModalOpen, setIsAddSlotModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Slot Form State
  const [newUrutan, setNewUrutan] = useState(() => `${slots.length + 1}`);
  const [newHari, setNewHari] = useState('Senin');
  const [newTanggal, setNewTanggal] = useState(() => new Date().toISOString().split('T')[0]);
  const [newJam, setNewJam] = useState('08:00 - 08:45');

  // Config Form State
  const [editStartRow, setEditStartRow] = useState(config?.startRow || 54);
  const [editSheetName, setEditSheetName] = useState(config?.activeSheetName || 'Jadwal Presentasi');

  // Stats
  const totalSlots = slots.length;
  const bookedSlots = slots.filter((s) => s.isBooked).length;
  const availableSlots = slots.filter((s) => !s.isBooked).length;

  // Filtered rows
  const filteredSlots = slots.filter((slot) => {
    if (statusFilter === 'available' && slot.isBooked) return false;
    if (statusFilter === 'booked' && !slot.isBooked) return false;
    if (hariFilter !== 'all' && slot.hari.toLowerCase() !== hariFilter.toLowerCase()) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const r1 = slot.room1 || { kelasTeori: slot.kelasTeori, namaKelompok: slot.namaKelompok, tema: slot.tema, idKelompok: slot.idKelompok };
      const r2 = slot.room2 || { kelasTeori: '', namaKelompok: '', tema: '', idKelompok: '' };
      return (
        slot.urutan.toLowerCase().includes(q) ||
        slot.hari.toLowerCase().includes(q) ||
        slot.tanggal.toLowerCase().includes(q) ||
        slot.jam.toLowerCase().includes(q) ||
        (r1.kelasTeori || '').toLowerCase().includes(q) ||
        (r1.namaKelompok || '').toLowerCase().includes(q) ||
        (r1.tema || '').toLowerCase().includes(q) ||
        (r1.idKelompok || '').toLowerCase().includes(q) ||
        (r2.kelasTeori || '').toLowerCase().includes(q) ||
        (r2.namaKelompok || '').toLowerCase().includes(q) ||
        (r2.tema || '').toLowerCase().includes(q) ||
        (r2.idKelompok || '').toLowerCase().includes(q) ||
        slot.rowNumber.toString().includes(q)
      );
    }
    return true;
  });

  // Handle Add Slot
  const handleAddSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAddSlot({
        urutan: newUrutan.trim() || `${slots.length + 1}`,
        hari: newHari.trim(),
        tanggal: newTanggal.trim(),
        jam: newJam.trim(),
      });
      setIsAddSlotModalOpen(false);
      setNewUrutan(`${slots.length + 2}`);
    } catch (err) {
      console.error(err);
      alert('Gagal menambahkan slot jadwal baru');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Config Save
  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdateConfig(editStartRow, editSheetName);
      setIsConfigModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Gagal memperbarui konfigurasi baris spreadsheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kelola Jadwal & Data Booking Presentasi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Membaca dan menyimpan langsung pada Google Spreadsheet mulai Baris {config?.startRow || 54} (Tab: {config?.activeSheetName})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            title="Pengaturan Baris & Tab Spreadsheet"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>Pengaturan Baris ({config?.startRow || 54})</span>
          </button>

          <button
            type="button"
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Sync Spreadsheet</span>
          </button>

          {onOpenShareModal && (
            <button
              type="button"
              onClick={onOpenShareModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs"
              title="Bagikan link ke mahasiswa untuk mengisi form satu per satu"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Bagikan Link Booking</span>
            </button>
          )}

          {onOpenFormManager && (
            <button
              type="button"
              onClick={onOpenFormManager}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-purple-900 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-xl transition-colors shadow-2xs"
              title="Atur link form per tab, deadline penutupan (WIB), dan switch buka/tutup form"
            >
              <Layers className="w-3.5 h-3.5 text-purple-600" />
              <span>Kelola Link & Batas Waktu</span>
            </button>
          )}

          {config && (
            <a
              href={config.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Buka Google Sheet</span>
              <ExternalLink className="w-3 h-3 text-emerald-700" />
            </a>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Total Slot Presentasi</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{totalSlots}</span>
            <span className="text-xs text-slate-400">sesi</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Slot Kosong (Tersedia)</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600">{availableSlots}</span>
            <span className="text-xs text-slate-400">bisa dibooking</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Kelompok Terdaftar</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-indigo-600">{bookedSlots}</span>
            <span className="text-xs text-slate-400">terisi</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
          <p className="text-xs font-medium text-slate-500">Mulai Baris Sheet</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-800">Baris {config?.startRow || 54}</span>
            <span className="text-xs text-slate-400">kolom A-L (Room 1 & Room 2)</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Daftar Baris Spreadsheet Presentasi
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              {filteredSlots.length} Baris
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddSlotModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Sesi Jadwal</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari Kelompok, Tema, ID, Hari, atau Jam..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Status:</span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-emerald-100 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('available')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'available'
                    ? 'bg-emerald-100 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kosong
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('booked')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'booked'
                    ? 'bg-emerald-100 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Terisi
              </button>
            </div>
          </div>
        </div>

        {/* Presentation Table matching user's exact columns:
            Col A: Urutan
            Col B: Hari
            Col C: Tanggal
            Col D: Jam
            Col E-H: Room 1 (Kelas Teori, Nama Kelompok, Tema, ID_Kelompok)
            Col I-L: Room 2 (Kelas Teori, Nama Kelompok, Tema, ID_Kelompok)
        */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3 text-center">Row</th>
                <th className="px-4 py-3 font-bold text-slate-700">Urutan</th>
                <th className="px-4 py-3">Hari & Tanggal</th>
                <th className="px-4 py-3">Jam</th>
                <th className="px-4 py-3 text-emerald-900 bg-emerald-50/60 font-bold border-l border-emerald-100">Room 1 (E:H)</th>
                <th className="px-4 py-3 text-sky-900 bg-sky-50/60 font-bold border-l border-sky-100">Room 2 (I:L)</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSlots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Tidak ada data baris jadwal yang cocok. Pastikan tab spreadsheet dan baris awal ({config?.startRow || 54}) sudah tepat.
                  </td>
                </tr>
              ) : (
                filteredSlots.map((slot) => {
                  const r1 = slot.room1 || {
                    kelasTeori: slot.kelasTeori,
                    namaKelompok: slot.namaKelompok,
                    tema: slot.tema,
                    idKelompok: slot.idKelompok,
                    isBooked: Boolean(slot.namaKelompok || slot.idKelompok),
                  };
                  const r2 = slot.room2 || {
                    kelasTeori: '',
                    namaKelompok: '',
                    tema: '',
                    idKelompok: '',
                    isBooked: false,
                  };

                  return (
                    <tr
                      key={slot.rowNumber}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        slot.isBooked ? 'bg-indigo-50/15' : ''
                      }`}
                    >
                      {/* Row Number */}
                      <td className="px-4 py-3.5 text-center font-mono text-[11px] text-slate-400 font-medium">
                        {slot.rowNumber}
                      </td>

                      {/* Col A: Urutan */}
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900">
                        #{slot.urutan}
                      </td>

                      {/* Col B & C: Hari & Tanggal */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{slot.hari || '—'}</div>
                        <div className="text-slate-500 text-[11px]">{slot.tanggal || '—'}</div>
                      </td>

                      {/* Col D: Jam */}
                      <td className="px-4 py-3.5 font-mono text-slate-700 text-[11px]">
                        {slot.jam || '—'}
                      </td>

                      {/* Room 1 (Cols E:H) */}
                      <td className="px-4 py-3.5 bg-emerald-50/15 border-l border-emerald-100 align-top min-w-[220px]">
                        {r1.isBooked ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                {r1.namaKelompok || '—'}
                              </span>
                              {r1.idKelompok && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                                  {r1.idKelompok}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              <span className="font-medium text-slate-500">Kelas:</span> {r1.kelasTeori || '—'}
                            </div>
                            <div className="text-[11px] text-slate-600 truncate max-w-xs" title={r1.tema}>
                              <span className="font-medium text-slate-500">Tema:</span> {r1.tema || '—'}
                            </div>
                            <div className="pt-1.5">
                              <button
                                type="button"
                                onClick={() => onClearBooking(slot, 1)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors"
                                title="Reset data Room 1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Reset Room 1</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic text-[11px] flex items-center gap-1 py-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                            <span>Room 1 Kosong</span>
                          </div>
                        )}
                      </td>

                      {/* Room 2 (Cols I:L) */}
                      <td className="px-4 py-3.5 bg-sky-50/15 border-l border-sky-100 align-top min-w-[220px]">
                        {r2.isBooked ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                {r2.namaKelompok || '—'}
                              </span>
                              {r2.idKelompok && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                                  {r2.idKelompok}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              <span className="font-medium text-slate-500">Kelas:</span> {r2.kelasTeori || '—'}
                            </div>
                            <div className="text-[11px] text-slate-600 truncate max-w-xs" title={r2.tema}>
                              <span className="font-medium text-slate-500">Tema:</span> {r2.tema || '—'}
                            </div>
                            <div className="pt-1.5">
                              <button
                                type="button"
                                onClick={() => onClearBooking(slot, 2)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 transition-colors"
                                title="Reset data Room 2"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Reset Room 2</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic text-[11px] flex items-center gap-1 py-1">
                            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
                            <span>Room 2 Kosong</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {slot.isBooked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Penuh (2/2)
                          </span>
                        ) : slot.availableRoomsCount === 1 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Sisa 1 Room
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Tersedia (2 Room)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: TAMBAH SESI JADWAL */}
      {isAddSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Tambah Slot Sesi Presentasi Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSlotModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Menambahkan baris jadwal baru dengan Urutan, Hari, Tanggal, dan Jam yang telah ditentukan ke spreadsheet Anda.
            </p>

            <form onSubmit={handleAddSlotSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Urutan (No.) *</label>
                  <input
                    type="text"
                    required
                    value={newUrutan}
                    onChange={(e) => setNewUrutan(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Hari *</label>
                  <select
                    value={newHari}
                    onChange={(e) => setNewHari(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                    <option value="Minggu">Minggu</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Tanggal *</label>
                <input
                  type="date"
                  required
                  value={newTanggal}
                  onChange={(e) => setNewTanggal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Jam (Waktu) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 08:00 - 08:45"
                  value={newJam}
                  onChange={(e) => setNewJam(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddSlotModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Tambah ke Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PENGATURAN BARIS AWAL & TAB */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                Pengaturan Spreadsheet Presentasi
              </h3>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Nama Tab Sheet (Sheets Tab Name)
                </label>
                <select
                  value={editSheetName}
                  onChange={(e) => setEditSheetName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {(config?.sheets || [editSheetName]).map((sh) => (
                    <option key={sh} value={sh}>
                      {sh}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Pilih tab yang berisi tabel jadwal presentasi.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Mulai Dari Baris Ke- (Start Row)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  required
                  value={editStartRow}
                  onChange={(e) => setEditStartRow(parseInt(e.target.value, 10) || 54)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Sesuai instruksi Anda, data jadwal dimulai pada <span className="font-bold text-slate-700">Baris 54</span>.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Terapkan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
