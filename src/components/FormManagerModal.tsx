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
  Clock,
  CalendarX,
  CalendarCheck,
  Edit,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { CustomForm, SpreadsheetConfig } from '../services/sheets';
import {
  formatWIB,
  formatShortWIB,
  formatCountdown,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  isFormClosed,
} from '../services/dateTime';

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

  // Edit vs Create mode
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [selectedSheetName, setSelectedSheetName] = useState(
    currentSpreadsheet?.activeSheetName || 'Sheet1'
  );
  const [startRow, setStartRow] = useState<number>(currentSpreadsheet?.startRow || 54);

  // Access Scheduling & Deadline Fields
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(''); // YYYY-MM-DDTHH:mm
  const [isClosedManually, setIsClosedManually] = useState(false);
  const [closedMessage, setClosedMessage] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available sheets list from current spreadsheet
  const availableSheets = currentSpreadsheet?.sheets || [selectedSheetName];

  useEffect(() => {
    if (currentSpreadsheet) {
      if (!selectedSheetName) {
        setSelectedSheetName(
          currentSpreadsheet.activeSheetName || currentSpreadsheet.sheets[0] || 'Sheet1'
        );
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

  const handleStartEdit = (form: CustomForm) => {
    setEditingFormId(form.id);
    setFormTitle(form.title);
    setFormDesc(form.description || '');
    setFormSlug(form.id);
    setSelectedSheetName(form.sheetName);
    setStartRow(form.startRow || 54);
    setHasDeadline(Boolean(form.closedAt));
    setDeadlineInput(toDatetimeLocalValue(form.closedAt));
    setIsClosedManually(Boolean(form.isClosed));
    setClosedMessage(form.closedMessage || '');
    setErrorMsg(null);
    setActiveTab('create');
  };

  const handleResetForm = () => {
    setEditingFormId(null);
    setFormTitle('');
    setFormDesc('');
    setFormSlug('');
    setSelectedSheetName(
      currentSpreadsheet?.activeSheetName || currentSpreadsheet?.sheets[0] || 'Sheet1'
    );
    setStartRow(currentSpreadsheet?.startRow || 54);
    setHasDeadline(false);
    setDeadlineInput('');
    setIsClosedManually(false);
    setClosedMessage('');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setErrorMsg('Judul form wajib diisi');
      return;
    }

    const sheetId = editingFormId
      ? forms.find((f) => f.id === editingFormId)?.sheetId || currentSpreadsheet?.id
      : currentSpreadsheet?.id;

    if (!sheetId) {
      setErrorMsg('Spreadsheet belum terhubung. Hubungkan spreadsheet terlebih dahulu.');
      return;
    }

    // Generate or preserve slug
    let slug = formSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (!slug) {
      slug = formTitle.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    }
    if (!slug) {
      slug = `form-${Date.now().toString(36)}`;
    }

    // Parse deadline
    const closedAt = hasDeadline && deadlineInput ? fromDatetimeLocalValue(deadlineInput) : null;

    const existingForm = editingFormId ? forms.find((f) => f.id === editingFormId) : null;

    const formToSave: CustomForm = {
      id: editingFormId || slug,
      title: formTitle.trim(),
      description: formDesc.trim(),
      sheetId,
      sheetName: selectedSheetName.trim() || 'Sheet1',
      startRow: Number(startRow) || 54,
      createdAt: existingForm ? existingForm.createdAt : Date.now(),
      closedAt,
      isClosed: isClosedManually,
      closedMessage: closedMessage.trim(),
    };

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSaveForm(formToSave);
      handleResetForm();
      setActiveTab('list');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan form');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        role="dialog"
      >
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Kelola Link & Batas Waktu Form</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Atur link per tab, deadline penutupan (WIB), dan switch buka/tutup form
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
                handleResetForm();
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
                handleResetForm();
                setActiveTab('create');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'create'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>{editingFormId ? 'Edit Pengaturan Form' : 'Buat Link Form Baru'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
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
                    onClick={() => {
                      handleResetForm();
                      setActiveTab('create');
                    }}
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
                  const closedState = isFormClosed(form);

                  return (
                    <div
                      key={form.id}
                      className={`p-5 rounded-2xl border transition-all shadow-2xs space-y-3 ${
                        closedState.isClosed
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-white border-slate-200/90 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{form.title}</h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              Tab: {form.sheetName}
                            </span>

                            {/* Access Status Badge */}
                            {closedState.isClosed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <CalendarX className="w-3 h-3" />
                                <span>
                                  {closedState.status === 'closed_manually'
                                    ? 'Ditutup Manual'
                                    : 'Batas Waktu Berakhir'}
                                </span>
                              </span>
                            ) : form.closedAt ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Ditutup: {formatShortWIB(form.closedAt)}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Buka (Tanpa Batas)</span>
                              </span>
                            )}
                          </div>

                          {form.description && (
                            <p className="text-xs text-slate-500">{form.description}</p>
                          )}

                          {/* Deadline countdown indicator */}
                          {form.closedAt && !closedState.isClosed && (
                            <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                              <span>⏰ Sisa waktu pendaftaran: {formatCountdown(form.closedAt)}</span>
                            </p>
                          )}

                          <p className="text-[11px] text-slate-400 font-mono">
                            Mulai Baris: {form.startRow || 54} • Slug: ?form={form.id}
                          </p>
                        </div>

                        {/* Top Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(form)}
                            className="p-1.5 text-slate-600 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 border border-slate-200 transition-colors"
                            title="Edit Batas Waktu & Pengaturan Form"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>

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

          {/* TAB 2: CREATE / EDIT FORM */}
          {activeTab === 'create' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
                <span className="font-semibold">
                  {editingFormId
                    ? `Sedang mengedit form: ${formTitle || editingFormId}`
                    : 'Membuat link form baru'}
                </span>
                {editingFormId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-emerald-700 hover:underline font-semibold"
                  >
                    Batal Edit (Buat Baru)
                  </button>
                )}
              </div>

              {/* Title Input */}
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
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
                />
              </div>

              {/* Sheet Tab Picker */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Pilih Sheet / Tab Spreadsheet *
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
              </div>

              {/* Slug & Start Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Custom Link Slug {editingFormId ? '(Terkunci)' : '(Opsional)'}
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-[11px] font-mono text-slate-500">
                      ?form=
                    </span>
                    <input
                      type="text"
                      disabled={Boolean(editingFormId)}
                      placeholder="kelas-a"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-r-xl focus:bg-white font-mono disabled:opacity-60"
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

              {/* Description */}
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

              {/* SETTINGS: DEADLINE & ACCESS SCHEDULE */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Pengaturan Batas Waktu & Penutupan Form
                  </h4>
                </div>

                {/* Option 1: Automatic Deadline */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasDeadline}
                      onChange={(e) => {
                        setHasDeadline(e.target.checked);
                        if (!e.target.checked) setDeadlineInput('');
                      }}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-semibold text-slate-800">
                      Tutup Form Otomatis pada Tanggal & Jam Tertentu (Deadline)
                    </span>
                  </label>

                  {hasDeadline && (
                    <div className="pl-6 space-y-2">
                      <input
                        type="datetime-local"
                        value={deadlineInput}
                        onChange={(e) => setDeadlineInput(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:border-emerald-500 font-mono"
                      />
                      {deadlineInput && (
                        <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                          ✅ <strong>Konfirmasi Waktu:</strong> Form akan ditutup pada{' '}
                          <span className="font-bold underline">
                            {formatWIB(fromDatetimeLocalValue(deadlineInput))}
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400">
                        Waktu disinkronkan otomatis sesuai zona waktu Indonesia (WIB).
                      </p>
                    </div>
                  )}
                </div>

                {/* Option 2: Immediate Manual Close Switch */}
                <div className="pt-2 border-t border-slate-200/60">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isClosedManually}
                      onChange={(e) => setIsClosedManually(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs font-semibold text-rose-800">
                      Tutup Formulir Ini Sekarang (Penutupan Manual Seketika)
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 pl-6 mt-0.5">
                    Aktifkan opsi ini jika Anda ingin segera menutup form tanpa menunggu batas waktu.
                  </p>
                </div>

                {/* Option 3: Custom Closed Message */}
                {(hasDeadline || isClosedManually) && (
                  <div className="space-y-1 pt-2 border-t border-slate-200/60">
                    <label className="text-xs font-semibold text-slate-700">
                      Pesan Penutupan Khusus untuk Mahasiswa (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Contoh: Pendaftaran telah ditutup. Silakan hubungi dosen pengampu jika ada perubahan kelompok."
                      value={closedMessage}
                      onChange={(e) => setClosedMessage(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    handleResetForm();
                    setActiveTab('list');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan Pengaturan...</span>
                    </>
                  ) : (
                    <span>{editingFormId ? 'Perbarui Pengaturan Form' : 'Simpan Link Form'}</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
