import React, { useState } from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  Link2,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  Loader2,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import { SpreadsheetConfig } from '../services/sheets';

interface SpreadsheetPickerProps {
  isOpen: boolean;
  currentSpreadsheet: SpreadsheetConfig | null;
  onClose: () => void;
  onCreateNew: (title?: string) => Promise<void>;
  onConnectExisting: (sheetUrlOrId: string) => Promise<void>;
  isCreating?: boolean;
  isConnecting?: boolean;
}

export const SpreadsheetPicker: React.FC<SpreadsheetPickerProps> = ({
  isOpen,
  currentSpreadsheet,
  onClose,
  onCreateNew,
  onConnectExisting,
  isCreating = false,
  isConnecting = false,
}) => {
  const [activeTab, setActiveTab] = useState<'existing' | 'create'>('existing');
  const [sheetInput, setSheetInput] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!sheetInput.trim()) {
      setErrorMsg('Mohon tempelkan URL atau ID Google Spreadsheet Anda');
      return;
    }
    try {
      await onConnectExisting(sheetInput.trim());
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menghubungkan spreadsheet. Pastikan izin akses Google Sheet sudah aktif.'
      );
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await onCreateNew(customTitle.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat spreadsheet template');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Hubungkan Google Spreadsheet</h3>
              <p className="text-xs text-slate-500">
                Jadwal presentasi dibaca dan disimpan langsung ke Google Sheet Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Sheet Info */}
        {currentSpreadsheet && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50/60 border border-emerald-200/70 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-950 truncate">
                  Terhubung: {currentSpreadsheet.title}
                </p>
                <p className="text-[11px] text-emerald-700 font-mono truncate">
                  Tab: {currentSpreadsheet.activeSheetName} | Mulai Baris: {currentSpreadsheet.startRow}
                </p>
              </div>
            </div>
            <a
              href={currentSpreadsheet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors shrink-0 shadow-2xs"
            >
              <span>Buka Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Option Tabs */}
        <div className="px-6 pt-4">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('existing');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'existing'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-4 h-4 text-emerald-600" />
              <span>Gunakan Spreadsheet Saya</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Buat Template Baru</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Connect Existing (Default) */}
        {activeTab === 'existing' && (
          <form onSubmit={handleConnect} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Link URL atau ID Google Spreadsheet Anda
              </label>
              <input
                type="text"
                required
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Salin link dari bilah alamat browser saat membuka spreadsheet Anda.
              </p>
            </div>

            {/* Layout Column Mapping Preview */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Info className="w-3.5 h-3.5 text-emerald-600" />
                <span>Format Kolom Terdeteksi (Mulai Baris 54):</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="font-bold text-slate-800">A:</span> Urutan
                </div>
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="font-bold text-slate-800">B:</span> Hari
                </div>
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="font-bold text-slate-800">C:</span> Tanggal
                </div>
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="font-bold text-slate-800">D:</span> Jam
                </div>
                <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200 text-emerald-900">
                  <span className="font-bold">E:</span> Kelas Teori (Booking)
                </div>
                <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200 text-emerald-900">
                  <span className="font-bold">F:</span> Nama Kelompok (Booking)
                </div>
                <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200 text-emerald-900">
                  <span className="font-bold">G:</span> Tema (Booking)
                </div>
                <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200 text-emerald-900">
                  <span className="font-bold">H:</span> ID_Kelompok (Booking)
                </div>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Hari, Tanggal, dan Jam sudah terisi sebelumnya. Kolom Kelas Teori, Nama Kelompok, Tema, dan ID_Kelompok akan otomatis diisi saat kelompok membooking.
              </p>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isConnecting}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menghubungkan...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    <span>Hubungkan Spreadsheet</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Create Template */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Judul Spreadsheet Baru
              </label>
              <input
                type="text"
                placeholder="Jadwal Booking Presentasi Kelompok"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Format yang akan dibuat di Google Drive Anda:
              </p>
              <ul className="space-y-1 list-disc list-inside text-slate-600">
                <li>Baris 1-52: Judul dan petunjuk presentasi</li>
                <li>Baris 53: Header kolom Urutan, Hari, Tanggal, Jam, Kelas Teori, Nama Kelompok, Tema, ID_Kelompok</li>
                <li>Baris 54+: Slot presentasi awal dengan Hari, Tanggal, dan Jam yang siap dipilih</li>
              </ul>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Membuat Spreadsheet di Drive...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Buat & Hubungkan Template</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
