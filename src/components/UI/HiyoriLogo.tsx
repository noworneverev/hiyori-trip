import React from 'react';

interface HiyoriLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

/**
 * Hiyori Logo (日和旅跡 / 旅行日和)
 * Captures the poetic essence of "日和" — warm morning sunlight rising over a serene landscape path.
 * Crafted with Apple-grade squircle geometry, warm solar coral/gold gradient, and subtle journey trail.
 */
export const HiyoriLogo: React.FC<HiyoriLogoProps> = ({
  className = 'w-8 h-8',
  size,
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className="w-full h-full shrink-0 rounded-xl overflow-hidden shadow-xs drop-shadow-xs"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="hl-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f2833" />
            <stop offset="60%" stopColor="#134347" />
            <stop offset="100%" stopColor="#0a2e2b" />
          </linearGradient>

          <linearGradient id="hl-sun" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="35%" stopColor="#f97316" />
            <stop offset="80%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>

          <linearGradient id="hl-mount-back" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e5863" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0e3a40" />
          </linearGradient>

          <linearGradient id="hl-mount-fore" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#064e4b" />
          </linearGradient>

          <linearGradient id="hl-trail" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#fed7aa" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fde047" stopOpacity="0.25" />
          </linearGradient>

          <filter id="hl-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Squircle Background */}
        <rect width="512" height="512" rx="112" fill="url(#hl-sky)" />

        {/* Atmospheric Glow */}
        <circle cx="256" cy="220" r="140" fill="#f97316" opacity="0.16" filter="url(#hl-glow)" />

        {/* Rising Sun of Hiyori */}
        <circle cx="256" cy="220" r="76" fill="url(#hl-sun)" filter="url(#hl-glow)" />

        {/* Mountain Silhouette (Distant) */}
        <path d="M 40 400 Q 150 295 256 315 T 472 400 L 472 512 L 40 512 Z" fill="url(#hl-mount-back)" />

        {/* Mountain Ridge (Foreground) */}
        <path d="M 40 432 Q 180 342 320 372 Q 400 388 472 442 L 472 512 L 40 512 Z" fill="url(#hl-mount-fore)" />

        {/* Serene Journey Trail */}
        <path d="M 256 315 C 250 350, 290 390, 240 440 C 205 475, 175 490, 155 512 L 212 512 C 235 490, 275 465, 295 435 C 335 385, 280 345, 256 315 Z" fill="url(#hl-trail)" />

        {/* Morning Star Spark */}
        <g transform="translate(372, 116)" fill="#ffffff" opacity="0.95">
          <path d="M 0 -14 Q 0 0 14 0 Q 0 0 0 14 Q 0 0 -14 0 Q 0 0 0 -14 Z" />
          <circle cx="0" cy="0" r="2.5" fill="#fef08a" />
        </g>
      </svg>

      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
            日和手帳 <span className="font-medium text-xs text-amber-600 dark:text-amber-400">Hiyori</span>
          </span>
          <span className="text-[10px] text-slate-400">旅行日和 · 隨行手帖</span>
        </div>
      )}
    </div>
  );
};
