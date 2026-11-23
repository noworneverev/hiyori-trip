import React from 'react';
import {
  Utensils,
  Train,
  Ticket,
  ShoppingBag,
  Gift,
  Hotel,
  Bookmark,
  Tag,
  Wallet,
  CreditCard,
  Smartphone,
} from 'lucide-react';
import { PaymentMethod, Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';

export interface CategoryMeta {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: Record<string, CategoryMeta> = {
  food: { label: '美食餐飲', Icon: Utensils, color: '#F59E0B', bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  transport: { label: '交通車資', Icon: Train, color: '#3B82F6', bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  tickets: { label: '門票票券', Icon: Ticket, color: '#10B981', bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  shopping: { label: '購物商場', Icon: ShoppingBag, color: '#EC4899', bg: 'bg-pink-500/10 text-pink-700 dark:text-pink-300' },
  souvenir: { label: '紀念品伴手禮', Icon: Gift, color: '#8B5CF6', bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  stay: { label: '住宿飯店', Icon: Hotel, color: '#6366F1', bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  other: { label: '其他雜支', Icon: Bookmark, color: '#64748B', bg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
};

export interface AccountMeta {
  key: PaymentMethod;
  zh: string;
  en: string;
  ja: string;
  ko: string;
  'zh-CN': string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const EXPENSE_ACCOUNTS: AccountMeta[] = [
  { key: 'cash', zh: '現金', en: 'Cash', ja: '現金', ko: '현금', 'zh-CN': '现金', Icon: Wallet },
  { key: 'card', zh: '信用卡', en: 'Credit Card', ja: 'クレジットカード', ko: '신용카드', 'zh-CN': '信用卡', Icon: CreditCard },
  { key: 'ic_card', zh: '交通卡/IC卡', en: 'Transit Card', ja: '交通系ICカード', ko: '교통카드', 'zh-CN': '交通卡', Icon: Tag },
  { key: 'mobile', zh: '行動支付', en: 'Mobile Pay', ja: 'スマホ決済', ko: '간편결제', 'zh-CN': '移动支付', Icon: Smartphone },
];

export const EXPENSE_ACCOUNT_MAP: Record<PaymentMethod, AccountMeta> = EXPENSE_ACCOUNTS.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<PaymentMethod, AccountMeta>
);

export const DEFAULT_EXPENSE_TAGS: string[] = [
  '免稅',
  '必吃',
  '伴手禮',
  '交通',
  '公費',
  '代買',
];

const CUSTOM_CATEGORY_PALETTE: Array<{ color: string; bg: string }> = [
  { color: '#0D9488', bg: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  { color: '#E11D48', bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  { color: '#EA580C', bg: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  { color: '#0284C7', bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { color: '#65A30D', bg: 'bg-lime-500/10 text-lime-700 dark:text-lime-300' },
  { color: '#9333EA', bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { color: '#CA8A04', bg: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' },
  { color: '#0891B2', bg: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  { color: '#C026D3', bg: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' },
  { color: '#4F46E5', bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
];

function getDeterministicCustomColor(key: string): { color: string; bg: string } {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CUSTOM_CATEGORY_PALETTE.length;
  return CUSTOM_CATEGORY_PALETTE[index];
}

export function resolveExpenseCategoryMeta(catKey: string, trip?: Trip): CategoryMeta {
  const customLabel = trip?.customCategoryLabels?.[catKey];
  if (DEFAULT_EXPENSE_CATEGORIES[catKey]) {
    return {
      ...DEFAULT_EXPENSE_CATEGORIES[catKey],
      label: customLabel || DEFAULT_EXPENSE_CATEGORIES[catKey].label,
    };
  }
  const customStyle = getDeterministicCustomColor(catKey || 'custom');
  return {
    label: customLabel || catKey,
    Icon: Tag,
    color: customStyle.color,
    bg: customStyle.bg,
  };
}

export function getAccountLabel(method: PaymentMethod, lang: Language): string {
  const meta = EXPENSE_ACCOUNT_MAP[method] || EXPENSE_ACCOUNT_MAP.cash;
  return meta[lang] || meta.zh;
}
