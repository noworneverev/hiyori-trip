import React, { useState, useEffect } from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import { enableTripCollaboration } from '../../utils/firebase';
import { getPublicShareBaseUrl } from '../../utils/url';
import { User } from 'firebase/auth';
import {
  X,
  Share2,
  Copy,
  Check,
  Send,
  QrCode,
  Globe,
  Loader2,
  MapPin,
  Sparkles,
  Users,
  FileText,
  Radio,
} from 'lucide-react';

interface ShareTripModalProps {
  trip: Trip;
  userId?: string;
  currentUser?: User | null;
  onUpdateTrip?: (updatedTrip: Trip) => void;
  lang: Language;
  onClose: () => void;
}

export const ShareTripModal: React.FC<ShareTripModalProps> = ({
  trip,
  currentUser,
  onUpdateTrip,
  lang,
  onClose,
}) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(() => {
    if (trip.collabId && trip.isCollaborative) {
      const base = getPublicShareBaseUrl();
      return `${base}?collab=${trip.collabId}`;
    }
    return null;
  });
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);

  const handleGenerateLiveShare = async () => {
    setIsPublishing(true);
    try {
      const collabId = await enableTripCollaboration(trip, currentUser);
      const base = getPublicShareBaseUrl();
      const url = `${base}?collab=${collabId}`;
      setShareUrl(url);

      if (onUpdateTrip) {
        onUpdateTrip({
          ...trip,
          collabId,
          isCollaborative: true,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('Failed to enable collaboration:', err);
      // Fallback
      const base = getPublicShareBaseUrl();
      const fallbackCollabId = trip.collabId || `collab_${Date.now()}`;
      setShareUrl(`${base}?collab=${fallbackCollabId}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyTextItinerary = () => {
    let text = `【${trip.title}】\n目的地：${trip.destination}\n日期：${trip.startDate} ~ ${trip.endDate}\n`;
    trip.days.forEach((day) => {
      text += `\nDay ${day.dayNumber}（${day.theme || '當日行程'}）：\n`;
      day.items.forEach((item) => {
        text += `• ${item.startTime} ${item.title}${item.locationName ? ` (${item.locationName})` : ''}\n`;
      });
    });
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `【${trip.title}】旅遊行程`,
          text: `嗨！這是我們預計前往 ${trip.destination} 的旅遊行程規劃，點開即可即時查看每日景點、待辦與備忘：`,
          url: shareUrl,
        });
      } catch (e) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const totalSpots = trip.days.reduce((acc, d) => acc + d.items.length, 0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1C1C1E] shadow-2xl border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {lang === 'zh' ? '行程即時分享與協作' : 'Share Trip & Live Collaboration'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {lang === 'zh' ? '仿 Notion 模式，單一即時連結，內容修改自動同步' : 'Notion-style live link with auto-sync'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Trip Summary Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-850/70 border border-slate-200/90 dark:border-zinc-750 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300">
                <MapPin className="w-3.5 h-3.5" />
                {trip.destination}
              </span>
              <span className="font-mono text-slate-500 dark:text-zinc-400">
                {formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}
              </span>
            </div>

            <h4 className="font-black text-lg text-slate-900 dark:text-white">
              {trip.title}
            </h4>

            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-zinc-400 font-mono pt-1">
              <span>{trip.days.length} 天日程</span>
              <span>•</span>
              <span>{totalSpots} 個景點安排</span>
              <span>•</span>
              <span>預算約 {trip.currency} {trip.budgetTotal.toLocaleString()}</span>
            </div>
          </div>

          {!shareUrl ? (
            /* Publish Prompt Step */
            <div className="py-4 text-center space-y-4">
              <div className="max-w-md mx-auto text-xs text-slate-600 dark:text-zinc-300 leading-relaxed space-y-2">
                <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-2xl border border-teal-100 dark:border-teal-900/60 text-teal-900 dark:text-teal-200 text-left space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Radio className="w-4 h-4 text-teal-600 dark:text-teal-400 animate-pulse" />
                    <span>仿 Notion 雲端即時同步機制：</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1 text-slate-600 dark:text-zinc-300">
                    <li>產生單一即時連結，親友免下載 App 或註冊即可在手機開啟。</li>
                    <li>
                      <strong className="text-teal-700 dark:text-teal-300 font-bold">自動持續同步：</strong>
                      後續您新增景點、修改備忘或勾選待辦，連結內容皆會即時自動更新給所有人！
                    </li>
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateLiveShare}
                disabled={isPublishing}
                className="w-full py-3 px-5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在建立即時協同連結...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>產生 Notion 式即時雲端連結</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* URL Ready & Share Tools */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>即時雲端分享連結：</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    即時同步已啟用
                  </span>
                </label>

                {/* URL Input with Copy button */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs font-mono outline-hidden select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? '已複製！' : '複製連結'}</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-teal-600" />
                  <span>LINE / 社群</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTextItinerary}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <FileText className="w-3.5 h-3.5 text-teal-600" />}
                  <span>{copiedText ? '已複製！' : '複製純文字'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQrCode(!showQrCode)}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                  <span>{showQrCode ? '隱藏 QR' : '掃碼 QR'}</span>
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50 text-xs text-teal-900 dark:text-teal-200 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>內容自動隨時更新：</span>
                </p>
                <p className="text-slate-600 dark:text-zinc-300 leading-relaxed text-[11px]">
                  任何持此連結的人皆會收到最新版行程。當您新增景點、更改時間或勾選待辦時，對方手機畫面都會自動同步更新。
                </p>
              </div>

              {/* QR Code Display Card */}
              {showQrCode && (
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-center space-y-2 animate-in fade-in duration-150">
                  <div className="inline-block p-2 rounded-xl bg-white shadow-xs border border-slate-100">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
                      alt="Trip Share QR Code"
                      className="w-36 h-36 mx-auto"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    讓旁邊的親友拿起手機相機直接掃描，即可立刻開啟行程！
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            Wayfarer 即時協作分享
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-200 font-semibold text-xs transition cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
