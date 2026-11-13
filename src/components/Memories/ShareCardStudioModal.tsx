import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Trip } from '../../types/itinerary';
import { formatCurrencyAmount } from '../../utils/currency';
import { resolveMediaSrc } from '../../utils/image';
import { computeTripExpenseInCurrency, GalleryPhotoItem } from './travelHubTypes';
import { Check, Copy, Download, Loader2, Share2, X } from 'lucide-react';

interface ShareCardStudioModalProps {
  isOpen: boolean;
  trips: Trip[];
  photos: GalleryPhotoItem[];
  availableYears: string[];
  initialYear: string;
  displayCurrency: string;
  onClose: () => void;
}

type PosterThemeKey = 'washi' | 'midnight' | 'hiyori';

const POSTER_THEMES: Record<
  PosterThemeKey,
  {
    label: string;
    bg: string;
    cardBg: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    badgeBg: string;
  }
> = {
  washi: {
    label: '和紙暖白',
    bg: '#FAF8F5',
    cardBg: '#FFFFFF',
    border: '#E7E2D8',
    textPrimary: '#1C1917',
    textSecondary: '#78716C',
    accent: '#0F766E',
    badgeBg: '#F0FDFA',
  },
  midnight: {
    label: '靜謐墨藍',
    bg: '#0B1324',
    cardBg: '#131E36',
    border: '#233252',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accent: '#2DD4BF',
    badgeBg: '#162544',
  },
  hiyori: {
    label: '日和青綠',
    bg: '#062C2B',
    cardBg: '#0B3B39',
    border: '#135350',
    textPrimary: '#F0FDFA',
    textSecondary: '#99F6E4',
    accent: '#F59E0B',
    badgeBg: '#0E4845',
  },
};

