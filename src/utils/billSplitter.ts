import { Trip } from '../types/itinerary';
import { formatCurrencyAmount, convertAmount, CURRENCY_MAP } from './currency';

export interface SplitMemberSummary {
  name: string;
  totalPaid: number;       // 總自掏腰包金額 (包含公費代墊與個人自費)
  groupPaid: number;       // 公費代墊金額 (Paid out of pocket for shared items)
  totalShare: number;      // 應分攤公費 (Consumed shared amount)
  personalExpense: number; // 個人自費金額 (Private self-spent)
  netBalance: number;      // 分帳結餘 (net: groupPaid - totalShare; positive = should receive, negative = should pay)
}

export interface DebtTransfer {
  from: string;  // 應付款人
  to: string;    // 應收款人
  amount: number;
}

export interface SplitCalculationResult {
  members: string[];
  targetCurrency: string;
  totalGroupExpense: number;
  totalPersonalExpense: number;
  summaries: Record<string, SplitMemberSummary>;
  transfers: DebtTransfer[];
}

/**
 * Calculates group splitting balances and minimal debt transfers.
 * Uses integer-unit largest-remainder allocation per expense so sum(netBalance) === 0 strictly,
 * deduplicates splitWith participants, and preserves historical/removed members so nobody's payments
 * are silently reassigned to someone else.
 */
export const calculateTripSplits = (
  trip: Trip,
  targetCurrency?: string,
  customExchangeRates?: Record<string, number>
): SplitCalculationResult => {
  const baseCur = targetCurrency || trip.currency || 'TWD';
  const rates = customExchangeRates || trip.customExchangeRates;
  const decimals = CURRENCY_MAP[baseCur]?.decimals ?? 0;
  const factor = Math.pow(10, decimals);
  const toUnits = (val: number) => Math.round(val * factor);
  const fromUnits = (units: number) => Number((units / factor).toFixed(decimals));

  const rawActiveMembers = trip.splitMembers && trip.splitMembers.length > 0
    ? trip.splitMembers
    : ['我', '同行旅伴'];
  const activeMembers = Array.from(new Set(rawActiveMembers.map((m) => m.trim()).filter(Boolean)));
  if (activeMembers.length === 0) activeMembers.push('我');

  // Start with active members, then preserve any historical members referenced in expenses
  const members: string[] = [...activeMembers];
  const memberSet = new Set<string>(members);

  const ensureMember = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!memberSet.has(trimmed)) {
      memberSet.add(trimmed);
      members.push(trimmed);
    }
  };

  (trip.expenses || []).forEach((exp) => {
    if (exp.paidBy && exp.paidBy.trim()) {
      ensureMember(exp.paidBy);
    }
    if (Array.isArray(exp.splitWith)) {
      exp.splitWith.forEach((m) => {
        if (m && m.trim()) ensureMember(m);
      });
    }
  });

  // Track everything in integer minor currency units to guarantee zero floating-point drift
  const unitSummaries: Record<string, {
    totalPaid: number;
    groupPaid: number;
    totalShare: number;
    personalExpense: number;
  }> = {};

  members.forEach((m) => {
    unitSummaries[m] = {
      totalPaid: 0,
      groupPaid: 0,
      totalShare: 0,
      personalExpense: 0,
    };
  });

  let totalGroupUnits = 0;
  let totalPersonalUnits = 0;

  (trip.expenses || []).forEach((exp) => {
    const cost = convertAmount(exp.amount, exp.currency, baseCur, rates);
    const costUnits = toUnits(cost);
    if (!costUnits || !Number.isFinite(costUnits) || costUnits <= 0) return;

    const rawPayer = exp.paidBy?.trim();
    const payer = rawPayer && unitSummaries[rawPayer] ? rawPayer : activeMembers[0];

    if (exp.isPersonal) {
      totalPersonalUnits += costUnits;
      if (unitSummaries[payer]) {
        unitSummaries[payer].totalPaid += costUnits;
        unitSummaries[payer].personalExpense += costUnits;
      }
      return;
    }

    totalGroupUnits += costUnits;
    if (unitSummaries[payer]) {
      unitSummaries[payer].totalPaid += costUnits;
      unitSummaries[payer].groupPaid += costUnits;
    }

    // Deduplicate participants cleanly; if omitted, split among activeMembers
    const rawParticipants = Array.isArray(exp.splitWith) && exp.splitWith.length > 0
      ? Array.from(new Set(exp.splitWith.map((m) => m.trim()).filter((m) => Boolean(m && unitSummaries[m]))))
      : activeMembers;

    const participants = rawParticipants.length > 0 ? rawParticipants : activeMembers;

    // Largest-remainder exact integer distribution (guarantees sum(shares) === costUnits)
    const count = participants.length;
    const baseShare = Math.floor(costUnits / count);
    const remainder = costUnits - baseShare * count;

    // Rotate remainder distribution deterministically by expense id hash so one person doesn't absorb every extra ¥1
    let seed = 0;
    for (let i = 0; i < (exp.id || '').length; i++) {
      seed = (seed * 31 + exp.id.charCodeAt(i)) % count;
    }

    participants.forEach((p, idx) => {
      const shiftedIdx = (idx + count - seed) % count;
      const share = baseShare + (shiftedIdx < remainder ? 1 : 0);
      unitSummaries[p].totalShare += share;
    });
  });

  const summaries: Record<string, SplitMemberSummary> = {};
  const debtors: { name: string; units: number }[] = [];
  const creditors: { name: string; units: number }[] = [];

  members.forEach((m) => {
    const u = unitSummaries[m];
    const netUnits = u.groupPaid - u.totalShare;
    summaries[m] = {
      name: m,
      totalPaid: fromUnits(u.totalPaid),
      groupPaid: fromUnits(u.groupPaid),
      totalShare: fromUnits(u.totalShare),
      personalExpense: fromUnits(u.personalExpense),
      netBalance: fromUnits(netUnits),
    };

    if (netUnits < 0) {
      debtors.push({ name: m, units: -netUnits });
    } else if (netUnits > 0) {
      creditors.push({ name: m, units: netUnits });
    }
  });

  debtors.sort((a, b) => b.units - a.units);
  creditors.sort((a, b) => b.units - a.units);

  const transfers: DebtTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleUnits = Math.min(debtor.units, creditor.units);

    if (settleUnits > 0) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: fromUnits(settleUnits),
      });

      debtor.units -= settleUnits;
      creditor.units -= settleUnits;
    }

    if (debtor.units <= 0) dIdx++;
    if (creditor.units <= 0) cIdx++;
  }

  return {
    members,
    targetCurrency: baseCur,
    totalGroupExpense: fromUnits(totalGroupUnits),
    totalPersonalExpense: fromUnits(totalPersonalUnits),
    summaries,
    transfers,
  };
};

