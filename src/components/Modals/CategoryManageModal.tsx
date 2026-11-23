import React, { useState } from 'react';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
} from '../UI/IosPrimitives';
import { DEFAULT_EXPENSE_CATEGORIES } from '../Expenses/expenseMeta';
import { Plus, Pencil, Trash2, Check, X, Tag } from 'lucide-react';

interface CategoryManageModalProps {
  customCategories: string[];
  customCategoryLabels?: Record<string, string>;
  categoryUsageCounts?: Record<string, number>;
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldKey: string, newName: string) => void;
  onDeleteCategory: (categoryKey: string) => void;
  onClose: () => void;
}

export const CategoryManageModal: React.FC<CategoryManageModalProps> = ({
  customCategories,
  customCategoryLabels = {},
  categoryUsageCounts = {},
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onClose,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDuplicateName = (candidate: string, excludeKey?: string): boolean => {
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) return false;
    if (
      Object.entries(DEFAULT_EXPENSE_CATEGORIES).some(
        ([k, meta]) =>
          k !== excludeKey &&
          (k.toLowerCase() === normalized ||
            (customCategoryLabels[k] || meta.label).trim().toLowerCase() === normalized)
      )
    ) {
      return true;
    }
    return customCategories.some(
      (k) =>
        k !== excludeKey &&
        (k.toLowerCase() === normalized ||
          (customCategoryLabels[k] || k).trim().toLowerCase() === normalized)
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (isDuplicateName(trimmed)) {
      setErrorMessage(`「${trimmed}」類別已存在，請輸入不同名稱`);
      return;
    }
    setErrorMessage(null);
    onAddCategory(trimmed);
    setNewCatName('');
  };

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditingName(customCategoryLabels[key] || key);
    setDeleteConfirmKey(null);
    setErrorMessage(null);
  };

  const handleSaveEdit = (key: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingKey(null);
      setErrorMessage(null);
      return;
    }
    if (isDuplicateName(trimmed, key)) {
      setErrorMessage(`「${trimmed}」已被其他類別使用`);
      return;
    }
    setErrorMessage(null);
    onRenameCategory(key, trimmed);
    setEditingKey(null);
  };

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-lg"
      zIndexClass="z-[80]"
      variant="grouped"
      ariaLabel="管理自訂記帳類別"
    >
      <IosNavBar
        title="自訂記帳類別"
        leftLabel="關閉"
        onLeftClick={onClose}
        rightLabel="完成"
        onRightClick={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        {errorMessage && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 text-amber-600 hover:text-amber-800 cursor-pointer"
              aria-label="關閉提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Add New Category Group */}
        <IosInsetGroup header="新增自訂類別">
          <form onSubmit={handleCreate} className="px-4 py-2.5 flex items-center gap-2.5 min-h-[52px]">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => {
                setNewCatName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="例如：伴手禮、居酒屋、藥妝、扭蛋..."
              className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
            />
            <button
              type="submit"
              disabled={!newCatName.trim()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增</span>
            </button>
          </form>
        </IosInsetGroup>

        {/* Existing Custom Categories List */}
        <IosInsetGroup
          header={`現有自訂類別 (${customCategories.length})`}
          footer="重新命名會同步更新此行程中所有對應的消費紀錄；刪除使用中的類別會自動歸類至「其他雜支」。"
        >
          {customCategories.length === 0 ? (
            <div className="py-10 px-4 text-center text-xs text-slate-400 space-y-1.5">
              <Tag className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
              <p>目前尚無自訂類別</p>
            </div>
          ) : (
            customCategories.map((key) => {
              const displayName = customCategoryLabels[key] || key;
              const usageCount = categoryUsageCounts[key] || 0;
              const isEditingThis = editingKey === key;
              const isDeletingThis = deleteConfirmKey === key;

              if (isEditingThis) {
                return (
                  <div
                    key={key}
                    className="px-4 py-2.5 min-h-[52px] bg-amber-50/70 dark:bg-amber-950/30 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => {
                        setEditingName(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEdit(key);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingKey(null);
                          setErrorMessage(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(key)}
                      className="min-h-[38px] px-3 rounded-lg bg-teal-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>儲存</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(null);
                        setErrorMessage(null);
                      }}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      aria-label="取消編輯"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              }

              if (isDeletingThis) {
                return (
                  <div
                    key={key}
                    className="px-4 py-3 min-h-[52px] bg-rose-50/80 dark:bg-rose-950/35 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="text-rose-800 dark:text-rose-200 font-semibold block truncate">
                        確定刪除「{displayName}」？
                      </span>
                      {usageCount > 0 && (
                        <span className="text-[11px] text-rose-700/80 dark:text-rose-300/80 block mt-0.5">
                          此類別有 {usageCount} 筆消費紀錄，刪除後將歸類至「其他雜支」
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteCategory(key);
                          setDeleteConfirmKey(null);
                        }}
                        className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                      >
                        刪除
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmKey(null)}
                        className="min-h-[38px] px-2.5 rounded-lg text-slate-600 dark:text-slate-300 font-semibold text-xs hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className="px-4 py-2 min-h-[48px] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Tag className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span className="text-sm sm:text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {displayName}
                    </span>
                    {usageCount > 0 && (
                      <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                        {usageCount} 筆
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(key)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition cursor-pointer"
                      title="重新命名"
                      aria-label={`重新命名 ${displayName}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(null);
                        setDeleteConfirmKey(key);
                      }}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="刪除類別"
                      aria-label={`刪除 ${displayName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </IosInsetGroup>
      </div>
    </IosModalSheet>
  );
};
