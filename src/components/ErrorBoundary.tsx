import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  confirmReset: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    confirmReset: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    if (
      error.message?.includes('Cannot set property fetch') ||
      error.stack?.includes('chrome-extension://')
    ) {
      console.warn('Ignored browser extension error in ErrorBoundary:', error);
      return { hasError: false, error: null, confirmReset: false };
    }
    return { hasError: true, error, confirmReset: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  private handleReset = async () => {
    if (!this.state.confirmReset) {
      this.setState({ confirmReset: true });
      return;
    }
    try {
      const { resetAllLocalData } = await import('../utils/storage');
      await resetAllLocalData();
    } catch {
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#FAF9F6] dark:bg-[#090D16] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                載入旅程時發生異常
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                別擔心！您的旅程資料已安全儲存在本機與雲端，請先嘗試重新整理頁面。
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-[#F3F1EC] dark:bg-slate-800/80 text-[11px] font-mono text-left text-slate-600 dark:text-slate-300 overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            {this.state.confirmReset && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 text-left leading-relaxed">
                確定要清除本機快取嗎？這會移除尚未同步至雲端的本機行程與相片快取。再次點擊下方紅色按鈕以確認重置。
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重新整理頁面</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl border font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer ${
                  this.state.confirmReset
                    ? 'border-rose-600 bg-rose-600 hover:bg-rose-700 text-white font-bold'
                    : 'border-[#E5E2DC] dark:border-slate-700 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{this.state.confirmReset ? '確認清除本機快取' : '重置本機快取'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
