import React, { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { X, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';

interface CategoryManageModalProps {
  customCategories: string[];
  customCategoryLabels?: Record<string, string>;
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldKey: string, newName: string) => void;
  onDeleteCategory: (categoryKey: string) => void;
  onClose: () => void;
}

export const CategoryManageModal: React.FC<CategoryManageModalProps> = ({
  customCategories,
  customCategoryLabels = {},
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onClose,
}) => {
  useBodyScrollLock(true);
  const [newCatName, setNewCatName] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    onAddCategory(trimmed);
    setNewCatName('');
  };

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditingName(customCategoryLabels[key] || key);
    setDeleteConfirmKey(null);
  };

  const handleSaveEdit = (key: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingKey(null);
      return;
    }
    onRenameCategory(key, trimmed);
    setEditingKey(null);
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-t-[2rem] sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200/90 dark:border-slate-800/90 overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Bar Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                管理自訂記帳類別
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                自訂消費分類，行動端底部抽屜安全無破版
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {/* Add New Category Input */}
          <form onSubmit={handleCreate} className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              新增自訂類別：
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="例如：伴手禮、居酒屋、藥妝、扭蛋..."
                className="min-w-0 flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden transition"
              />
              <button
                type="submit"
                disabled={!newCatName.trim()}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增</span>
              </button>
            </div>
          </form>

          {/* List of Existing Custom Categories */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>現有自訂類別 ({customCategories.length})</span>
            </div>

            {customCategories.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Tag className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
                <p>目前尚無自訂類別</p>
                <p className="text-[11px] text-slate-400">
                  可於上方輸入名稱新增，例如「溫泉」、「扭蛋」、「模型玩具」
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {customCategories.map((key) => {
                  const displayName = customCategoryLabels[key] || key;
                  const isEditingThis = editingKey === key;
                  const isDeletingThis = deleteConfirmKey === key;

                  if (isEditingThis) {
                    return (
                      <div
                        key={key}
                        className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex items-center gap-2 animate-in fade-in duration-100"
                      >
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="min-w-0 flex-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-hidden"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveEdit(key);
                            } else if (e.key === 'Escape') {
                              setEditingKey(null);
                            }
                          }}
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(key)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition active:scale-95 flex items-center gap-1"
                            title="儲存修改"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>儲存</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingKey(null)}
                            className="px-2.5 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 text-slate-600 dark:text-slate-300 text-xs font-medium transition active:scale-95 flex items-center gap-1"
                            title="取消"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>取消</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (isDeletingThis) {
                    return (
                      <div
                        key={key}
                        className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 text-xs animate-in fade-in duration-100"
                      >
                        <span className="text-rose-800 dark:text-rose-200 font-medium truncate max-w-full">
                          確定刪除「{displayName}」？
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 self-end xs:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteCategory(key);
                              setDeleteConfirmKey(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition active:scale-95"
                          >
                            確認刪除
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmKey(null)}
                            className="px-2.5 py-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-300 font-medium text-[11px] transition active:scale-95"
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
                      className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 transition hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">🏷️</span>
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {displayName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(key)}
                          className="px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-xs font-semibold flex items-center gap-1 transition active:scale-95 border border-slate-200 dark:border-slate-700"
                          title="修改名稱"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>修改</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmKey(key)}
                          className="px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1 transition active:scale-95 border border-slate-200 dark:border-slate-700"
                          title="刪除類別"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>刪除</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer with Mobile Safe Area */}
        <div className="px-5 py-3.5 pb-6 sm:pb-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            變更將即時同步套用
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-bold text-xs transition active:scale-95 shadow-xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
