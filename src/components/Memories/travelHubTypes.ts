import React from 'react';
import { Trip, CategoryType } from '../../types/itinerary';
import { convertAmount } from '../../utils/currency';
import {
  Landmark,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  Footprints,
  Circle,
} from 'lucide-react';

export type HubViewMode = 'map' | 'gallery' | 'calendar' | 'timeline' | 'review';

export interface FlattenedSpotMemory {
  tripId: string;
  tripTitle: string;
  tripDestination: string;
  tripCoverGradient?: string;
  tripCurrency: string;
  tripStartDate: string;
  tripEndDate: string;
  ownerId?: string;
  collabId?: string;
  dayNumber: number;
  date: string; // "YYYY-MM-DD"
  spotId: string;
  spotTitle: string;
  category: CategoryType;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  cost?: number;
  notes?: string;
  mood?: string;
  photos: string[];
  googlePhotosUrl?: string;
  completed: boolean;
}

export interface GalleryPhotoItem {
  id: string;
  url: string;
  tripId: string;
  tripTitle: string;
  tripDestination: string;
  ownerId?: string;
  collabId?: string;
  spotId?: string;
  spotTitle: string;
  dayNumber?: number;
  date: string;
  category?: CategoryType;
  locationName?: string;
  mood?: string;
  caption?: string;
  googlePhotosUrl?: string;
  isFeaturedSpot: boolean;
}

export interface LightboxPhotoState {
  photos: GalleryPhotoItem[];
  index: number;
  autoPlay?: boolean;
}

export const CATEGORY_NAMES: Record<CategoryType, string> = {
  spot: '景點觀光',
  food: '美食品嚐',
  transport: '交通移動',
  hotel: '住宿飯店',
  shopping: '購物採買',
  activity: '體驗活動',
  other: '其他行程',
};

export const CATEGORY_ICONS: Record<CategoryType, React.ComponentType<{ className?: string }>> = {
  spot: Landmark,
  food: Utensils,
  transport: Train,
  hotel: Hotel,
  shopping: ShoppingBag,
  activity: Footprints,
  other: Circle,
};

export const CATEGORY_HEX: Record<CategoryType, string> = {
  spot: '#0d9488',
  food: '#d97706',
  transport: '#0284c7',
  hotel: '#4f46e5',
  shopping: '#e11d48',
  activity: '#059669',
  other: '#64748b',
};

export const TRIP_MARKER_PALETTE = [
  '#0d9488',
  '#d97706',
  '#4f46e5',
  '#e11d48',
  '#0284c7',
  '#059669',
  '#7c3aed',
  '#c2410c',
];

export const CATEGORY_COLORS: Record<
  CategoryType,
  { bg: string; border: string; text: string; iconColor: string; bar: string }
> = {
  spot: {
    bg: 'bg-teal-50/70 dark:bg-teal-950/40',
    border: 'border-teal-200/90 dark:border-teal-800/70',
    text: 'text-teal-900 dark:text-teal-200',
    iconColor: 'text-teal-700 dark:text-teal-400',
    bar: 'bg-teal-600 dark:bg-teal-400',
  },
  food: {
    bg: 'bg-amber-50/70 dark:bg-amber-950/40',
    border: 'border-amber-200/90 dark:border-amber-800/70',
    text: 'text-amber-900 dark:text-amber-200',
    iconColor: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-600 dark:bg-amber-400',
  },
  transport: {
    bg: 'bg-sky-50/70 dark:bg-sky-950/40',
    border: 'border-sky-200/90 dark:border-sky-800/70',
    text: 'text-sky-900 dark:text-sky-200',
    iconColor: 'text-sky-700 dark:text-sky-400',
    bar: 'bg-sky-600 dark:bg-sky-400',
  },
  hotel: {
    bg: 'bg-indigo-50/70 dark:bg-indigo-950/40',
    border: 'border-indigo-200/90 dark:border-indigo-800/70',
    text: 'text-indigo-900 dark:text-indigo-200',
    iconColor: 'text-indigo-700 dark:text-indigo-400',
    bar: 'bg-indigo-600 dark:bg-indigo-400',
  },
  shopping: {
    bg: 'bg-rose-50/70 dark:bg-rose-950/40',
    border: 'border-rose-200/90 dark:border-rose-800/70',
    text: 'text-rose-900 dark:text-rose-200',
    iconColor: 'text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-600 dark:bg-rose-400',
  },
  activity: {
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/40',
    border: 'border-emerald-200/90 dark:border-emerald-800/70',
    text: 'text-emerald-900 dark:text-emerald-200',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-400',
  },
  other: {
    bg: 'bg-slate-100/70 dark:bg-slate-800/40',
    border: 'border-slate-200/90 dark:border-slate-700/70',
    text: 'text-slate-900 dark:text-slate-200',
    iconColor: 'text-slate-700 dark:text-slate-400',
    bar: 'bg-slate-600 dark:bg-slate-400',
  },
};

export function computeTripExpenseInCurrency(trip: Trip, targetCurrency: string): number {
  const expenses = trip.expenses || [];
  const fallbackCur = trip.currency || 'JPY';
  return expenses.reduce((sum, exp) => {
    const rawAmount = Number(exp.amount) || 0;
    if (rawAmount <= 0) return sum;
    const fromCur = exp.currency || fallbackCur;
    return sum + convertAmount(rawAmount, fromCur, targetCurrency, trip.customExchangeRates);
  }, 0);
}
