import React from 'react';
import { User } from 'firebase/auth';
import {
  CalendarDays,
  FileSpreadsheet,
  ExternalLink,
  LogOut,
  Settings,
  CalendarCheck2,
  SlidersHorizontal,
  RefreshCw,
  Share2,
  Layers,
} from 'lucide-react';
import { SpreadsheetConfig } from '../services/sheets';
import { GoogleSignInButton } from './GoogleSignInButton';

interface HeaderProps {
  user: User | null;
  spreadsheet: SpreadsheetConfig | null;
  activeTab: 'booking' | 'manager';
  onTabChange: (tab: 'booking' | 'manager') => void;
  onOpenSpreadsheetModal: () => void;
  onOpenShareModal?: () => void;
  onOpenFormManager?: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
  isLoadingAuth?: boolean;
  bookingsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  spreadsheet,
  activeTab,
  onTabChange,
  onOpenSpreadsheetModal,
  onOpenShareModal,
  onOpenFormManager,
  onSignIn,
  onSignOut,
  onRefreshData,
  isRefreshing = false,
  isLoadingAuth = false,
  bookingsCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-700/10">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  Slot<span className="text-emerald-600">Sync</span>
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 hidden sm:inline-block">
                  Google Sheets Powered
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden md:block">
                Appointments & schedule synced to your spreadsheet
              </p>
            </div>
          </div>

          {/* Navigation View Switcher (Only when logged in or viewing) */}
          {user && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => onTabChange('booking')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'booking'
                    ? 'bg-white text-emerald-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Book Slot</span>
              </button>
              <button
                type="button"
                onClick={() => onTabChange('manager')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'manager'
                    ? 'bg-white text-emerald-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>Manage Schedule</span>
                {bookingsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {bookingsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Right Actions: Spreadsheet Badge & User Auth */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {user ? (
              <>
                {/* Spreadsheet status */}
                {spreadsheet ? (
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-xl p-1 pr-2 sm:pr-3">
                    <button
                      type="button"
                      onClick={onOpenSpreadsheetModal}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-700 hover:text-emerald-700 rounded-lg hover:bg-white transition-colors"
                      title="Manage Connected Spreadsheet"
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="truncate max-w-[120px] sm:max-w-[160px] font-medium text-slate-800">
                        {spreadsheet.title}
                      </span>
                    </button>

                    <a
                      href={spreadsheet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-white transition-colors"
                      title="Open Google Sheet in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={onRefreshData}
                      disabled={isRefreshing}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-white transition-colors disabled:opacity-50"
                      title="Sync latest data from Sheet"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`}
                      />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenSpreadsheetModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Connect Sheet</span>
                  </button>
                )}

                {/* Share Link Button */}
                {spreadsheet && onOpenShareModal && (
                  <button
                    type="button"
                    onClick={onOpenShareModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-2xs"
                    title="Bagikan Link Booking ke Mahasiswa"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">Bagikan Link</span>
                  </button>
                )}

                {/* Multi-Form & Tabs Manager Button */}
                {spreadsheet && onOpenFormManager && (
                  <button
                    type="button"
                    onClick={onOpenFormManager}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
                    title="Kelola Link, Tab & Batas Waktu Form (WIB)"
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span className="hidden md:inline">Batas Waktu & Form</span>
                  </button>
                )}

                {/* User Profile & Sign Out */}
                <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}

                  <div className="hidden lg:block text-left text-xs">
                    <p className="font-semibold text-slate-800 truncate max-w-[120px]">
                      {user.displayName || 'Authenticated'}
                    </p>
                    <p className="text-slate-400 truncate max-w-[120px]">
                      {user.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onSignOut}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <GoogleSignInButton
                onClick={onSignIn}
                isLoading={isLoadingAuth}
                text="Sign in with Google"
                className="scale-90 sm:scale-100"
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
