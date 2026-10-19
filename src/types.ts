export interface Participant {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  payerId: string;
  participantIds: string[]; // Who shared the expense
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface ParticipantSummary {
  id: string;
  name: string;
  paid: number;
  consumed: number;
  netBalance: number;
}

export interface OutingSummary {
  totalCost: number;
  averagePerPerson: number;
  participantSummaries: ParticipantSummary[];
  settlements: Settlement[];
}
