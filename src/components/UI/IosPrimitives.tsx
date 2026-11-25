import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useVisualViewport } from '../../hooks/useVisualViewport';
import { useModalLayer } from '../../hooks/useModalHistory';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';

export interface IosModalSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  zIndexClass?: string;
  variant?: 'grouped' | 'surface';
  disableBackdropClose?: boolean;
  fullHeightOnMobile?: boolean;
  ariaLabel?: string;
  enableSwipeToDismiss?: boolean;
}

export const IosModalSheet: React.FC<IosModalSheetProps> = ({
  onClose,
  children,
  maxWidthClass = 'sm:max-w-lg',
  zIndexClass = 'z-[70]',
  variant = 'grouped',
  disableBackdropClose = false,
  fullHeightOnMobile = false,
  ariaLabel,
  enableSwipeToDismiss = true,
}) => {
  useBodyScrollLock(true);
  useModalLayer(true, onClose, {
    disableEscape: disableBackdropClose,
    enableHistoryBack: !disableBackdropClose,
  });
  const viewport = useVisualViewport(true);
  const isMobileScreen = useIsMobileViewport();

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startY: number;
    startTime: number;
    currentY: number;
  }>({ active: false, startY: 0, startTime: 0, currentY: 0 });
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);

  const handleGrabberTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disableBackdropClose || !enableSwipeToDismiss || e.touches.length !== 1) return;
    dragStateRef.current = {
      active: true,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      currentY: 0,
    };
    setIsDraggingSheet(true);
  };

  const handleGrabberTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || e.touches.length !== 1) return;
    const rawDy = e.touches[0].clientY - state.startY;
    // Slight upward rubber-band resistance, free downward pull
    const dy = rawDy < 0 ? rawDy * 0.18 : rawDy;
    state.currentY = dy;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translate3d(0, ${dy}px, 0)`;
    }
  };

  const handleGrabberTouchEnd = () => {
    const state = dragStateRef.current;
    if (!state.active) return;
    state.active = false;
    setIsDraggingSheet(false);

    const elapsed = Math.max(1, Date.now() - state.startTime);
    const velocity = state.currentY / elapsed; // px/ms

    if (state.currentY > 96 || (velocity > 0.45 && state.currentY > 32)) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 180ms cubic-bezier(0.32, 0.72, 0, 1)';
        sheetRef.current.style.transform = 'translate3d(0, 100%, 0)';
      }
      window.setTimeout(() => {
        onClose();
      }, 150);
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translate3d(0, 0, 0)';
      window.setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = '';
          sheetRef.current.style.transform = '';
        }
      }, 230);
    }
  };

  const bgSurfaceClass =
    variant === 'grouped'
      ? 'bg-[#FAF9F6] dark:bg-[#090D16]'
      : 'bg-white dark:bg-[#111827]';

  // Adapt modal height dynamically when iOS/Android software keyboard shrinks visualViewport
  const dynamicContainerStyle: React.CSSProperties | undefined =
    isMobileScreen && viewport.isKeyboardOpen && viewport.height
      ? {
          height: `${viewport.height}px`,
          top: `${viewport.offsetTop}px`,
          bottom: 'auto',
        }
      : undefined;

  const dynamicSheetStyle: React.CSSProperties | undefined =
    isMobileScreen && viewport.isKeyboardOpen && viewport.height
      ? {
          maxHeight: `${Math.max(280, viewport.height - 16)}px`,
          height: fullHeightOnMobile ? `${Math.max(280, viewport.height - 16)}px` : undefined,
        }
      : undefined;

  const content = (
    <div
      style={dynamicContainerStyle}
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-[3px] px-0 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-0 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] touch-none overscroll-none overflow-hidden animate-in fade-in duration-150`}
      onClick={() => {
        if (!disableBackdropClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={sheetRef}
        style={dynamicSheetStyle}
        className={`w-full ${maxWidthClass} ${bgSurfaceClass} rounded-t-[28px] sm:rounded-3xl shadow-2xl border-t sm:border border-[#E5E2DC] dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col ${
          fullHeightOnMobile ? 'h-[92dvh] sm:h-[90dvh]' : 'max-h-[92dvh] sm:max-h-[90dvh]'
        } overflow-hidden ${
          isDraggingSheet
            ? ''
            : 'animate-in slide-in-from-bottom sm:fade-in sm:zoom-in-95 duration-250'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile iOS Interactive Drag Handle Grabber */}
        <div
          onTouchStart={handleGrabberTouchStart}
          onTouchMove={handleGrabberTouchMove}
          onTouchEnd={handleGrabberTouchEnd}
          onTouchCancel={handleGrabberTouchEnd}
          className="sm:hidden flex justify-center items-center pt-2.5 pb-1.5 min-h-[24px] shrink-0 bg-inherit touch-none ios-chrome cursor-grab active:cursor-grabbing"
          aria-hidden="true"
        >
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
        {children}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};

export interface IosNavBarProps {
  title: string;
  subtitle?: string;
  leftLabel?: string;
  leftIcon?: React.ReactNode;
  onLeftClick?: () => void;
  leftDisabled?: boolean;
  rightLabel?: string;
  onRightClick?: () => void;
  rightType?: 'button' | 'submit';
  rightFormId?: string;
  rightDisabled?: boolean;
  rightLoading?: boolean;
  rightTone?: 'primary' | 'done' | 'destructive';
  rightSlot?: React.ReactNode;
}

export const IosNavBar: React.FC<IosNavBarProps> = ({
  title,
  subtitle,
  leftLabel = '取消',
  leftIcon,
  onLeftClick,
  leftDisabled = false,
  rightLabel,
  onRightClick,
  rightType = 'button',
  rightFormId,
  rightDisabled = false,
  rightLoading = false,
  rightTone = 'primary',
  rightSlot,
}) => {
  const rightColorClass =
    rightTone === 'destructive'
      ? 'text-rose-600 dark:text-rose-400 font-bold'
      : rightTone === 'done'
      ? 'text-teal-700 dark:text-teal-300 font-bold'
      : 'text-teal-700 dark:text-teal-400 font-bold';

  return (
    <div className="sticky top-0 z-20 px-2.5 sm:px-4 min-h-[52px] py-1.5 border-b border-[#E5E2DC]/90 dark:border-slate-800 bg-[#FAF9F6]/95 dark:bg-[#111827]/95 backdrop-blur-xl grid grid-cols-[minmax(76px,1fr)_auto_minmax(76px,1fr)] items-center gap-1.5 shrink-0 ios-chrome">
      {/* Left Action */}
      <div className="flex items-center justify-start min-w-0">
        {onLeftClick ? (
          <button
            type="button"
            onClick={onLeftClick}
            disabled={leftDisabled}
            className="min-h-[44px] min-w-[44px] px-2 flex items-center gap-1 rounded-xl text-[15px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 active:opacity-60 disabled:opacity-40 transition cursor-pointer whitespace-nowrap"
          >
            {leftIcon}
            <span className="truncate">{leftLabel}</span>
          </button>
        ) : (
          <span />
        )}
      </div>

      {/* True Centered iOS Title */}
      <div className="min-w-0 max-w-[54vw] sm:max-w-[260px] text-center px-1">
        <h3 className="font-bold text-[15px] sm:text-sm text-slate-900 dark:text-white tracking-tight truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right Action */}
      <div className="flex items-center justify-end min-w-0">
        {rightSlot ? (
          rightSlot
        ) : rightLabel ? (
          <button
            type={rightType}
            form={rightFormId}
            onClick={onRightClick}
            disabled={rightDisabled || rightLoading}
            className={`min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-end gap-1.5 rounded-xl text-[15px] sm:text-xs ${rightColorClass} hover:bg-teal-50/70 dark:hover:bg-teal-950/40 active:opacity-60 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer whitespace-nowrap`}
          >
            {rightLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            <span className="truncate">{rightLabel}</span>
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
};

export interface IosInsetGroupProps {
  header?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  divided?: boolean;
}

export const IosInsetGroup: React.FC<IosInsetGroupProps> = ({
  header,
  headerRight,
  footer,
  children,
  className = '',
  divided = true,
}) => {
  return (
    <section className={`space-y-1.5 ${className}`}>
      {(header || headerRight) && (
        <div className="px-3.5 flex items-center justify-between gap-2">
          {header && (
            <h4 className="text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400">
              {header}
            </h4>
          )}
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      )}
      <div
        className={`rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC]/85 dark:border-slate-800 overflow-hidden ${
          divided ? 'divide-y divide-[#E5E2DC]/75 dark:divide-slate-800/80' : ''
        }`}
      >
        {children}
      </div>
      {footer && (
        <p className="px-3.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {footer}
        </p>
      )}
    </section>
  );
};

export interface IosRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
}

export const IosRow: React.FC<IosRowProps> = ({
  icon,
  label,
  subtitle,
  trailing,
  onClick,
  disabled = false,
  destructive = false,
  className = '',
}) => {
  const baseClass = `w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-3 text-left transition ios-chrome ${
    onClick && !disabled
      ? 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45 active:bg-[#F3F1EC] dark:active:bg-slate-800/70 cursor-pointer'
      : ''
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`;

  const inner = (
    <>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <div className="shrink-0 flex items-center justify-center">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm sm:text-xs font-semibold truncate ${
              destructive
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {label}
          </div>
          {subtitle && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1.5">{trailing}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={baseClass}>
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
};

export interface IosDisclosureRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  expanded?: boolean;
  onToggle: () => void;
  mode?: 'inline' | 'push';
  valueAccent?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const IosDisclosureRow: React.FC<IosDisclosureRowProps> = ({
  icon,
  label,
  subtitle,
  value,
  expanded = false,
  onToggle,
  mode = 'inline',
  valueAccent = false,
  disabled = false,
  children,
}) => {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={mode === 'inline' ? expanded : undefined}
        className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45 active:bg-[#F3F1EC] dark:active:bg-slate-800/70 disabled:opacity-50 transition cursor-pointer ios-chrome"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && <div className="shrink-0 flex items-center justify-center">{icon}</div>}
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {label}
            </div>
            {subtitle && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 max-w-[55%]">
          {value && (
            <span
              className={`text-xs truncate ${
                valueAccent || expanded
                  ? 'font-semibold text-teal-700 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {value}
            </span>
          )}
          {mode === 'inline' ? (
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                expanded ? 'rotate-180 text-teal-700 dark:text-teal-400' : ''
              }`}
            />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          )}
        </div>
      </button>

      {mode === 'inline' && expanded && children && (
        <div className="border-t border-[#E5E2DC]/65 dark:border-slate-800/80 bg-[#FAF9F6]/85 dark:bg-slate-900/55 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
};

export interface IosCheckmarkRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  trailingMeta?: React.ReactNode;
  inset?: boolean;
}

export const IosCheckmarkRow: React.FC<IosCheckmarkRowProps> = ({
  icon,
  label,
  subtitle,
  selected,
  onSelect,
  trailingMeta,
  inset = false,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full min-h-[48px] ${
        inset ? 'pl-11 pr-4' : 'px-4'
      } py-2.5 flex items-center justify-between gap-3 text-left transition cursor-pointer ios-chrome ${
        selected
          ? 'bg-teal-50/65 dark:bg-teal-950/35'
          : 'hover:bg-[#F3F1EC]/65 dark:hover:bg-slate-800/40 active:bg-[#F3F1EC] dark:active:bg-slate-800/60'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {icon && <div className="shrink-0 flex items-center justify-center">{icon}</div>}
        <div className="min-w-0 flex-1">
          <span
            className={`block text-sm sm:text-xs truncate ${
              selected
                ? 'font-bold text-teal-800 dark:text-teal-300'
                : 'font-medium text-slate-800 dark:text-slate-200'
            }`}
          >
            {label}
          </span>
          {subtitle && (
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {trailingMeta}
        <span className="w-4 h-4 flex items-center justify-center">
          {selected && <Check className="w-4 h-4 text-teal-700 dark:text-teal-400 stroke-[2.5]" />}
        </span>
      </div>
    </button>
  );
};

export interface IosToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const IosToggleSwitch: React.FC<IosToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-teal-500/50 cursor-pointer disabled:opacity-50 ${
        checked ? 'bg-teal-600 dark:bg-teal-500' : 'bg-slate-300/90 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          checked ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

export interface IosToggleRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export const IosToggleRow: React.FC<IosToggleRowProps> = ({
  icon,
  label,
  subtitle,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`w-full min-h-[52px] px-4 py-2.5 flex items-center justify-between gap-3 transition ios-chrome ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45 active:bg-[#F3F1EC] dark:active:bg-slate-800/70 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <div className="shrink-0 flex items-center justify-center">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-xs font-semibold text-slate-900 dark:text-slate-100">
            {label}
          </div>
          {subtitle && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <IosToggleSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={typeof label === 'string' ? label : undefined}
      />
    </div>
  );
};

export interface IosActionSheetOption {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'destructive' | 'primary';
  disabled?: boolean;
}

export interface IosActionSheetProps {
  title?: string;
  message?: string;
  options: IosActionSheetOption[];
  cancelLabel?: string;
  onClose: () => void;
  zIndexClass?: string;
}

export const IosActionSheet: React.FC<IosActionSheetProps> = ({
  title,
  message,
  options,
  cancelLabel = '取消',
  onClose,
  zIndexClass = 'z-[95]',
}) => {
  const titleId = useId();
  useBodyScrollLock(true);
  useModalLayer(true, onClose);

  const sheet = (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-[3px] px-3 sm:px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] touch-none overscroll-none animate-in fade-in duration-150`}
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="w-full max-w-sm space-y-2 animate-in slide-in-from-bottom sm:fade-in sm:zoom-in-95 duration-200 ios-chrome"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Grouped Options Card */}
        <div className="rounded-2xl bg-white/95 dark:bg-[#111827]/95 backdrop-blur-xl border border-[#E5E2DC] dark:border-slate-800 shadow-2xl overflow-y-auto overscroll-contain touch-pan-y max-h-[68dvh] divide-y divide-[#E5E2DC]/80 dark:divide-slate-800">
          {(title || message) && (
            <div className="px-5 py-4 text-center space-y-1.5">
              {title && (
                <h3 id={titleId} className="font-bold text-sm text-slate-900 dark:text-white">
                  {title}
                </h3>
              )}
              {message && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {message}
                </p>
              )}
            </div>
          )}

          {options.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={opt.disabled}
              onClick={opt.onClick}
              className={`w-full min-h-[52px] px-4 py-3 text-center text-[15px] sm:text-xs transition active:bg-[#F3F1EC] dark:active:bg-slate-800 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/60 disabled:opacity-45 cursor-pointer ${
                opt.tone === 'destructive'
                  ? 'font-bold text-rose-600 dark:text-rose-400'
                  : opt.tone === 'primary'
                  ? 'font-bold text-teal-700 dark:text-teal-400'
                  : 'font-semibold text-slate-800 dark:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Separated Cancel Button Card */}
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-xl text-center text-[15px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 active:scale-[0.99] transition cursor-pointer"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(sheet, document.body);
  }
  return sheet;
};
