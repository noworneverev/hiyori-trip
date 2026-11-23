import React, { useState, useMemo } from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { PackingTab } from './PackingTab';
import { BookingVaultView } from '../Vault/BookingVaultView';
import { CheckSquare, Ticket } from 'lucide-react';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onJumpToDay?: (dayNumber: number) => void;
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
  onJumpToDay,
}) => {
  const [subTab, setSubTab] = useState<'checklist' | 'bookings'>('checklist');
  const isZh = lang === 'zh' || lang === 'zh-CN';

  const pendingTodosCount = useMemo(
    () => (trip.todos || []).filter((t) => !t.completed).length,
    [trip.todos]
  );

  const totalBookingCount = useMemo(() => {
    const standalone = (trip.bookings || []).length;
    const inDays = (trip.days || []).reduce(
      (sum, d) =>
        sum + (d.items || []).filter((it) => Boolean(it.bookingCode && it.bookingCode.trim())).length,
      0
    );
    return standalone + inDays;
  }, [trip.bookings, trip.days]);

  return (
    <div className="space-y-4">
      {/* Ultra-Clean 2-Tab iOS Segmented Control: 待辦隨記 / 預約憑證 */}
      <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto p-1 rounded-2xl bg-[#FAF9F6] dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 gap-1">
        <button
          type="button"
          onClick={() => setSubTab('checklist')}
          className={`min-h-[42px] sm:min-h-[38px] px-3 sm:px-5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
            subTab === 'checklist'
              ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs border border-[#E5E2DC]/60 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
          <span>{isZh ? '待辦與隨記' : 'To-Do & Notes'}</span>
          {pendingTodosCount > 0 && (
            <span className="font-mono tabular-nums text-[10px] opacity-80">{pendingTodosCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('bookings')}
          className={`min-h-[42px] sm:min-h-[38px] px-3 sm:px-5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
            subTab === 'bookings'
              ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs border border-[#E5E2DC]/60 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Ticket className="w-3.5 h-3.5 shrink-0" />
          <span>{isZh ? '預約憑證' : 'Vault'}</span>
          {totalBookingCount > 0 && (
            <span className="font-mono tabular-nums text-[10px] opacity-80">{totalBookingCount}</span>
          )}
        </button>
      </div>

      {subTab === 'checklist' ? (
        <PackingTab
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
        />
      ) : (
        <BookingVaultView
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
          onJumpToDay={onJumpToDay}
        />
      )}
    </div>
  );
};
