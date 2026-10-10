import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Trip } from '../types/itinerary';

export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying the custom databaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 2. Validate Connection to Firestore (Skill Mandatory Requirement)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline, using offline cache.');
    }
  }
}
testConnection();

// 3. Error Handling conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 4. Auth Helpers
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign-in Error:', error);
    return null;
  }
}

export async function logoutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Firebase Sign-out Error:', error);
  }
}

// 5. Cloud Trip Sync Helpers
export function subscribeUserTrips(
  userId: string,
  onTripsChange: (trips: Trip[]) => void
) {
  const tripsPath = `users/${userId}/trips`;
  const q = query(collection(db, tripsPath));

  return onSnapshot(
    q,
    (snapshot) => {
      const trips: Trip[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        trips.push({
          id: d.id,
          title: data.title,
          destination: data.destination,
          startDate: data.startDate,
          endDate: data.endDate,
          currency: data.currency,
          budgetTotal: data.budgetTotal || 0,
          coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
          notes: data.notes || '',
          days: data.days || [],
          packingList: data.packingList || [],
          todos: data.todos || [],
          expenses: data.expenses || [],
          customExpenseCategories: data.customExpenseCategories || [],
          customExchangeRates: data.customExchangeRates || {},
          emergencyContacts: data.emergencyContacts || [],
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        });
      });
      onTripsChange(trips);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, tripsPath);
    }
  );
}

