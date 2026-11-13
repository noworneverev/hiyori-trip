import React, { useState } from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { PackingTab } from './PackingTab';
import { MemoTab } from './MemoTab';
import { CheckSquare, ShieldAlert } from 'lucide-react';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
}) => {
  const [subTab, setSubTab] = useState<'checklist' | 'memo'>('checklist');

  return (
    <div className="space-y-4">
      {/* Compact 2-pill sub-tab toggle */}
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex w-full sm:w-auto p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 gap-1">
          <button
            type="button"
            onClick={() => setSubTab('checklist')}
            className={`flex-1 sm:flex-initial min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              subTab === 'checklist'
                ? 'bg-white dark:bg-zinc-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '待辦與行李' : 'Checklist & Packing'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('memo')}
            className={`flex-1 sm:flex-initial min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              subTab === 'memo'
                ? 'bg-white dark:bg-zinc-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span>{lang === 'zh' ? '筆記與急救' : 'Notes & SOS'}</span>
          </button>
        </div>
      </div>

      {subTab === 'checklist' ? (
        <PackingTab trip={trip} lang={lang} canEdit={canEdit} onUpdateTrip={onUpdateTrip} requireAuth={requireAuth} />
      ) : (
        <MemoTab trip={trip} lang={lang} canEdit={canEdit} onUpdateTrip={onUpdateTrip} requireAuth={requireAuth} />
      )}
    </div>
  );
};

