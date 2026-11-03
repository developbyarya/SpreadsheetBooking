import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Users,
  ShieldCheck,
  X,
  Sparkles,
} from 'lucide-react';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetTitle?: string;
  sheetId?: string;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  sheetTitle = 'Booking Presentasi Data Science',
  sheetId,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Generate public booking URL without login requirement
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?view=book${sheetId ? `&sheetId=${sheetId}` : ''}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
        role="dialog"
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Bagikan Link Booking Presentasi</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Mahasiswa / kelompok dapat memilih jadwal tanpa perlu login
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

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Link Booking Publik:</span>
              {copied && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  Berhasil disalin!
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin' : 'Salin Link'}</span>
              </button>
            </div>
          </div>

          {/* Benefits highlight */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Fitur Pengisian Form:</span>
            </div>
            <ul className="space-y-1.5 text-slate-600">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  <strong className="text-slate-700">Tanpa Login</strong> — Kelompok cukup membuka link tanpa akun Google.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  <strong className="text-slate-700">One Field Per Page</strong> — Tampilan simpel fokus mengisi waktu, kelas, nama, tema, dan ID kelompok.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  <strong className="text-slate-700">Pencegahan Bentrok</strong> — Slot yang sudah dipilih otomatis tidak bisa diambil kelompok lain.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Tutup
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <span>Uji Coba Tampilan Mahasiswa</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
