import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  FileSpreadsheet,
  X,
  Sparkles,
  Link2,
  Sliders,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { CustomForm, SpreadsheetConfig } from '../services/sheets';

interface FormManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpreadsheet: SpreadsheetConfig | null;
  forms: CustomForm[];
  onSaveForm: (form: CustomForm) => Promise<void>;
  onDeleteForm: (formId: string) => Promise<void>;
}

export const FormManagerModal: React.FC<FormManagerModalProps> = ({
  isOpen,
  onClose,
  currentSpreadsheet,
  forms,
  onSaveForm,
  onDeleteForm,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [selectedSheetName, setSelectedSheetName] = useState(
    currentSpreadsheet?.activeSheetName || 'Sheet1'
  );
  const [startRow, setStartRow] = useState<number>(currentSpreadsheet?.startRow || 54);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available sheets list from current spreadsheet
  const availableSheets = currentSpreadsheet?.sheets || [selectedSheetName];

  useEffect(() => {
    if (currentSpreadsheet) {
      if (!selectedSheetName) {
        setSelectedSheetName(currentSpreadsheet.activeSheetName || currentSpreadsheet.sheets[0] || 'Sheet1');
      }
    }
  }, [currentSpreadsheet, selectedSheetName]);

  if (!isOpen) return null;

  const baseUrl = window.location.origin + window.location.pathname;

  const handleCopyLink = async (form: CustomForm) => {
    const url = `${baseUrl}?form=${form.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(form.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      setCopiedId(form.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setErrorMsg('Judul form wajib diisi');
      return;
    }
    if (!currentSpreadsheet?.id) {
      setErrorMsg('Spreadsheet belum terhubung. Hubungkan spreadsheet terlebih dahulu.');
      return;
    }

    // Generate slug from title or custom slug
    let slug = formSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (!slug) {
      slug = formTitle.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    }
    if (!slug) {
      slug = `form-${Date.now().toString(36)}`;
    }

    const newForm: CustomForm = {
      id: slug,
      title: formTitle.trim(),
      description: formDesc.trim() || undefined,
      sheetId: currentSpreadsheet.id,
      sheetName: selectedSheetName.trim() || 'Sheet1',
      startRow: Number(startRow) || 54,
      createdAt: Date.now(),
    };

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSaveForm(newForm);
      setActiveTab('list');
      // Reset form
      setFormTitle('');
      setFormDesc('');
      setFormSlug('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat form link');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        role="dialog"
      >
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Kelola Link & Tab Form Presentasi</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Buat beberapa link form berbeda untuk sheet/tab yang berbeda (Sheet 1, Sheet 2, Kelas A, Kelas B)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('list');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Daftar Link Form ({forms.length})</span>
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
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Buat Link Form Baru</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: LIST FORMS */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {forms.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <p className="text-sm font-medium text-slate-600">
                    Belum ada custom link form yang dibuat.
                  </p>
                  <p className="text-xs text-slate-400">
                    Anda dapat membuat link unik untuk setiap kelas atau tab sheet yang berbeda.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Buat Form Pertama</span>
                  </button>
                </div>
              ) : (
                forms.map((form) => {
                  const formUrl = `${baseUrl}?form=${form.id}`;
                  const isCopied = copiedId === form.id;

                  return (
                    <div
                      key={form.id}
                      className="p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-emerald-300 transition-all shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{form.title}</h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Tab: {form.sheetName}
                            </span>
                          </div>
                          {form.description && (
                            <p className="text-xs text-slate-500">{form.description}</p>
                          )}
                          <p className="text-[11px] text-slate-400 font-mono">
                            Mulai Baris: {form.startRow || 54} • Slug: ?form={form.id}
                          </p>
                        </div>

                        {forms.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteForm(form.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Hapus Link Form"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* URL Box & Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          readOnly
                          value={formUrl}
                          className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyLink(form)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                            isCopied
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                          }`}
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
                        </button>
                        <a
                          href={formUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                          title="Buka form di tab baru"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: CREATE NEW FORM LINK */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Judul Form (Customizable Title) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jadwal Presentasi Kelas A / Sesi 1"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400">
                  Judul ini akan tampil di bagian atas formulir pendaftaran mahasiswa.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Pilih Sheet / Tab Spreadsheet (Sheet 1, Sheet 2, dll) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedSheetName}
                    onChange={(e) => setSelectedSheetName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    {availableSheets.map((sh) => (
                      <option key={sh} value={sh}>
                        Tab: {sh}
                      </option>
                    ))}
                    <option value="__custom__">+ Ketik Nama Tab Lain...</option>
                  </select>

                  {selectedSheetName === '__custom__' && (
                    <input
                      type="text"
                      placeholder="Ketik nama tab (misal: Sheet 2)..."
                      onChange={(e) => setSelectedSheetName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                    />
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Pilih tab yang menjadi tujuan penyimpanan data untuk form ini.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Custom Link Slug (Opsional)
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-[11px] font-mono text-slate-500">
                      ?form=
                    </span>
                    <input
                      type="text"
                      placeholder="kelas-a"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-r-xl focus:bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Mulai Dari Baris Ke- (Start Row)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={startRow}
                    onChange={(e) => setStartRow(parseInt(e.target.value, 10) || 54)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Petunjuk Tambahan / Deskripsi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Khusus kelompok mahasiswa Kelas A TI-3A"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Simpan & Buat Link Form</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Setiap link form memiliki tab tujuan dan judul masing-masing tanpa perlu login.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
