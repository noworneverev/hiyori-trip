import React, { useEffect, useMemo, useState } from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import { enableTripCollaboration } from '../../utils/firebase';
import { getPublicShareBaseUrl } from '../../utils/url';
import { copyTextToClipboard } from '../../utils/clipboard';
import { generateQrSvgPath } from '../../utils/qrCode';
import { User } from 'firebase/auth';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
} from '../UI/IosPrimitives';
import {
  Copy,
  Check,
  Send,
  QrCode,
  Globe,
  Loader2,
  MapPin,
  FileText,
  Radio,
  ChevronRight,
} from 'lucide-react';

interface ShareTripModalProps {
  trip: Trip;
  userId?: string;
  currentUser?: User | null;
  onRequireAuth?: () => void;
  onUpdateTrip?: (updatedTrip: Trip) => void;
  lang: Language;
  onClose: () => void;
}

export const ShareTripModal: React.FC<ShareTripModalProps> = ({
  trip,
  currentUser,
  onRequireAuth,
  onUpdateTrip,
  lang,
  onClose,
}) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const derivedShareUrl =
    trip.collabId && trip.isCollaborative
      ? `${getPublicShareBaseUrl()}?collab=${trip.collabId}`
      : null;
  const [shareUrl, setShareUrl] = useState<string | null>(derivedShareUrl);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);

  useEffect(() => {
    setShareUrl(derivedShareUrl);
  }, [derivedShareUrl]);

  const qrSvg = useMemo(() => (shareUrl ? generateQrSvgPath(shareUrl) : null), [shareUrl]);
  const isOwner = !trip.ownerId || Boolean(currentUser && currentUser.uid === trip.ownerId);
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

  const handleGenerateLiveShare = async () => {
    setShareError(null);
    if (!currentUser) {
      setShareError('請先登入 Google 帳號，才能建立即時雲端分享連結');
      onRequireAuth?.();
      return;
    }
    if (!isOwner) {
      setShareError('僅行程建立者可開啟或重新產生雲端分享連結');
      return;
    }

    setIsPublishing(true);
    try {
      const normalizedTrip: Trip = {
        ...trip,
        generalAccess: trip.generalAccess || 'link_viewer',
        ownerId: trip.ownerId || currentUser.uid,
        ownerEmail: trip.ownerEmail || currentUser.email || '',
      };
      const collabId = await enableTripCollaboration(normalizedTrip, currentUser);
      const base = getPublicShareBaseUrl();
      const url = `${base}?collab=${collabId}`;
      setShareUrl(url);

      if (onUpdateTrip) {
        onUpdateTrip({
          ...normalizedTrip,
          collabId,
          isCollaborative: true,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('Failed to enable collaboration:', err);
      setShareError(
        err instanceof Error ? err.message : '無法建立雲端分享連結，請確認網路連線後重試'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setShareError('無法複製連結，請長按或全選上方連結複製');
    }
  };

  const handleCopyTextItinerary = async () => {
    let text = `【${trip.title}】\n目的地：${trip.destination}\n日期：${trip.startDate} ~ ${trip.endDate}\n`;
    trip.days.forEach((day) => {
      text += `\nDay ${day.dayNumber}（${day.theme || '當日行程'}）：\n`;
      day.items.forEach((item) => {
        const timePart = item.startTime?.trim() ? `${item.startTime.trim()} ` : '';
        text += `• ${timePart}${item.title}${item.locationName ? ` (${item.locationName})` : ''}\n`;
      });
    });
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } else {
      setShareError('複製失敗，請確認瀏覽器剪貼簿權限');
    }
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
      } catch {
        // User cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  const totalSpots = trip.days.reduce((acc, d) => acc + d.items.length, 0);

  return (
    <IosModalSheet
      onClose={onClose}
      zIndexClass="z-[70]"
      variant="grouped"
      ariaLabel={lang === 'zh' ? '行程分享' : 'Share Trip'}
    >
      <IosNavBar
        title={lang === 'zh' ? '行程分享' : 'Share Trip'}
        rightLabel={lang === 'zh' ? '完成' : 'Done'}
        onRightClick={onClose}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-5">
        {/* Trip Summary Inset Group */}
        <IosInsetGroup header="分享旅程概覽">
          <div className="px-4 py-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>{trip.destination}</span>
              </span>
              <span className="font-mono tabular-nums">
                {formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}
              </span>
            </div>
            <h4 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
              {trip.title}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {trip.days.length} 天日程 · {totalSpots} 個景點 · 預算約 {trip.currency}{' '}
              {Number(trip.budgetTotal || 0).toLocaleString()}
            </p>
          </div>
        </IosInsetGroup>

        {shareError && (
          <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            {shareError}
          </div>
        )}

        {!shareUrl ? (
          <IosInsetGroup
            header="即時雲端連結"
            footer={
              trip.generalAccess === 'restricted'
                ? '目前設為「僅限受邀成員」，親友須使用受邀 Google 帳號登入才可瀏覽。'
                : '建立後，親友取得連結即可即時瀏覽最新日程，無需登入帳號。'
            }
          >
            <IosRow
              icon={
                isPublishing ? (
                  <Loader2 className="w-4 h-4 text-teal-700 dark:text-teal-400 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                )
              }
              label={
                <span className="text-teal-700 dark:text-teal-400">
                  {isPublishing
                    ? '正在建立分享連結...'
                    : currentUser
                    ? '建立即時雲端分享連結'
                    : '登入 Google 並建立分享連結'}
                </span>
              }
              onClick={handleGenerateLiveShare}
              disabled={isPublishing}
              trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
            />
          </IosInsetGroup>
        ) : (
          <>
            <IosInsetGroup
              header="即時雲端分享連結"
              headerRight={
                <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                  <Radio className="w-3 h-3" />
                  <span>{isOnline ? '雲端同步中' : '離線快取'}</span>
                </span>
              }
            >
              <div className="px-4 py-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-700 dark:text-slate-200 outline-none select-all truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition active:scale-95 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '已複製' : '複製'}</span>
                </button>
              </div>
            </IosInsetGroup>

            <IosInsetGroup header="分享方式">
              <IosRow
                icon={<Send className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="透過 LINE / 系統分享傳送"
                onClick={handleNativeShare}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
              <IosRow
                icon={
                  copiedText ? (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  )
                }
                label={copiedText ? '已複製純文字行程摘要' : '複製純文字行程摘要'}
                onClick={handleCopyTextItinerary}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
              <IosDisclosureRow
                icon={<QrCode className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                label="行動裝置掃碼 QR Code"
                value={showQrCode ? '顯示中' : '展開'}
                expanded={showQrCode}
                onToggle={() => setShowQrCode((v) => !v)}
              >
                <div className="py-5 px-4 text-center space-y-2">
                  <div className="inline-block p-3 rounded-2xl bg-white shadow-xs border border-[#E5E2DC]">
                    {qrSvg ? (
                      <svg
                        viewBox={`0 0 ${qrSvg.size} ${qrSvg.size}`}
                        className="w-36 h-36 mx-auto"
                        role="img"
                        aria-label="Trip Share QR Code"
                      >
                        <rect width={qrSvg.size} height={qrSvg.size} fill="#ffffff" />
                        <path d={qrSvg.path} fill="#0f172a" />
                      </svg>
                    ) : (
                      <p className="text-xs text-slate-500 py-8 px-4">連結過長，請改用複製連結分享</p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    本機安全生成 · 請旅伴使用相機掃描立即開啟行程
                  </p>
                </div>
              </IosDisclosureRow>
            </IosInsetGroup>
          </>
        )}
      </div>
    </IosModalSheet>
  );
};
