/**
 * Date and Time utilities for Indonesian Western Time (WIB - UTC+7)
 * Specifically handles form access schedules, deadlines, and countdowns.
 */

/**
 * Format timestamp to Indonesian formatted string in Western Indonesia Time (WIB / Asia/Jakarta)
 * Example output: "3 November 2026 pukul 07:00 WIB"
 */
export function formatWIB(timestamp: number | null | undefined, includeSeconds = false): string {
  if (!timestamp || isNaN(timestamp)) return '-';

  const date = new Date(timestamp);
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  if (includeSeconds) {
    options.second = '2-digit';
  }

  const formatted = new Intl.DateTimeFormat('id-ID', options).format(date);
  return `${formatted.replace(/\./g, ':')} WIB`;
}

/**
 * Format timestamp to a short date-time string in WIB
 * Example output: "3 Nov 2026, 07:00 WIB"
 */
export function formatShortWIB(timestamp: number | null | undefined): string {
  if (!timestamp || isNaN(timestamp)) return '-';

  const date = new Date(timestamp);
  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${formatted.replace(/\./g, ':')} WIB`;
}

/**
 * Calculate remaining countdown until deadline
 * Example: "1 hari 14 jam 20 menit" or "45 menit lagi"
 */
export function formatCountdown(targetTimestamp: number, currentTimestamp = Date.now()): string {
  const diffMs = targetTimestamp - currentTimestamp;
  if (diffMs <= 0) return 'Waktu telah berakhir';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remHours = hours % 24;
  const remMinutes = minutes % 60;

  if (days > 0) {
    return `${days} hari ${remHours} jam${remMinutes > 0 ? ` ${remMinutes} mnt` : ''}`;
  }
  if (hours > 0) {
    return `${hours} jam ${remMinutes} menit`;
  }
  if (minutes > 0) {
    const remSeconds = seconds % 60;
    return `${minutes} menit ${remSeconds > 0 ? `${remSeconds} dtk` : ''}`;
  }
  return `${seconds} detik lagi`;
}

/**
 * Convert timestamp to datetime-local input string (YYYY-MM-DDTHH:mm) in local timezone
 */
export function toDatetimeLocalValue(timestamp?: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
}

/**
 * Convert datetime-local input string value (YYYY-MM-DDTHH:mm) to timestamp in milliseconds
 */
export function fromDatetimeLocalValue(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Check if a form is currently closed / expired
 */
export function isFormClosed(form?: {
  closedAt?: number | null;
  openAt?: number | null;
  isClosed?: boolean;
} | null): {
  isClosed: boolean;
  status: 'active' | 'closed_manually' | 'closed_deadline' | 'upcoming';
  reason?: string;
} {
  if (!form) {
    return { isClosed: false, status: 'active' };
  }

  // 1. Manually closed by lecturer
  if (form.isClosed) {
    return {
      isClosed: true,
      status: 'closed_manually',
      reason: 'Formulir telah ditutup secara manual oleh dosen pengampu.',
    };
  }

  const now = Date.now();

  // 2. Upcoming (not yet opened)
  if (form.openAt && now < form.openAt) {
    return {
      isClosed: true,
      status: 'upcoming',
      reason: `Formulir belum dibuka. Pendaftaran akan dibuka pada ${formatWIB(form.openAt)}.`,
    };
  }

  // 3. Past deadline
  if (form.closedAt && now >= form.closedAt) {
    return {
      isClosed: true,
      status: 'closed_deadline',
      reason: `Batas waktu pengisian formulir telah berakhir pada ${formatWIB(form.closedAt)}.`,
    };
  }

  return { isClosed: false, status: 'active' };
}
