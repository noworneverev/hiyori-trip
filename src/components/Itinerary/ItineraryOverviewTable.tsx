import React, { useState, useMemo } from 'react';
import { Trip, DayPlan } from '../../types/itinerary';
import { formatDateSlash, formatMonthDaySlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import { TripOverviewMap } from '../Map/TripOverviewMap';
import {
  Calendar,
  MapPin,
  Train,
  Hotel,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  Plane,
  Car,
  Footprints,
  Compass,
  CheckCircle2,
  TableProperties,
  Map as MapIcon,
} from 'lucide-react';

interface ItineraryOverviewTableProps {
  trip: Trip;
  selectedDayNumber?: number;
  onSelectDay?: (dayNumber: number) => void;
  lang?: Language;
  isPrintMode?: boolean;
  defaultExpanded?: boolean;
  initialViewMode?: 'table' | 'map';
}

export const ItineraryOverviewTable: React.FC<ItineraryOverviewTableProps> = ({
  trip,
  selectedDayNumber,
  onSelectDay,
  lang = 'zh',
  isPrintMode = false,
  defaultExpanded = true,
  initialViewMode = 'table',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<'table' | 'map'>(initialViewMode);
  const [focusSpotId, setFocusSpotId] = useState<string | undefined>(undefined);

  // Total marked spots with valid coordinates
  const totalMarkedSpotsCount = useMemo(() => {
    return trip.days.reduce((acc, d) => {
      return (
        acc +
        d.items.filter(
          (i) =>
            typeof i.lat === 'number' &&
            typeof i.lng === 'number' &&
            !isNaN(i.lat) &&
            !isNaN(i.lng)
        ).length
      );
    }, 0);
  }, [trip]);

  // Extract key transport info for a day
  const getDayTransport = (day: DayPlan): string[] => {
    const transports: string[] = [];
    day.items.forEach((item) => {
      if (item.category === 'transport') {
        transports.push(item.title);
      } else if (item.transportNote) {
        transports.push(item.transportNote);
      }
    });
    // Check day notes for transport keywords (e.g. 高速巴士, 新幹線, JR, 電車, 自駕)
    if (day.notes) {
      const match = day.notes.match(/(高速巴士|新幹線|JR|特急|CANBUS|乘車套票|計程車|自駕|租車|飛機|航班)[^，。、\n]*/gi);
      if (match) {
        match.slice(0, 2).forEach((m) => {
          if (!transports.some((t) => t.includes(m))) transports.push(m.trim());
        });
      }
    }
    return transports.slice(0, 2);
  };

  // Extract accommodation info for a day
  const getDayLodging = (day: DayPlan): string | null => {
    const hotelItem = day.items.find((i) => i.category === 'hotel' || i.title.includes('飯店') || i.title.includes('酒店') || i.title.includes('旅館') || i.title.includes('賓館') || i.title.includes('宿'));
    if (hotelItem) return hotelItem.title;

    if (day.notes) {
      const match = day.notes.match(/住宿[：:]\s*([^，。\n]+)/);
      if (match && match[1]) return match[1].trim();
      const match2 = day.notes.match(/(宿[：:]\s*[^，。\n]+)/);
      if (match2 && match2[1]) return match2[1].trim();
    }
    return null;
  };

  const handleRowClick = (dayNumber: number) => {
    if (onSelectDay) {
      onSelectDay(dayNumber);
      // Smooth scroll down to day schedule if in interactive mode
      if (!isPrintMode) {
        const target = document.getElementById(`day-schedule-section-${dayNumber}`) || document.getElementById('day-schedule-section');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  };

  if (isPrintMode) {
    return (
      <div className="space-y-3 w-full" id="itinerary-master-overview-table">
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
          <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5">
            <TableProperties className="w-4 h-4 text-teal-800" />
            <span>行程總覽大表 (Itinerary At-a-Glance)</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-500">
            {trip.days.length} Days / {Math.max(1, trip.days.length - 1)} Nights
          </span>
        </div>

        <div className="w-full overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[580px] print:min-w-0 table-fixed text-left border-collapse text-[10px] leading-tight border border-slate-300">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '34%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead className="break-inside-avoid">
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                <th className="py-2 px-2 border-r border-slate-300">日程</th>
                <th className="py-2 px-2 border-r border-slate-300">主題 / 主要走向</th>
                <th className="py-2 px-2 border-r border-slate-300">精華景點與重點行程</th>
                <th className="py-2 px-2 border-r border-slate-300">交通 / 票券</th>
                <th className="py-2 px-2">當晚住宿</th>
              </tr>
            </thead>
            <tbody>
              {trip.days.map((day, idx) => {
                const weekday = getDayOfWeek(day.date, lang);
                const transports = getDayTransport(day);
                const lodging = getDayLodging(day);
                const spotTitles = day.items.map((i) => i.title);

                return (
                  <tr
                    key={day.id}
                    className={`border-b border-slate-200 break-inside-avoid ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                  >
                    <td className="py-2 px-2 align-top border-r border-slate-200 break-words">
                      <div className="font-bold font-mono text-slate-950">Day {day.dayNumber}</div>
                      <div className="text-[9.5px] text-slate-500 font-mono">
                        {formatMonthDaySlash(day.date)} ({weekday})
                      </div>
                    </td>
                    <td className="py-2 px-2 align-top font-bold text-slate-900 border-r border-slate-200 break-words">
                      {day.theme || `第 ${day.dayNumber} 天行程`}
                    </td>
                    <td className="py-2 px-2 align-top border-r border-slate-200 break-words">
                      {spotTitles.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-snug">
                          {spotTitles.map((title, sIdx) => (
                            <React.Fragment key={sIdx}>
                              <span className="inline-block bg-slate-100 text-slate-800 px-1 py-0.2 rounded text-[9.5px] font-medium break-words">
                                {title}
                              </span>
                              {sIdx < spotTitles.length - 1 && (
                                <span className="text-slate-400 text-[8px] font-mono shrink-0">➔</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 align-top border-r border-slate-200 text-[9.5px] text-slate-700 break-words">
                      {transports.length > 0 ? transports.join('、') : '-'}
                    </td>
                    <td className="py-2 px-2 align-top text-[9.5px] text-slate-700 break-words">
                      {lodging || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Interactive In-App View
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden transition-all duration-200">
      {/* Header bar */}
      <div
        className="px-4 py-3 sm:px-5 sm:py-3.5 bg-gradient-to-r from-teal-50/80 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/20 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between cursor-pointer select-none group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-600 dark:bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition">
            <TableProperties className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                {lang === 'zh' ? '行程總覽大表' : 'Itinerary Master Schedule'}
              </h2>
              <span className="text-[10px] font-semibold text-teal-800 dark:text-teal-300 bg-teal-100/70 dark:bg-teal-950/70 px-2 py-0.5 rounded-full border border-teal-200/60 dark:border-teal-800/60">
                {trip.days.length} {lang === 'zh' ? '天' : 'Days'} / {Math.max(1, trip.days.length - 1)} {lang === 'zh' ? '夜' : 'Nights'}
              </span>
              {selectedDayNumber && (
                <span className="hidden sm:inline-block text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {lang === 'zh' ? `當前檢視：第 ${selectedDayNumber} 天` : `Viewing: Day ${selectedDayNumber}`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {lang === 'zh'
                ? '全程動線與重點景點一覽 · 點選任一日程即可快速切換'
                : 'At-a-glance trip route & highlights · Tap any day to jump directly'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
              setViewMode(viewMode === 'map' && isExpanded ? 'table' : 'map');
            }}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
              isExpanded && viewMode === 'map'
                ? 'bg-teal-700 text-white'
                : 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 hover:bg-teal-100 dark:hover:bg-teal-900/60'
            }`}
            title="開啟全程景點概覽地圖"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">概覽地圖</span>
            <span className="text-[10px] font-mono opacity-85">({totalMarkedSpotsCount})</span>
          </button>

          <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 group-hover:underline hidden sm:inline">
            {isExpanded ? (lang === 'zh' ? '收合總覽' : 'Collapse') : (lang === 'zh' ? '展開大表' : 'Expand')}
          </span>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
            aria-label="Toggle Table"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-2 sm:p-4 animate-in fade-in duration-150 space-y-3">
          {/* Sub-bar with View Mode Tabs: [📋 路線大表] [🗺️ 全程景點概覽地圖 (X 處)] */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '路線大表 (表格)' : 'Schedule Table'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'map'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '全程景點概覽地圖' : 'Attractions Map'}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    viewMode === 'map'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {totalMarkedSpotsCount}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {viewMode === 'table' ? (
                <span>點選任一日程查看該日詳細規劃 · 點選景點可快速在地圖定位</span>
              ) : (
                <span>點擊地圖任意圖標即可查看景點攻略與導航</span>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: TRIP OVERVIEW MAP */}
          {viewMode === 'map' && (
            <TripOverviewMap
              trip={trip}
              onSelectDay={onSelectDay}
              lang={lang}
              initialSelectedSpotId={focusSpotId}
            />
          )}

          {/* VIEW MODE 2: TABLE & MOBILE CARDS */}
          {viewMode === 'table' && (
            <>
              {/* Desktop & Tablet Table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-3 w-28 font-mono">天數 / 日期</th>
                      <th className="py-2.5 px-3 w-48">主題 / 城市路線</th>
                      <th className="py-2.5 px-3">景點串聯 (順序亮點)</th>
                      <th className="py-2.5 px-3 w-36">交通 / 票券</th>
                      <th className="py-2.5 px-3 w-32">當晚住宿</th>
                      <th className="py-2.5 px-3 w-28 text-right">動作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {trip.days.map((day) => {
                      const isSelected = day.dayNumber === selectedDayNumber;
                      const weekday = getDayOfWeek(day.date, lang);
                      const transports = getDayTransport(day);
                      const lodging = getDayLodging(day);
                      const spotTitles = day.items.map((i) => i.title);

                      return (
                        <tr
                          key={day.id}
                          onClick={() => handleRowClick(day.dayNumber)}
                          className={`cursor-pointer transition group ${
                            isSelected
                              ? 'bg-teal-50/90 dark:bg-teal-950/40 text-slate-900 dark:text-white font-medium'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {/* Day & Date */}
                          <td className="py-3 px-3 align-top font-mono">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                                  isSelected
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/60 group-hover:text-teal-800 dark:group-hover:text-teal-200 transition'
                                }`}
                              >
                                D{day.dayNumber}
                              </span>
                              <div>
                                <span className="block font-bold text-slate-900 dark:text-white">
                                  {formatMonthDaySlash(day.date)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({weekday})
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Theme */}
                          <td className="py-3 px-3 align-top">
                            <span className="font-bold text-slate-900 dark:text-white block group-hover:text-teal-700 dark:group-hover:text-teal-400 transition">
                              {day.theme || `第 ${day.dayNumber} 天`}
                            </span>
                            {day.notes && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                                {day.notes}
                              </span>
                            )}
                          </td>

                          {/* Spots Chain */}
                          <td className="py-3 px-3 align-top">
                            {spotTitles.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {spotTitles.map((title, sIdx) => {
                                  const matchingItem = day.items.find((i) => i.title === title);
                                  const hasCoords =
                                    matchingItem &&
                                    typeof matchingItem.lat === 'number' &&
                                    typeof matchingItem.lng === 'number';

                                  return (
                                    <React.Fragment key={sIdx}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          if (hasCoords) {
                                            e.stopPropagation();
                                            setFocusSpotId(matchingItem.id);
                                            setViewMode('map');
                                          }
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                                          isSelected
                                            ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-white dark:group-hover:bg-slate-700 hover:text-teal-700 hover:border-teal-300'
                                        }`}
                                        title={hasCoords ? '點擊在地圖定位此景點' : title}
                                      >
                                        <span>{title}</span>
                                        {hasCoords && (
                                          <MapPin className="w-2.5 h-2.5 text-teal-600 opacity-70" />
                                        )}
                                      </button>
                                      {sIdx < spotTitles.length - 1 && (
                                        <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                {lang === 'zh' ? '尚未安排景點' : 'No spots added'}
                              </span>
                            )}
                          </td>

                          {/* Transport */}
                          <td className="py-3 px-3 align-top text-[11px]">
                            {transports.length > 0 ? (
                              <div className="flex items-start gap-1 text-slate-600 dark:text-slate-300">
                                <Train className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{transports.join('、')}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Lodging */}
                          <td className="py-3 px-3 align-top text-[11px]">
                            {lodging ? (
                              <div className="flex items-start gap-1 text-slate-600 dark:text-slate-300">
                                <Hotel className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{lodging}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-3 align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewMode('map');
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
                                title="於概覽地圖檢視"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className={`px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition ${
                                  isSelected
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-teal-600 group-hover:text-white'
                                }`}
                              >
                                <span>
                                  {isSelected
                                    ? lang === 'zh'
                                      ? '檢視中'
                                      : 'Viewing'
                                    : lang === 'zh'
                                    ? '查看'
                                    : 'View'}
                                </span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card-style Overview */}
              <div className="md:hidden space-y-2">
                {trip.days.map((day) => {
                  const isSelected = day.dayNumber === selectedDayNumber;
                  const weekday = getDayOfWeek(day.date, lang);
                  const spotTitles = day.items.map((i) => i.title);
                  const transports = getDayTransport(day);
                  const lodging = getDayLodging(day);

                  return (
                    <div
                      key={day.id}
                      onClick={() => handleRowClick(day.dayNumber)}
                      className={`p-3 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 shadow-xs'
                          : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs ${
                              isSelected
                                ? 'bg-teal-700 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            Day {day.dayNumber}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {formatMonthDaySlash(day.date)} ({weekday})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewMode('map');
                            }}
                            className="p-1 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 rounded-lg flex items-center gap-0.5 text-[10px] font-bold"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>地圖</span>
                          </button>
                          <div className="flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
                            <span>{day.items.length} 景點</span>
                            <ArrowRight className="w-3 h-3" />
                          </div>
                        </div>
                      </div>

                      <h3 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1 mb-1">
                        {day.theme || `第 ${day.dayNumber} 天`}
                      </h3>

                      {/* Spot Flow Sequence */}
                      {spotTitles.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 my-1.5">
                          {spotTitles.map((title, sIdx) => (
                            <React.Fragment key={sIdx}>
                              <span className="px-1.5 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded text-[10px] border border-slate-200 dark:border-slate-700 font-medium max-w-[130px] truncate">
                                {title}
                              </span>
                              {sIdx < spotTitles.length - 1 && (
                                <span className="text-slate-400 text-[9px]">➔</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {/* Lodging & Transport Badges on Mobile */}
                      {(lodging || transports.length > 0) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
                          {transports.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Train className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                              <span className="truncate max-w-[140px]">{transports[0]}</span>
                            </span>
                          )}
                          {lodging && (
                            <span className="flex items-center gap-1">
                              <Hotel className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                              <span className="truncate max-w-[140px]">{lodging}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
