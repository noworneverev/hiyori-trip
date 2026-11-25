import React, { useState } from 'react';
import { formatCurrencyAmount } from '../../utils/currency';

export interface DonutSliceItem {
  key: string;
  name: string;
  value: number;
  color: string;
  percentage: string;
}

interface CategoryDonutChartProps {
  data: DonutSliceItem[];
  totalValue: number;
  baseCurrency: string;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  totalLabel: string;
  selectedFallbackLabel?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * High-DPI interactive SVG Donut Chart.
 * Immune to Recharts 3 <Cell> / ResponsiveContainer zero-width regressions on mobile PWA & tabs.
 */
export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  data,
  totalValue,
  baseCurrency,
  selectedKey,
  onSelectKey,
  totalLabel,
  selectedFallbackLabel = '類別小計',
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const positiveData = data.filter((d) => d.value > 0);
  const sum = positiveData.reduce((acc, d) => acc + d.value, 0);

  const cx = 100;
  const cy = 100;
  const innerR = 56;
  const outerR = 82;
  const activeOuterR = 87;

  const activeKey = hoveredKey || selectedKey;
  const activeItem = activeKey ? positiveData.find((d) => d.key === activeKey) : null;

  // Build angular geometry for each slice
  const slices = (() => {
    if (positiveData.length === 0 || sum <= 0) return [];
    if (positiveData.length === 1) {
      return [{ item: positiveData[0], isFullCircle: true, startAngle: 0, endAngle: 360 }];
    }

    const gapDeg = Math.min(2.6, 18 / positiveData.length);
    let cursor = 0;

    return positiveData.map((item) => {
      const sweep = (item.value / sum) * 360;
      const effectiveGap = Math.min(gapDeg, sweep * 0.4);
      const start = cursor + effectiveGap / 2;
      const end = Math.max(start + 0.4, cursor + sweep - effectiveGap / 2);
      cursor += sweep;
      return {
        item,
        isFullCircle: false,
        startAngle: start,
        endAngle: Math.min(end, start + Math.max(0.4, sweep)),
      };
    });
  })();

  return (
    <div className="relative flex flex-col items-center justify-center w-full min-h-[208px]">
      <svg
        viewBox="0 0 200 200"
        className="w-48 h-48 sm:w-52 sm:h-52 overflow-visible select-none"
        role="img"
        aria-label={totalLabel}
      >
        {/* Subtle background track ring */}
        <circle
          cx={cx}
          cy={cy}
          r={(innerR + outerR) / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={outerR - innerR}
          className="text-slate-100 dark:text-slate-800/80"
        />

        {slices.map(({ item, isFullCircle, startAngle, endAngle }) => {
          const isSelected = selectedKey === item.key;
          const isHovered = hoveredKey === item.key;
          const isEmphasized = isSelected || isHovered;
          const isDimmed = Boolean(selectedKey && !isSelected && !isHovered);
          const sliceOuterR = isEmphasized ? activeOuterR : outerR;

          if (isFullCircle) {
            return (
              <circle
                key={item.key}
                cx={cx}
                cy={cy}
                r={(innerR + sliceOuterR) / 2}
                fill="none"
                stroke={item.color}
                strokeWidth={sliceOuterR - innerR}
                className="cursor-pointer transition-all duration-200"
                style={{ opacity: isDimmed ? 0.35 : 1 }}
                onClick={() => onSelectKey(item.key)}
                onMouseEnter={() => setHoveredKey(item.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <title>{`${item.name}: ${formatCurrencyAmount(item.value, baseCurrency)} (${item.percentage}%)`}</title>
              </circle>
            );
          }

          return (
            <path
              key={item.key}
              d={describeDonutArc(cx, cy, innerR, sliceOuterR, startAngle, endAngle)}
              fill={item.color}
              className="cursor-pointer transition-all duration-200"
              style={{ opacity: isDimmed ? 0.32 : 1 }}
              onClick={() => onSelectKey(item.key)}
              onMouseEnter={() => setHoveredKey(item.key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <title>{`${item.name}: ${formatCurrencyAmount(item.value, baseCurrency)} (${item.percentage}%)`}</title>
            </path>
          );
        })}
      </svg>

      {/* Center Readout */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-10 text-center">
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate max-w-[100px]">
          {activeItem ? activeItem.name : selectedKey ? selectedFallbackLabel : totalLabel}
        </span>
        <span className="text-xs sm:text-sm font-black font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5 leading-tight">
          {formatCurrencyAmount(activeItem ? activeItem.value : totalValue, baseCurrency)}
        </span>
        {activeItem && (
          <span
            className="text-[10px] font-bold font-mono tabular-nums mt-0.5"
            style={{ color: activeItem.color }}
          >
            {activeItem.percentage}%
          </span>
        )}
      </div>
    </div>
  );
};
