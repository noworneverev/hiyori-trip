import { ExpenseItem, Trip } from '../types/itinerary';
import { formatCurrencyAmount } from './currency';

export interface SplitMemberSummary {
  name: string;
  totalPaid: number;      // 總代墊金額 (Paid out of pocket)
  totalShare: number;     // 應分攤金額 (Total consumed share)
  netBalance: number;     // 結餘 (net: positive = should receive, negative = should pay)
}

export interface DebtTransfer {
  from: string;  // 應付款人
  to: string;    // 應收款人
  amount: number;
}

export interface SplitCalculationResult {
  members: string[];
  totalGroupExpense: number;
  totalPersonalExpense: number;
  summaries: Record<string, SplitMemberSummary>;
  transfers: DebtTransfer[];
}

/**
 * Calculates group splitting balances and minimal debt transfers
 */
export const calculateTripSplits = (trip: Trip): SplitCalculationResult => {
  const members = trip.splitMembers && trip.splitMembers.length > 0
    ? trip.splitMembers
    : ['我'];

  const summaries: Record<string, SplitMemberSummary> = {};
  members.forEach((m) => {
    summaries[m] = {
      name: m,
      totalPaid: 0,
      totalShare: 0,
      netBalance: 0,
    };
  });

  let totalGroupExpense = 0;
  let totalPersonalExpense = 0;

  (trip.expenses || []).forEach((exp) => {
    const cost = exp.convertedAmount ?? exp.amount;

    // If marked as strictly personal expense
    if (exp.isPersonal) {
      totalPersonalExpense += cost;
      const payer = exp.paidBy && summaries[exp.paidBy] ? exp.paidBy : members[0];
      if (summaries[payer]) {
        // Personal expenses don't alter net balance since payer consumed it all
        summaries[payer].totalPaid += cost;
        summaries[payer].totalShare += cost;
      }
      return;
    }

    totalGroupExpense += cost;
    const payer = exp.paidBy && summaries[exp.paidBy] ? exp.paidBy : members[0];
    if (summaries[payer]) {
      summaries[payer].totalPaid += cost;
    }

    // Determine who shares this expense
    let participants = exp.splitWith && exp.splitWith.length > 0
      ? exp.splitWith.filter((m) => summaries[m] !== undefined)
      : members;

    if (participants.length === 0) {
      participants = members;
    }

    const sharePerPerson = cost / participants.length;
    participants.forEach((p) => {
      if (summaries[p]) {
        summaries[p].totalShare += sharePerPerson;
      }
    });
  });

  // Calculate net balance for each person
  members.forEach((m) => {
    summaries[m].netBalance = summaries[m].totalPaid - summaries[m].totalShare;
  });

  // Calculate minimal cash transfers (greedy settlement)
  const debtors: { name: string; amount: number }[] = [];
  const creditors: { name: string; amount: number }[] = [];

  members.forEach((m) => {
    const net = Math.round(summaries[m].netBalance);
    if (net < -0.5) {
      debtors.push({ name: m, amount: -net });
    } else if (net > 0.5) {
      creditors.push({ name: m, amount: net });
    }
  });

  // Sort descending
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: DebtTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmt = Math.min(debtor.amount, creditor.amount);

    if (settleAmt > 0) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(settleAmt),
      });

      debtor.amount -= settleAmt;
      creditor.amount -= settleAmt;
    }

    if (debtor.amount <= 0.5) dIdx++;
    if (creditor.amount <= 0.5) cIdx++;
  }

  return {
    members,
    totalGroupExpense,
    totalPersonalExpense,
    summaries,
    transfers,
  };
};

/**
 * Formats a clean, polite summary ready to copy & paste into LINE / WeChat / WhatsApp
 */
export const formatSplitsForSharing = (trip: Trip): string => {
  const result = calculateTripSplits(trip);
  const cur = trip.currency || 'TWD';

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
    const diff = s.netBalance;
    const diffText = diff >= 0
      ? `應收回 ${formatCurrencyAmount(Math.round(diff), cur)}`
      : `應補付 ${formatCurrencyAmount(Math.round(-diff), cur)}`;
    text += `・${m}：代墊 ${formatCurrencyAmount(Math.round(s.totalPaid), cur)} / 應攤 ${formatCurrencyAmount(Math.round(s.totalShare), cur)} ➜ ${diffText}\n`;
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
