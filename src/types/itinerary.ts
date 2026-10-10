export type CategoryType = 'spot' | 'food' | 'transport' | 'hotel' | 'shopping' | 'activity' | 'other';

export interface ItineraryItem {
  id: string;
  title: string;
  category: CategoryType;
  startTime: string; // "09:00"
  endTime?: string;   // "11:00"
  locationName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  transportNote?: string;
  notes?: string;
  bookingCode?: string;
  cost?: number;
  costPaid?: boolean;
  completed?: boolean;
  memoryPhotos?: string[];
  memoryNotes?: string;
  memoryMood?: string;
}

export interface DayPlan {
  id: string;
  dayNumber: number;
  date: string; // "YYYY-MM-DD"
  theme?: string;
  notes?: string;
  items: ItineraryItem[];
}

export type PackingCategory = 'documents' | 'electronics' | 'clothing' | 'medicine' | 'toiletries' | 'other';

export interface PackingItem {
  id: string;
  name: string;
  category: PackingCategory;
  packed: boolean;
  essential?: boolean;
}

export type PaymentMethod = 'cash' | 'card' | 'ic_card' | 'mobile';
export type ExpenseCategory = 'food' | 'transport' | 'tickets' | 'shopping' | 'souvenir' | 'stay' | 'other' | string;

export interface ExpenseItem {
  id: string;
  title: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  convertedAmount?: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  date: string;
  dayNumber?: number;
  notes?: string;
  receiptImage?: string; // backwards compatibility
  receiptName?: string;
  receiptImages?: string[]; // multiple receipts support
  paidBy?: string; // name of who paid (e.g. '我', '小明')
  splitWith?: string[]; // names of who splits this expense (e.g. ['我', '小明'])
  isPersonal?: boolean; // if true, treated as private/personal (not split)
}

export interface TripMemoryItem {
  id: string;
  imageUrl: string;
  caption?: string;
  spotId?: string;
  spotTitle?: string;
  dayNumber?: number;
  date?: string;
  mood?: string;
  location?: string;
  createdAt: number;
}

export type TodoCategory = 'tickets' | 'transport' | 'booking' | 'preparation' | 'finance' | 'other';

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  category: TodoCategory;
  dueDate?: string;
  notes?: string;
  essential?: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  type: 'police' | 'ambulance' | 'embassy' | 'hotel' | 'insurance' | 'custom';
  phone: string;
  address?: string;
  note?: string;
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';
export type GeneralAccessType = 'restricted' | 'link_viewer' | 'link_editor';

export interface CollaboratorMember {
  id: string;
  email: string;
  name?: string;
  role: CollaboratorRole;
  avatar?: string;
  addedAt: number;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  currency: string;
  budgetTotal: number;
  coverGradient: string;
  notes?: string;
  days: DayPlan[];
  packingList: PackingItem[];
  todos?: TodoItem[];
  expenses: ExpenseItem[];
  customExpenseCategories?: string[];
  customExchangeRates?: Record<string, number>;
  emergencyContacts: EmergencyContact[];
  collabId?: string;
  isCollaborative?: boolean;
  ownerId?: string;
  ownerEmail?: string;
  collaborators?: CollaboratorMember[];
  generalAccess?: GeneralAccessType;
  lastUpdatedBy?: string;
  isSplitEnabled?: boolean;
  splitMembers?: string[];
  memories?: TripMemoryItem[];
  createdAt: number;
  updatedAt: number;
}