export async function saveTripToCloud(userId: string, trip: Trip): Promise<void> {
  const path = `users/${userId}/trips/${trip.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'trips', trip.id);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        id: trip.id,
        ownerId: userId,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency,
        budgetTotal: trip.budgetTotal || 0,
        coverGradient: trip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
        notes: trip.notes || '',
        days: trip.days || [],
        packingList: trip.packingList || [],
        todos: trip.todos || [],
        expenses: trip.expenses || [],
        customExpenseCategories: trip.customExpenseCategories || [],
        customExchangeRates: trip.customExchangeRates || {},
        emergencyContacts: trip.emergencyContacts || [],
        memories: trip.memories || [],
        isSplitEnabled: trip.isSplitEnabled ?? false,
        splitMembers: trip.splitMembers || [],
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTripFromCloud(userId: string, tripId: string): Promise<void> {
  const path = `users/${userId}/trips/${tripId}`;
  try {
    const docRef = doc(db, 'users', userId, 'trips', tripId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 6. Public Shared Trip Publishing Helpers
export async function publishSharedTrip(trip: Trip, ownerUid?: string): Promise<string> {
  // Generate clean share ID or reuse existing if set
  const shareId = `share_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `shared_trips/${shareId}`;

  try {
    const docRef = doc(db, 'shared_trips', shareId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        id: shareId,
        originalTripId: trip.id,
        ownerId: ownerUid || 'guest',
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency,
        budgetTotal: trip.budgetTotal || 0,
        coverGradient: trip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
        notes: trip.notes || '',
        days: trip.days || [],
        packingList: trip.packingList || [],
        todos: trip.todos || [],
        expenses: trip.expenses || [],
        customExpenseCategories: trip.customExpenseCategories || [],
        customExchangeRates: trip.customExchangeRates || {},
        emergencyContacts: trip.emergencyContacts || [],
        memories: trip.memories || [],
        isSplitEnabled: trip.isSplitEnabled ?? false,
        splitMembers: trip.splitMembers || [],
        publishedAt: Date.now(),
      })
    );
    return shareId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchSharedTrip(shareId: string): Promise<Trip | null> {
  try {
    const docRef = doc(db, 'shared_trips', shareId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    return {
      id: `imported-${data.id}`,
      title: data.title,
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
      currency: data.currency,
      budgetTotal: data.budgetTotal || 0,
      coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: data.notes || '',
      days: data.days || [],
      packingList: data.packingList || [],
      todos: data.todos || [],
      expenses: data.expenses || [],
      customExpenseCategories: data.customExpenseCategories || [],
      customExchangeRates: data.customExchangeRates || {},
      emergencyContacts: data.emergencyContacts || [],
      memories: data.memories || [],
      isSplitEnabled: data.isSplitEnabled ?? false,
      splitMembers: data.splitMembers || [],
      createdAt: data.publishedAt || Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.warn('Failed to fetch shared trip from cloud:', error);
    return null;
  }
}

// 7. Multiplayer Real-time Collaboration & Permissions Helpers
export function checkUserTripPermission(
  trip?: Trip | null,
  user?: User | null
): { canEdit: boolean; role: 'owner' | 'editor' | 'viewer' | 'none'; isOwner: boolean } {
  if (!trip) {
    return { canEdit: true, role: 'owner', isOwner: true };
  }

  // If trip is not collaborative yet, local creator has full edit rights
  if (!trip.isCollaborative) {
    return { canEdit: true, role: 'owner', isOwner: true };
  }

  const userEmail = user?.email?.toLowerCase().trim();
  const userUid = user?.uid;

  // Check if owner
  if (
    (trip.ownerId && userUid && trip.ownerId === userUid) ||
    (trip.ownerEmail && userEmail && trip.ownerEmail.toLowerCase().trim() === userEmail)
  ) {
    return { canEdit: true, role: 'owner', isOwner: true };
  }

  // Check explicit collaborator list by email
  if (userEmail && trip.collaborators && trip.collaborators.length > 0) {
    const member = trip.collaborators.find(
      (c) => c.email.toLowerCase().trim() === userEmail
    );
    if (member) {
      return {
        canEdit: member.role === 'editor' || member.role === 'owner',
        role: member.role,
        isOwner: member.role === 'owner',
      };
    }
  }

  // Check general access policy
  const general = trip.generalAccess || 'link_editor';
  if (general === 'link_editor') {
    return { canEdit: true, role: 'editor', isOwner: false };
  }
  if (general === 'link_viewer') {
    return { canEdit: false, role: 'viewer', isOwner: false };
  }

  // If general access is 'restricted' and user is not explicitly added
  return { canEdit: false, role: 'none', isOwner: false };
}

export async function enableTripCollaboration(trip: Trip, currentUser?: User | null): Promise<string> {
  const collabId = trip.collabId || `collab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `collab_trips/${collabId}`;

  const ownerEmail = currentUser?.email || trip.ownerEmail || '';
  const ownerName = currentUser?.displayName || '發起人';

  const initialCollaborators = trip.collaborators || [
    {
      id: currentUser?.uid || 'owner',
      email: ownerEmail || 'owner',
      name: ownerName,
      role: 'owner' as const,
      addedAt: Date.now(),
    },
  ];

  try {
    const docRef = doc(db, 'collab_trips', collabId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        id: collabId,
        collabId,
        isCollaborative: true,
        originalTripId: trip.id,
        ownerId: currentUser?.uid || trip.ownerId || 'guest',
        ownerEmail,
        ownerName,
        generalAccess: trip.generalAccess || 'link_editor',
        collaborators: initialCollaborators,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency,
        budgetTotal: trip.budgetTotal || 0,
        coverGradient: trip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
        notes: trip.notes || '',
        days: trip.days || [],
        packingList: trip.packingList || [],
        todos: trip.todos || [],
        expenses: trip.expenses || [],
        customExpenseCategories: trip.customExpenseCategories || [],
        customExchangeRates: trip.customExchangeRates || {},
        emergencyContacts: trip.emergencyContacts || [],
        memories: trip.memories || [],
        isSplitEnabled: trip.isSplitEnabled ?? false,
        splitMembers: trip.splitMembers || [],
        updatedAt: Date.now(),
        lastUpdatedBy: currentUser?.displayName || '旅程發起人',
      }),
      { merge: true }
    );
    return collabId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCollaborativeTrip(
  collabId: string,
  onTripUpdate: (trip: Trip) => void,
  onError?: (err: any) => void
): () => void {
  const path = `collab_trips/${collabId}`;
  const docRef = doc(db, 'collab_trips', collabId);

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const liveTrip: Trip = {
          id: data.originalTripId || data.id,
          collabId: data.collabId || collabId,
          isCollaborative: true,
          ownerId: data.ownerId,
          ownerEmail: data.ownerEmail,
          collaborators: data.collaborators || [],
          generalAccess: data.generalAccess || 'link_editor',
          title: data.title,
          destination: data.destination,
          startDate: data.startDate,
          endDate: data.endDate,
          currency: data.currency,
          budgetTotal: data.budgetTotal || 0,
          coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
          notes: data.notes || '',
          days: data.days || [],
          packingList: data.packingList || [],
          todos: data.todos || [],
          expenses: data.expenses || [],
          customExpenseCategories: data.customExpenseCategories || [],
          customExchangeRates: data.customExchangeRates || {},
          emergencyContacts: data.emergencyContacts || [],
          memories: data.memories || [],
          isSplitEnabled: data.isSplitEnabled ?? false,
          splitMembers: data.splitMembers || [],
          lastUpdatedBy: data.lastUpdatedBy,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        };
        onTripUpdate(liveTrip);
      }
    },
    (err) => {
      console.warn('Collaborative subscription error:', err);
      onError?.(err);
    }
  );
}

export async function syncCollaborativeTrip(
  collabId: string,
  trip: Trip,
  editorName?: string
): Promise<void> {
  const path = `collab_trips/${collabId}`;
  try {
    const docRef = doc(db, 'collab_trips', collabId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        id: collabId,
        collabId,
        isCollaborative: true,
        originalTripId: trip.id,
        ownerId: trip.ownerId || 'guest',
        ownerEmail: trip.ownerEmail || '',
        collaborators: trip.collaborators || [],
        generalAccess: trip.generalAccess || 'link_editor',
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency,
        budgetTotal: trip.budgetTotal || 0,
        coverGradient: trip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
        notes: trip.notes || '',
        days: trip.days || [],
        packingList: trip.packingList || [],
        todos: trip.todos || [],
        expenses: trip.expenses || [],
        customExpenseCategories: trip.customExpenseCategories || [],
        customExchangeRates: trip.customExchangeRates || {},
        emergencyContacts: trip.emergencyContacts || [],
        memories: trip.memories || [],
        isSplitEnabled: trip.isSplitEnabled ?? false,
        splitMembers: trip.splitMembers || [],
        updatedAt: Date.now(),
        lastUpdatedBy: editorName || '同行旅伴',
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCollaborativeTrip(collabId: string): Promise<Trip | null> {
  try {
    const docRef = doc(db, 'collab_trips', collabId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: data.originalTripId || data.id,
      collabId: data.collabId || collabId,
      isCollaborative: true,
      ownerId: data.ownerId,
      ownerEmail: data.ownerEmail,
      collaborators: data.collaborators || [],
      generalAccess: data.generalAccess || 'link_editor',
      title: data.title,
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
      currency: data.currency,
      budgetTotal: data.budgetTotal || 0,
      coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: data.notes || '',
      days: data.days || [],
      packingList: data.packingList || [],
      todos: data.todos || [],
      expenses: data.expenses || [],
      customExpenseCategories: data.customExpenseCategories || [],
      customExchangeRates: data.customExchangeRates || {},
      emergencyContacts: data.emergencyContacts || [],
      memories: data.memories || [],
      isSplitEnabled: data.isSplitEnabled ?? false,
      splitMembers: data.splitMembers || [],
      lastUpdatedBy: data.lastUpdatedBy,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    };
  } catch (e) {
    console.warn('Fetch collaborative trip failed:', e);
    return null;
  }
}