export const ShareCardStudioModal: React.FC<ShareCardStudioModalProps> = ({
  isOpen,
  trips,
  photos,
  availableYears,
  initialYear,
  displayCurrency,
  onClose,
}) => {
  const [themeKey, setThemeKey] = useState<PosterThemeKey>('washi');
  const [selectedYear, setSelectedYear] = useState<string>(initialYear || 'all');
  const [motto, setMotto] = useState('把世界走成自己的故事');
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedYear(initialYear || 'all');
  }, [initialYear, isOpen]);

  const summary = useMemo(() => {
    const matchedTrips = trips.filter((tr) => {
      if (selectedYear === 'all') return true;
      return (
        tr.startDate?.startsWith(selectedYear) ||
        tr.endDate?.startsWith(selectedYear) ||
        (tr.days || []).some((d) => d.date?.startsWith(selectedYear))
      );
    });

    const uniqueDates = new Set<string>();
    const destinations = new Set<string>();
    let spotsCount = 0;
    let totalSpend = 0;

    matchedTrips.forEach((tr) => {
      if (tr.destination) destinations.add(tr.destination.trim());
      totalSpend += computeTripExpenseInCurrency(tr, displayCurrency);
      (tr.days || []).forEach((d) => {
        if (d.date && (selectedYear === 'all' || d.date.startsWith(selectedYear))) {
          uniqueDates.add(d.date);
        }
        (d.items || []).forEach((it) => {
          if (it.completed || (it.memoryPhotos && it.memoryPhotos.length > 0)) {
            spotsCount += 1;
          }
        });
      });
    });

    const matchingPhotos = photos.filter(
      (p) => selectedYear === 'all' || (p.date && p.date.startsWith(selectedYear))
    );

    return {
      tripsCount: matchedTrips.length,
      daysCount:
        uniqueDates.size ||
        matchedTrips.reduce((acc, t) => acc + (t.days?.length || 1), 0),
      spotsCount,
      photosCount: matchingPhotos.length,
      totalSpend: Math.round(totalSpend),
      cities: Array.from(destinations),
      highlightPhotos: matchingPhotos.slice(0, 4),
    };
  }, [trips, photos, selectedYear, displayCurrency]);

  // Pre-resolve media:// images to Data URLs so html2canvas renders crisp images reliably
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const urls: string[] = [];
      for (const p of summary.highlightPhotos) {
        try {
          const resolved = await resolveMediaSrc(p.url, {
            tripId: p.tripId,
            ownerId: p.ownerId,
            collabId: p.collabId,
          });
          if (resolved) urls.push(resolved);
        } catch {
          // Skip broken asset cleanly
        }
      }
      if (!cancelled) setResolvedPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, summary.highlightPhotos]);

  if (!isOpen) return null;

  const theme = POSTER_THEMES[themeKey];
  const yearHeadline = selectedYear === 'all' ? 'LIFETIME' : selectedYear;

  const generatePngBlob = async (): Promise<Blob | null> => {
    if (!posterRef.current) return null;
    const canvas = await html2canvas(posterRef.current, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: theme.bg,
      logging: false,
    });
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  };

  const handleDownloadPng = async () => {
    setIsGenerating(true);
    setExportStatus(null);
    try {
      const blob = await generatePngBlob();
      if (!blob) throw new Error('PNG build failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hiyori-footprints-${selectedYear}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setExportStatus('已下載高解析圖卡');
    } catch (err) {
      console.error('Export PNG failed:', err);
      setExportStatus('圖卡產生失敗，請稍後再試');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNativeShare = async () => {
    setIsGenerating(true);
    setExportStatus(null);
    try {
      const blob = await generatePngBlob();
      if (!blob) throw new Error('PNG build failed');
      const file = new File([blob], `hiyori-footprints-${selectedYear}.png`, {
        type: 'image/png',
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '日和手帳 · 旅行足跡年鑑',
          text: `${motto} — 共走訪 ${summary.cities.length} 座城市、${summary.spotsCount} 個足跡`,
          files: [file],
        });
      } else {
        await handleDownloadPng();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setExportStatus('裝置不支援直接分享，已改為下載圖片');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = () => {
    const label = selectedYear === 'all' ? '歷年總覽' : `${selectedYear} 年度`;
    const text =
      `【日和手帳 · ${label}旅行足跡卡】\n` +
      `「${motto}」\n` +
      `· 旅程：${summary.tripsCount} 趟 · ${summary.daysCount} 天\n` +
      `· 城市：${summary.cities.join(' · ') || '探索中'}\n` +
      `· 足跡：${summary.spotsCount} 處 · 照片 ${summary.photosCount} 張\n` +
      `— 日和手帳 Hiyori`;
    navigator.clipboard?.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2200);
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              足跡年鑑圖卡工作室
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              輸出 2.5x 高解析 PNG 分享圖卡
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-5 sm:p-6">
          {/* Left: Dark-Mode-Isolated Magazine Poster Canvas */}
          <div className="md:col-span-7 flex items-center justify-center bg-slate-100 dark:bg-slate-950/70 rounded-2xl p-4 sm:p-6 overflow-x-auto">
            <div
              ref={posterRef}
              style={{
                width: '380px',
                backgroundColor: theme.bg,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '20px',
                padding: '26px',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {/* Poster Masthead */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: `1px solid ${theme.border}`,
                  paddingBottom: '14px',
                  marginBottom: '18px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.18em',
                      fontWeight: 700,
                      color: theme.accent,
                    }}
                  >
                    HIYORI TRAVEL MONOGRAPH
                  </div>
                  <div
                    style={{
                      fontSize: '26px',
                      fontWeight: 900,
                      letterSpacing: '-0.02em',
                      marginTop: '4px',
                      lineHeight: 1.15,
                    }}
                  >
                    {yearHeadline} · 旅路足跡
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'ui-monospace, monospace',
                    color: theme.textSecondary,
                    textAlign: 'right',
                  }}
                >
                  日和手帳
                </div>
              </div>

              {/* Motto */}
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: theme.textSecondary,
                  marginBottom: '18px',
                  lineHeight: 1.5,
                }}
              >
                「{motto || '把世界走成自己的故事'}」
              </div>

              {/* 2x2 Photo Collage (when resolved photos exist) */}
              {resolvedPhotoUrls.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: resolvedPhotoUrls.length === 1 ? '1fr' : '1fr 1fr',
                    gap: '8px',
                    marginBottom: '18px',
                  }}
                >
                  {resolvedPhotoUrls.slice(0, 4).map((src, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderRadius: '12px',
                        overflow: 'hidden',
                        height: resolvedPhotoUrls.length <= 2 ? '132px' : '96px',
                        backgroundColor: theme.cardBg,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <img
                        src={src}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 4-Metric Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginBottom: '18px',
                }}
              >
                {[
                  { label: '探索旅程', value: `${summary.tripsCount}`, unit: '趟' },
                  { label: '漫遊天數', value: `${summary.daysCount}`, unit: '天' },
                  { label: '足跡打卡', value: `${summary.spotsCount}`, unit: '處' },
                  {
                    label: summary.totalSpend > 0 ? `總花費 (${displayCurrency})` : '珍藏照片',
                    value:
                      summary.totalSpend > 0
                        ? formatCurrencyAmount(summary.totalSpend, displayCurrency)
                        : `${summary.photosCount}`,
                    unit: summary.totalSpend > 0 ? '' : '張',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      backgroundColor: theme.cardBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '12px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: theme.textSecondary, fontWeight: 600 }}>
                      {stat.label}
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        fontFamily: 'ui-monospace, monospace',
                        marginTop: '4px',
                        color: theme.textPrimary,
                      }}
                    >
                      {stat.value}
                      {stat.unit && (
                        <span
                          style={{
                            fontSize: '11px',
                            marginLeft: '4px',
                            color: theme.textSecondary,
                            fontWeight: 600,
                          }}
                        >
                          {stat.unit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cities Footer */}
              <div
                style={{
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '10px', color: theme.accent, fontWeight: 700 }}>
                  點亮城市 · {summary.cities.length} 座
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: theme.textPrimary,
                    lineHeight: 1.5,
                  }}
                >
                  {summary.cities.slice(0, 8).join(' · ') || '持續累積世界版圖中'}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Customization & Export Controls */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              {/* Theme Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  海報版型配色
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(POSTER_THEMES) as PosterThemeKey[]).map((key) => {
                    const item = POSTER_THEMES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setThemeKey(key)}
                        className={`min-h-[42px] px-2.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          themeKey === key
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                          style={{ backgroundColor: item.bg }}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Year Scope */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  統計年份範圍
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedYear('all')}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer ${
                      selectedYear === 'all'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    歷年全部
                  </button>
                  {availableYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setSelectedYear(yr)}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold font-mono cursor-pointer ${
                        selectedYear === yr
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Motto */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  海報短句（選填）
                </label>
                <input
                  type="text"
                  maxLength={36}
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder="寫一句屬於這趟旅途的註解..."
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-teal-500"
                />
              </div>

              {exportStatus && (
                <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                  {exportStatus}
                </p>
              )}
            </div>

            {/* Export CTA Stack */}
            <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleDownloadPng}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>下載高解析 PNG 圖卡</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleNativeShare}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>系統分享圖卡</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText ? '已複製文字' : '複製文字摘要'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
