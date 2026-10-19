import type { Expense, Participant, Settlement, ParticipantSummary, OutingSummary } from './types';

export function calculateOutingSummary(
  participants: Participant[],
  expenses: Expense[]
): OutingSummary {
  const totalCost = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const averagePerPerson = participants.length > 0 ? totalCost / participants.length : 0;

  const paidMap: Record<string, number> = {};
  const consumedMap: Record<string, number> = {};

  participants.forEach((p) => {
    paidMap[p.id] = 0;
    consumedMap[p.id] = 0;
  });

  expenses.forEach((expense) => {
    const amount = expense.amount;
    const payerId = expense.payerId;
    const sharedWith = expense.participantIds;

    if (payerId && paidMap[payerId] !== undefined) {
      paidMap[payerId] += amount;
    }

    if (sharedWith.length > 0) {
      const share = amount / sharedWith.length;
      sharedWith.forEach((id) => {
        if (consumedMap[id] !== undefined) {
          consumedMap[id] += share;
        }
      });
    }
  });

  const participantSummaries: ParticipantSummary[] = participants.map((p) => {
    const paid = paidMap[p.id] || 0;
    const consumed = consumedMap[p.id] || 0;
    const netBalance = paid - consumed;
    return {
      id: p.id,
      name: p.name,
      paid: Number(paid.toFixed(2)),
      consumed: Number(consumed.toFixed(2)),
      netBalance: Number(netBalance.toFixed(2)),
    };
  });

  const settlements = calculateSettlementsFromSummaries(participantSummaries);

  return {
    totalCost: Number(totalCost.toFixed(2)),
    averagePerPerson: Number(averagePerPerson.toFixed(2)),
    participantSummaries,
    settlements,
  };
}

export function calculateSettlementsFromSummaries(
  summaries: ParticipantSummary[]
): Settlement[] {
  // Clone balances to avoid mutating inputs
  const debtors = summaries
    .filter((p) => p.netBalance < -0.01)
    .map((p) => ({ name: p.name, balance: p.netBalance }))
    .sort((a, b) => a.balance - b.balance); // Most negative first

  const creditors = summaries
    .filter((p) => p.netBalance > 0.01)
    .map((p) => ({ name: p.name, balance: p.netBalance }))
    .sort((a, b) => b.balance - a.balance); // Most positive first

  const settlements: Settlement[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);

    if (amount > 0.01) {
      settlements.push({
        from: debtor.name,
        to: creditor.name,
        amount: Number(amount.toFixed(2)),
      });
    }

    debtor.balance += amount;
    creditor.balance -= amount;

    if (Math.abs(debtor.balance) < 0.01) i++;
    if (Math.abs(creditor.balance) < 0.01) j++;
  }

  return settlements;
}

export function calculateSettlements(
  participants: Participant[],
  expenses: Expense[]
): Settlement[] {
  const summary = calculateOutingSummary(participants, expenses);
  return summary.settlements;
}
