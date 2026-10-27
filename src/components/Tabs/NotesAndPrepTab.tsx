import React, { useState } from 'react';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { PackingTab } from './PackingTab';
import { MemoTab } from './MemoTab';
import { CheckSquare, FileText, ShieldAlert } from 'lucide-react';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  initialSubTab?: 'packing' | 'memo';
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
  initialSubTab = 'packing',
}) => {
  const t = TRANSLATIONS[lang];
  const [activeSubTab, setActiveSubTab] = useState<'packing' | 'memo'>(initialSubTab);

  // Compute counts for clean metadata
  const totalPacking = trip.packingList?.length || 0;
  const packedCount = trip.packingList?.filter((i) => i.packed)?.length || 0;
  const totalTodos = trip.todos?.length || 0;
  const completedTodos = trip.todos?.filter((i) => i.completed)?.length || 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Apple-style Top Segmented Control */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-3 sm:p-4 border border-slate-200/90 dark:border-zinc-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? '行前準備與隨行備忘' : 'Trip Prep & Notes'}</span>
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
              <span>{packedCount}/{totalPacking} 件行李已打包</span>
              <span aria-hidden="true">·</span>
              <span>{completedTodos}/{totalTodos} 項待辦已完成</span>
            </div>
          </div>

          {/* Segmented Control */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-zinc-800 rounded-2xl self-start sm:self-auto border border-slate-200/50 dark:border-zinc-700/50">
            <button
              type="button"
              onClick={() => setActiveSubTab('packing')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                activeSubTab === 'packing'
                  ? 'bg-white dark:bg-[#2C2C2E] text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? '行李與待辦清單' : 'Checklists'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('memo')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                activeSubTab === 'memo'
                  ? 'bg-white dark:bg-[#2C2C2E] text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span>{lang === 'zh' ? '便籤筆記與安全專區' : 'Notes & Safety'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering */}
      <div>
        {activeSubTab === 'packing' ? (
          <PackingTab trip={trip} lang={lang} onUpdateTrip={onUpdateTrip} />
        ) : (
          <MemoTab trip={trip} lang={lang} onUpdateTrip={onUpdateTrip} />
        )}
      </div>
    </div>
  );
};