/**
 * Formats a clean, polite summary ready to copy & paste into LINE / WeChat / WhatsApp
 */
export const formatSplitsForSharing = (
  trip: Trip,
  targetCurrency?: string,
  customExchangeRates?: Record<string, number>
): string => {
  const cur = targetCurrency || trip.currency || 'TWD';
  const decimals = CURRENCY_MAP[cur]?.decimals ?? 0;
  const factor = Math.pow(10, decimals);
  const roundCur = (val: number) => Math.round(val * factor) / factor;
  const minStep = 1 / factor;
  const result = calculateTripSplits(trip, cur, customExchangeRates);

  let text = `✈️【${trip.title}】旅程朋友分帳結算清單\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 總分帳公費：${formatCurrencyAmount(result.totalGroupExpense, cur)}\n`;
  if (result.totalPersonalExpense > 0) {
    text += `🛍️ 個人自費總計：${formatCurrencyAmount(result.totalPersonalExpense, cur)}\n`;
  }
  text += `👥 參與成員 (${result.members.length} 人)：${result.members.join('、')}\n\n`;

  text += `【代墊與分攤明細】\n`;
  result.members.forEach((m) => {
    const s = result.summaries[m];
    const diff = roundCur(s.netBalance);
    const diffText = diff >= minStep
      ? `應收回 ${formatCurrencyAmount(diff, cur)}`
      : diff <= -minStep
      ? `應補付 ${formatCurrencyAmount(roundCur(-diff), cur)}`
      : `已平衡`;
    let line = `・${m}：公費代墊 ${formatCurrencyAmount(roundCur(s.groupPaid), cur)} / 應攤 ${formatCurrencyAmount(roundCur(s.totalShare), cur)}`;
    if (s.personalExpense > 0) {
      line += ` (個人自費 ${formatCurrencyAmount(roundCur(s.personalExpense), cur)})`;
    }
    line += ` ➜ ${diffText}\n`;
    text += line;
  });

  text += `\n【最簡還款建議】\n`;
  if (result.transfers.length === 0) {
    text += `✨ 太棒了！大家的代墊與消費完全打平，無須轉帳！\n`;
  } else {
    result.transfers.forEach((t, idx) => {
      text += `${idx + 1}. 👉 由【${t.from}】支付給【${t.to}】：${formatCurrencyAmount(t.amount, cur)}\n`;
    });
  }

  text += `\n結算日期：${new Date().toLocaleDateString()}\n日和手帳 Hiyori 隨行紀錄 ✨`;
  return text;
};
