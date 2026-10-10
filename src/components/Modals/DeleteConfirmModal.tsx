import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  tripTitle: string;
  isLastTrip: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  tripTitle,
  isLastTrip,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
          isLastTrip
            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
        }`}>
          {isLastTrip ? <AlertTriangle className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            {isLastTrip ? '無法刪除最後一個行程' : '確定要刪除此旅程嗎？'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isLastTrip
              ? '系統至少需保留一個旅遊行程。您可以選擇直接「編輯此行程」修改內容，或先建立新行程後再來刪除此行程。'
              : `「${tripTitle}」將從本機與雲端同步刪除，包含所有排程與記帳記錄，此操作無法復原。`}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          {isLastTrip ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition active:scale-95"
            >
              我知道了
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition active:scale-95"
              >
                確認刪除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
