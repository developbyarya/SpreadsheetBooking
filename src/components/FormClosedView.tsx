import React from 'react';
import { Clock, CalendarX, Lock, ShieldAlert, Sparkles, AlertCircle } from 'lucide-react';
import { formatWIB } from '../services/dateTime';

interface FormClosedViewProps {
  sheetTitle?: string;
  tabName?: string;
  closedAt?: number | null;
  openAt?: number | null;
  isClosedManually?: boolean;
  closedMessage?: string;
  status?: 'closed_manually' | 'closed_deadline' | 'upcoming' | 'active';
  onOpenAdminLogin: () => void;
}

export const FormClosedView: React.FC<FormClosedViewProps> = ({
  sheetTitle = 'Jadwal Presentasi',
  tabName,
  closedAt,
  openAt,
  isClosedManually = false,
  closedMessage,
  status = 'closed_deadline',
  onOpenAdminLogin,
}) => {
  const isUpcoming = status === 'upcoming' || Boolean(openAt && Date.now() < openAt);
  const isManual = isClosedManually || status === 'closed_manually';

  const defaultMessage = isUpcoming
    ? `Pendaftaran jadwal presentasi ini belum dibuka. Silakan kembali saat pendaftaran resmi dibuka.`
    : isManual
    ? 'Pendaftaran jadwal presentasi telah ditutup secara langsung oleh dosen pengampu.'
    : `Batas waktu pengisian jadwal presentasi telah berakhir${
        closedAt ? ` pada ${formatWIB(closedAt)}` : ''
      }. Pemesanan slot baru sudah tidak dapat dilakukan.`;

  return (
    <div className="min-h-[80vh] flex flex-col justify-between py-8 px-4 sm:px-6 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between pb-6 border-b border-slate-200">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              {sheetTitle}
            </h2>
            {tabName && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {tabName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Sistem Booking Jadwal Presentasi Mahasiswa Informatika UPN
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAdminLogin}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Login Dosen</span>
        </button>
      </div>

      {/* Main Closed Card */}
      <div className="max-w-xl w-full mx-auto my-auto py-8">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden text-center">
          {/* Header Banner */}
          <div
            className={`p-8 text-white ${
              isUpcoming
                ? 'bg-gradient-to-br from-blue-600 to-indigo-700'
                : 'bg-gradient-to-br from-amber-500 via-rose-600 to-rose-700'
            }`}
          >
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs">
              {isUpcoming ? (
                <Clock className="w-9 h-9 text-white" />
              ) : (
                <CalendarX className="w-9 h-9 text-white" />
              )}
            </div>

            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-xs mb-2">
              {isUpcoming ? 'Belum Dibuka' : 'Pendaftaran Ditutup'}
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {isUpcoming ? 'Formulir Belum Dibuka' : 'Pendaftaran Telah Ditutup'}
            </h1>

            <p className="text-white/80 text-xs sm:text-sm mt-1.5 max-w-sm mx-auto">
              {isUpcoming
                ? `Pendaftaran akan dibuka pada ${formatWIB(openAt)}`
                : closedAt
                ? `Batas waktu pengisian berakhir pada ${formatWIB(closedAt)}`
                : 'Formulir pendaftaran saat ini sedang tidak menerima respons'}
            </p>
          </div>

          {/* Details Body */}
          <div className="p-8 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Pemberitahuan Dosen Pengampu
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {closedMessage || defaultMessage}
                  </p>
                </div>
              </div>

              {closedAt && !isUpcoming && (
                <div className="pt-3 border-t border-slate-200 text-xs flex justify-between text-slate-500">
                  <span>Waktu Penutupan:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {formatWIB(closedAt)}
                  </span>
                </div>
              )}

              {openAt && isUpcoming && (
                <div className="pt-3 border-t border-slate-200 text-xs flex justify-between text-slate-500">
                  <span>Waktu Pembukaan:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {formatWIB(openAt)}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenAdminLogin}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold rounded-xl text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs"
              >
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>Login Dosen (Buka Form / Edit Jadwal)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-400 pt-6">
        <span>Sistem Booking Jadwal Presentasi • Jurusan Informatika UPN Veteran Yogyakarta</span>
      </div>
    </div>
  );
};
