import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Trip } from '../../types/itinerary';
import { copyTextToClipboard } from '../../utils/clipboard';
import { convertAmount, formatCurrencyAmount } from '../../utils/currency';
import { resolveMediaSrc } from '../../utils/image';
import { GalleryPhotoItem } from './travelHubTypes';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosRow,
} from '../UI/IosPrimitives';
import { Check, Copy, Download, Share2, Palette, Calendar } from 'lucide-react';

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
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [yearExpanded, setYearExpanded] = useState(false);

  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedYear(initialYear || 'all');
  }, [initialYear, isOpen]);

  const isDirectImageCandidate = (url?: string): boolean => {
    if (!url) return false;
    const lower = url.trim().toLowerCase();
    if (
      lower.includes('photos.app.goo.gl') ||
      lower.includes('photos.google.com/share') ||
      lower.includes('photos.google.com/album') ||
      lower.includes('drive.google.com/file')
    ) {
      return false;
    }
    return true;
  };

  const summary = useMemo(() => {
    const matchedTrips = trips.filter((tr) => {
      if (selectedYear === 'all') return true;
      return (
        tr.startDate?.startsWith(selectedYear) ||
        tr.endDate?.startsWith(selectedYear) ||
        (tr.days || []).some((d) => d.date?.startsWith(selectedYear)) ||
        (tr.memories || []).some((m) => m.date?.startsWith(selectedYear))
      );
    });

    const uniqueDates = new Set<string>();
    const destinations = new Set<string>();
    let spotsCount = 0;
    let totalSpend = 0;

    matchedTrips.forEach((tr) => {
      if (tr.destination) destinations.add(tr.destination.trim());
      const fallbackCur = tr.currency || 'JPY';
      // Filter expenses by selectedYear for accurate annual totals
      (tr.expenses || []).forEach((exp) => {
        const amt = Number(exp.amount) || 0;
        if (amt <= 0) return;
        const expDate = exp.date || tr.startDate || '';
        if (selectedYear !== 'all' && expDate && !expDate.startsWith(selectedYear)) return;
        totalSpend += convertAmount(amt, exp.currency || fallbackCur, displayCurrency, tr.customExchangeRates);
      });

      const spotIdsInTrip = new Set<string>();
      (tr.days || []).forEach((d) => {
        if (d.date && (selectedYear === 'all' || d.date.startsWith(selectedYear))) {
          uniqueDates.add(d.date);
        }
        (d.items || []).forEach((it) => {
          spotIdsInTrip.add(it.id);
          if (selectedYear !== 'all' && d.date && !d.date.startsWith(selectedYear)) return;
          if (it.completed || (it.memoryPhotos && it.memoryPhotos.length > 0)) {
            spotsCount += 1;
          }
        });
      });

      // Also include standalone / memory-mode check-in locations so memory trips don't show 0 處!
      const standaloneLocationKeys = new Set<string>();
      (tr.memories || []).forEach((m) => {
        const mDate = m.date || tr.startDate || '';
        if (selectedYear !== 'all' && mDate && !mDate.startsWith(selectedYear)) return;
        if (mDate) uniqueDates.add(mDate);
        if (!m.spotId || !spotIdsInTrip.has(m.spotId)) {
          standaloneLocationKeys.add(`${m.location || m.spotTitle || tr.destination || tr.title}::${mDate}`);
        }
      });
      spotsCount += standaloneLocationKeys.size;
    });

    const matchingPhotos = photos.filter(
      (p) =>
        (selectedYear === 'all' || (p.date && p.date.startsWith(selectedYear))) &&
        isDirectImageCandidate(p.url)
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
          if (resolved && isDirectImageCandidate(resolved)) urls.push(resolved);
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

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const generatePngBlob = async (): Promise<Blob | null> => {
    const node = posterRef.current;
    if (!node) return null;

    // Render an isolated offscreen 380px clone so narrow iPhones (<444px) never clip edges
    // and strip Tailwind v4 stylesheets (oklch/color-mix) inside onclone since poster uses 100% inline hex styles!
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.width = '380px';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '-1';
    const clone = node.cloneNode(true) as HTMLDivElement;
    clone.style.width = '380px';
    clone.style.boxSizing = 'border-box';
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2.5,
        useCORS: true,
        allowTaint: false,
        backgroundColor: theme.bg,
        width: 380,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        onclone: (clonedDoc) => {
          // Remove app stylesheets that contain Tailwind v4 oklch()/color-mix() unsupported by html2canvas
          clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => el.remove());
          const safeStyle = clonedDoc.createElement('style');
          safeStyle.textContent = '* { box-sizing: border-box; } body { margin: 0; padding: 0; }';
          clonedDoc.head.appendChild(safeStyle);
        },
      });
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
      });
    } finally {
      document.body.removeChild(host);
    }
  };

  const handleDownloadPng = async () => {
    setIsGenerating(true);
    setExportStatus(null);
    try {
      const blob = await generatePngBlob();
      if (!blob) throw new Error('PNG build failed');
      triggerBlobDownload(blob, `hiyori-footprints-${selectedYear}.png`);
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
    let generatedBlob: Blob | null = null;
    try {
      generatedBlob = await generatePngBlob();
      if (!generatedBlob) throw new Error('PNG build failed');
      const filename = `hiyori-footprints-${selectedYear}.png`;
      const file = new File([generatedBlob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '日和手帳 · 旅行足跡年鑑',
          text: `${motto} — 共走訪 ${summary.cities.length} 座城市、${summary.spotsCount} 個足跡`,
          files: [file],
        });
        setExportStatus('已開啟系統分享');
      } else {
        triggerBlobDownload(generatedBlob, filename);
        setExportStatus('此裝置不支援直接分享，已自動下載 PNG 圖卡');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        if (generatedBlob) {
          triggerBlobDownload(generatedBlob, `hiyori-footprints-${selectedYear}.png`);
          setExportStatus('系統分享未完成，已改為下載高解析圖卡');
        } else {
          setExportStatus('圖卡產生失敗，請稍後再試');
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = async () => {
    const label = selectedYear === 'all' ? '歷年總覽' : `${selectedYear} 年度`;
    const text =
      `【日和手帳 · ${label}旅行足跡卡】\n` +
      `「${motto}」\n` +
      `· 旅程：${summary.tripsCount} 趟 · ${summary.daysCount} 天\n` +
      `· 城市：${summary.cities.join(' · ') || '探索中'}\n` +
      `· 足跡：${summary.spotsCount} 處 · 照片 ${summary.photosCount} 張\n` +
      `— 日和手帳 Hiyori`;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2200);
    } else {
      setExportStatus('無法複製文字摘要，請手動選取複製');
    }
  };

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-4xl"
      zIndexClass="z-[80]"
      variant="grouped"
      fullHeightOnMobile
      ariaLabel="足跡年鑑圖卡工作室"
    >
      <IosNavBar
        title="足跡年鑑圖卡"
        subtitle="2.5x 高解析 PNG"
        leftLabel="關閉"
        onLeftClick={onClose}
        rightLabel="下載 PNG"
        onRightClick={handleDownloadPng}
        rightLoading={isGenerating}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Left: Dark-Mode-Isolated Magazine Poster Canvas */}
          <div className="md:col-span-7 flex items-center justify-center bg-[#EFECE5] dark:bg-slate-950/70 rounded-2xl p-4 sm:p-6 overflow-x-auto border border-[#E5E2DC] dark:border-slate-800">
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

              {/* 2x2 Photo Collage (background-image cover prevents html2canvas object-fit stretching!) */}
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
                        backgroundImage: `url("${src.replace(/"/g, '\\"')}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
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

          {/* Right: iOS Inset Grouped Controls */}
          <div className="md:col-span-5 space-y-5">
            <IosInsetGroup header="圖卡外觀與內容">
              <IosDisclosureRow
                icon={<Palette className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="海報配色"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-black/15 inline-block"
                      style={{ backgroundColor: theme.bg }}
                    />
                    <span>{theme.label}</span>
                  </span>
                }
                expanded={themeExpanded}
                onToggle={() => setThemeExpanded((v) => !v)}
              >
                <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
                  {(Object.keys(POSTER_THEMES) as PosterThemeKey[]).map((key) => {
                    const item = POSTER_THEMES[key];
                    return (
                      <IosCheckmarkRow
                        key={key}
                        inset
                        icon={
                          <span
                            className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                            style={{ backgroundColor: item.bg }}
                          />
                        }
                        label={item.label}
                        selected={themeKey === key}
                        onSelect={() => {
                          setThemeKey(key);
                          setThemeExpanded(false);
                        }}
                      />
                    );
                  })}
                </div>
              </IosDisclosureRow>

              <IosDisclosureRow
                icon={<Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="統計年份"
                value={selectedYear === 'all' ? '歷年全部' : selectedYear}
                expanded={yearExpanded}
                onToggle={() => setYearExpanded((v) => !v)}
              >
                <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
                  <IosCheckmarkRow
                    inset
                    label="歷年全部"
                    selected={selectedYear === 'all'}
                    onSelect={() => {
                      setSelectedYear('all');
                      setYearExpanded(false);
                    }}
                  />
                  {availableYears.map((yr) => (
                    <IosCheckmarkRow
                      key={yr}
                      inset
                      label={yr}
                      selected={selectedYear === yr}
                      onSelect={() => {
                        setSelectedYear(yr);
                        setYearExpanded(false);
                      }}
                    />
                  ))}
                </div>
              </IosDisclosureRow>

              <div className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-2">
                <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                  海報短句
                </label>
                <input
                  type="text"
                  maxLength={36}
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder="寫一句旅途註解..."
                  className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>
            </IosInsetGroup>

            {exportStatus && (
              <p className="px-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                {exportStatus}
              </p>
            )}

            <IosInsetGroup header="輸出與分享">
              <IosRow
                onClick={handleDownloadPng}
                disabled={isGenerating}
                icon={<Download className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="下載高解析 PNG 圖卡"
              />
              <IosRow
                onClick={handleNativeShare}
                disabled={isGenerating}
                icon={<Share2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="使用系統分享圖卡"
              />
              <IosRow
                onClick={handleCopyText}
                icon={
                  copiedText ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-500" />
                  )
                }
                label={copiedText ? '已複製文字摘要' : '複製文字足跡摘要'}
              />
            </IosInsetGroup>
          </div>
        </div>
      </div>
    </IosModalSheet>
  );
};
