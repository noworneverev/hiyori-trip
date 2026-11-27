import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { PackingTab } from './PackingTab';
import { BookingVaultView } from '../Vault/BookingVaultView';
import { triggerHaptic } from '../../utils/pwaUpdater';
import { useHasActiveModalLayer } from '../../hooks/useModalHistory';
import { CheckSquare, Ticket, Plus } from 'lucide-react';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onJumpToDay?: (dayNumber: number) => void;
  requestedSubTab?: { tab: 'checklist' | 'bookings'; nonce: number } | null;
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
  onJumpToDay,
  requestedSubTab = null,
}) => {
  const [subTab, setSubTab] = useState<'checklist' | 'bookings'>(requestedSubTab?.tab || 'checklist');

  useEffect(() => {
    if (requestedSubTab?.tab) {
      setSubTab(requestedSubTab.tab);
    }
  }, [requestedSubTab?.tab, requestedSubTab?.nonce]);
  const [addTodoTrigger, setAddTodoTrigger] = useState(0);
  const [addBookingTrigger, setAddBookingTrigger] = useState(0);
  const hasActiveModal = useHasActiveModalLayer();
  const isZh = lang === 'zh' || lang === 'zh-CN';

  const pendingTodosCount = useMemo(
    () => (trip.todos || []).filter((t) => !t.completed).length,
    [trip.todos]
  );

  const totalBookingCount = useMemo(() => {
    const voucherCodes = new Set<string>();
    const standalone = (trip.bookings || []).length;
    (trip.bookings || []).forEach((b) => {
      const code = (b.bookingCode || '').trim().toUpperCase();
      if (code) voucherCodes.add(code);
    });
    const seenItinCodes = new Set<string>();
    let inDays = 0;
    (trip.days || []).forEach((d) => {
      (d.items || []).forEach((it) => {
        const code = (it.bookingCode || '').trim().toUpperCase();
        if (!code || voucherCodes.has(code) || seenItinCodes.has(code)) return;
        seenItinCodes.add(code);
        inDays += 1;
      });
    });
    return standalone + inDays;
  }, [trip.bookings, trip.days]);

  const handleFabClick = () => {
    if (!canEdit) return;
    triggerHaptic(10);
    if (subTab === 'checklist') {
      setAddTodoTrigger((n) => n + 1);
    } else {
      setAddBookingTrigger((n) => n + 1);
    }
  };

  return (
    <div className="space-y-4">
      {/* Ultra-Clean 2-Tab iOS Segmented Control: 待辦清單 / 預約憑證 */}
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
          <span>{isZh ? '待辦清單' : 'To-Do List'}</span>
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
          externalAddTrigger={addTodoTrigger}
        />
      ) : (
        <BookingVaultView
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
          onJumpToDay={onJumpToDay}
          hideInlineAddButton
          externalAddTrigger={addBookingTrigger}
        />
      )}

      {/* Bottom-Right Floating Action Button (+) for Adding Todo / Booking Voucher */}
      {canEdit &&
        !hasActiveModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            onClick={handleFabClick}
            aria-label={
              subTab === 'checklist'
                ? isZh ? '新增待辦事項' : 'Add to-do'
                : isZh ? '新增預約憑證' : 'Add voucher'
            }
            title={
              subTab === 'checklist'
                ? isZh ? '新增待辦' : 'Add to-do'
                : isZh ? '新增預約憑證' : 'Add voucher'
            }
            className="fixed right-4 sm:right-6 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 z-40 w-14 h-14 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white shadow-lg shadow-teal-900/25 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>,
          document.body
        )}
    </div>
  );
};
