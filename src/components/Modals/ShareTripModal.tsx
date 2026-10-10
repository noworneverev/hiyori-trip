import React, { useState, useEffect } from 'react';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import { publishSharedTrip } from '../../utils/firebase';
import { getPublicShareBaseUrl } from '../../utils/url';
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
  Calendar,
  Sparkles,
  Users,
  ExternalLink,
  FileText,
} from 'lucide-react';

interface ShareTripModalProps {
  trip: Trip;
  userId?: string;
  lang: Language;
  onClose: () => void;
}

export const ShareTripModal: React.FC<ShareTripModalProps> = ({
  trip,
  userId,
  lang,
  onClose,
}) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);

  const handlePublishAndGenerate = async () => {
    setIsPublishing(true);
    try {
      const shareId = await publishSharedTrip(trip, userId);
      const base = getPublicShareBaseUrl();
      const url = `${base}?share=${shareId}`;
      setShareUrl(url);
    } catch (err) {
      console.error('Failed to publish trip:', err);
      // Fallback local share via URL hash
      const base = getPublicShareBaseUrl();
      const fallbackUrl = `${base}?share=${trip.id}`;
      setShareUrl(fallbackUrl);
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
          text: `嗨！這是我們預計前往 ${trip.destination} 的旅遊行程規劃，點開即可查看每日景點與地圖：`,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {lang === 'zh' ? '分享行程給家人與好友' : 'Share Trip with Family & Friends'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'zh' ? '產生專屬網址，親友免安裝 App 即可在手機直接開啟' : 'Publish a shareable link for companions'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Trip Summary Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/90 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300">
                <MapPin className="w-3.5 h-3.5" />
                {trip.destination}
              </span>
              <span className="font-mono">
                {formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}
              </span>
            </div>

            <h4 className="font-black text-lg text-slate-900 dark:text-white">
              {trip.title}
            </h4>

            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono pt-1">
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
              <div className="max-w-md mx-auto text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
                <p>
                  點擊下方按鈕，系統將自動為這份行程發布一個<strong>專屬公開網址</strong>。
                </p>
                <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-100 dark:border-teal-900/60 text-teal-900 dark:text-teal-200 text-left space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Users className="w-3.5 h-3.5 text-teal-600" />
                    <span>親友同遊特色：</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-slate-600 dark:text-slate-300">
                    <li>同行者手機無需登入、免下載 App，點擊連結即刻瀏覽完整行程與路線地圖。</li>
                    <li>支援一鍵「儲存到我的行程」，親友可存入自己的手機進行個人化調整。</li>
                    <li>出國海外時，親友亦可享受離線隨身查閱與 Google 地圖即時導航。</li>
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePublishAndGenerate}
                disabled={isPublishing}
                className="w-full py-3 px-5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在發布並產生專屬網址...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>產生專屬分享網址</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* URL Ready & Share Tools */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>專屬行程分享連結：</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    已成功發布
                  </span>
                </label>

                {/* URL Input with Copy button */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono outline-hidden select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? '已複製！' : '複製網址'}</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95"
                >
                  <Send className="w-3.5 h-3.5 text-teal-600" />
                  <span>LINE / 社群</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTextItinerary}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <FileText className="w-3.5 h-3.5 text-teal-600" />}
                  <span>{copiedText ? '已複製！' : '複製純文字'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQrCode(!showQrCode)}
                  className="py-2.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span>{showQrCode ? '隱藏 QR' : '掃碼 QR'}</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50 text-[11px] text-teal-900 dark:text-teal-200 space-y-0.5">
                <p className="font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 text-teal-600" />
                  <span>免登入直接開啟：</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  親友收到網址或掃描 QR 碼即可在手機立即瀏覽完整行程、路線地圖與離線隨身使用，不需註冊或登入任何帳號。
                </p>
              </div>

              {/* QR Code Display Card */}
              {showQrCode && (
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center space-y-2 animate-in fade-in duration-150">
                  <div className="inline-block p-2 rounded-xl bg-white shadow-xs border border-slate-100">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
                      alt="Trip Share QR Code"
                      className="w-36 h-36 mx-auto"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    讓旁邊的親友拿起手機相機直接掃描，即可立刻開啟行程！
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Wayfarer 行程分享
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
