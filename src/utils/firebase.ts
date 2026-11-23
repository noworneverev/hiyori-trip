import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { CollaboratorMember, Trip } from '../types/itinerary';
import {
  MediaRecord,
  idbGetMedia,
  idbGetMeta,
  idbGetSyncQueue,
  idbSetMeta,
} from './indexedDb';
import {
  MEDIA_PREFIX,
  extractInlineImagesToMediaRefs,
  extractMediaId,
  isMediaRef,
  registerCloudMediaResolver,
  resolveMediaSrc,
} from './image';
import { clearAccountTripsOnLogout } from './storage';
import { clearDriveClientCaches } from './googleDrive';

export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);

const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

// CRITICAL: Use multi-tab IndexedDB persistent cache + configured databaseId
function createFirestoreInstance(): Firestore {
  try {
    return firestoreDatabaseId
      ? initializeFirestore(
          app,
          {
            localCache: persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
          },
          firestoreDatabaseId
        )
      : initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
  } catch {
    return firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
  }
}

export const db: Firestore = createFirestoreInstance();

function createAuthInstance() {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuthInstance();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Strict in-memory-only Google Drive OAuth access token (never persisted to localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;

function notifyDriveAuthChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hiyori_drive_auth_changed', {
        detail: { connected: Boolean(cachedDriveAccessToken) },
      })
    );
  }
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function hasDriveAccessToken(): boolean {
  return Boolean(cachedDriveAccessToken);
}

export function clearDriveAccessToken(): void {
  if (cachedDriveAccessToken !== null) {
    cachedDriveAccessToken = null;
    notifyDriveAuthChanged();
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearDriveAccessToken();
    clearDriveClientCaches();
  }
});

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

// 4. Auth Helpers & Diagnostics
const REDIRECT_PENDING_KEY = 'hiyori_auth_redirect_pending';

export interface GoogleLoginResult {
  user: User | null;
  redirected: boolean;
  cancelled: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export function isEmbeddedInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(ua);
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

export function formatFirebaseAuthError(error: unknown): {
  code: string;
  message: string;
  isCancellation: boolean;
} {
  const errObj = error as { code?: string; message?: string } | null;
  const code = errObj?.code || '';
  const rawMessage = errObj?.message || (error instanceof Error ? error.message : String(error || ''));
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      code,
      message: '已取消 Google 登入',
      isCancellation: true,
    };
  }

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      message: `目前網址（${host}）尚未加入 Firebase Authentication「已授權網域」，請至 Firebase Console 新增後即可長期保持登入。`,
      isCancellation: false,
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      code,
      message: '瀏覽器封鎖了登入彈窗，正在嘗試同頁跳轉登入…',
      isCancellation: false,
    };
  }

  if (code === 'auth/operation-not-supported-in-this-environment') {
    return {
      code,
      message: '目前瀏覽環境不支援彈窗登入，請改用 Safari 或 Chrome 系統瀏覽器開啟。',
      isCancellation: false,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      code,
      message: '網路連線不穩，請確認連線後再試一次。',
      isCancellation: false,
    };
  }

  if (
    code === 'auth/invalid-action-code' ||
    /requested action is invalid/i.test(rawMessage)
  ) {
    return {
      code: code || 'auth/invalid-action',
      message: `驗證狀態無效（常見於網域「${host}」未授權或 App 內建瀏覽器限制）。建議改用 Safari / Chrome 開啟或檢查 Firebase 已授權網域。`,
      isCancellation: false,
    };
  }

  return {
    code: code || 'auth/unknown',
    message: `Google 登入未完成（${code || rawMessage || '請稍後再試'}）。若在手機 App 內開啟，建議改用 Safari / Chrome。`,
    isCancellation: false,
  };
}

function dispatchAuthError(message: string, code?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hiyori_auth_error', {
        detail: { message, code },
      })
    );
  }
}

let redirectCheckPromise: Promise<{ user: User | null; errorMessage?: string }> | null = null;

export function resolveAuthRedirect(): Promise<{ user: User | null; errorMessage?: string }> {
  if (redirectCheckPromise) return redirectCheckPromise;

  redirectCheckPromise = (async () => {
    let hadPendingRedirect = false;
    try {
      const raw = sessionStorage.getItem(REDIRECT_PENDING_KEY);
      if (raw) {
        const ts = Number(raw);
        hadPendingRedirect = Number.isFinite(ts) && Date.now() - ts < 180000;
        sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      }
    } catch {
      // ignore storage errors
    }

    try {
      const result = await getRedirectResult(auth, browserPopupRedirectResolver);
      if (result?.user) {
        // NOTE: Do NOT assign standard sign-in token to cachedDriveAccessToken because googleProvider
        // does not request drive.file scope; doing so would cause permanent HTTP 403 Drive failures.
        return { user: result.user };
      }
      if (hadPendingRedirect && !auth.currentUser) {
        return {
          user: null,
          errorMessage: isEmbeddedInAppBrowser()
            ? 'App 內建瀏覽器無法保留跨網域登入狀態，請點選右上角「以 Safari / Chrome 開啟」。'
            : '瀏覽器封鎖了跨網域跳轉登入狀態，請允許彈窗後再點一次登入（或確認網域已加入 Firebase 白名單）。',
        };
      }
      return { user: null };
    } catch (error) {
      const formatted = formatFirebaseAuthError(error);
      if (!formatted.isCancellation) {
        console.error('Google Redirect Sign-in Error:', error);
        return { user: null, errorMessage: formatted.message };
      }
      return { user: null };
    }
  })();

  return redirectCheckPromise;
}

export async function loginWithGoogleDetailed(): Promise<GoogleLoginResult> {
  try {
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {}

  try {
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return {
      user: result.user,
      redirected: false,
      cancelled: false,
    };
  } catch (error) {
    const formatted = formatFirebaseAuthError(error);
    console.error('Google Sign-in Error:', error);

    if (formatted.isCancellation) {
      return {
        user: null,
        redirected: false,
        cancelled: true,
        errorCode: formatted.code,
        errorMessage: formatted.message,
      };
    }

    const shouldTryRedirect =
      formatted.code === 'auth/popup-blocked' ||
      formatted.code === 'auth/operation-not-supported-in-this-environment' ||
      (isStandalonePwa() && formatted.code !== 'auth/unauthorized-domain' && formatted.code !== 'auth/network-request-failed');

    if (shouldTryRedirect) {
      try {
        try {
          sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
        } catch {}
        await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
        return {
          user: null,
          redirected: true,
          cancelled: false,
        };
      } catch (redirectError) {
        try {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch {}
        const redirectFormatted = formatFirebaseAuthError(redirectError);
        return {
          user: null,
          redirected: false,
          cancelled: redirectFormatted.isCancellation,
          errorCode: redirectFormatted.code,
          errorMessage: redirectFormatted.message,
        };
      }
    }

    return {
      user: null,
      redirected: false,
      cancelled: false,
      errorCode: formatted.code,
      errorMessage: formatted.message,
    };
  }
}

export async function loginWithGoogle(): Promise<User | null> {
  const res = await loginWithGoogleDetailed();
  if (!res.user && !res.redirected && !res.cancelled && res.errorMessage) {
    dispatchAuthError(res.errorMessage, res.errorCode);
  }
  return res.user;
}

export async function connectGoogleDrive(): Promise<string | null> {
  try {
    const driveProvider = new GoogleAuthProvider();
    driveProvider.addScope('https://www.googleapis.com/auth/drive.file');
    driveProvider.setCustomParameters({
      include_granted_scopes: 'true',
      prompt: 'consent',
    });

    let result;
    if (auth.currentUser) {
      try {
        result = await reauthenticateWithPopup(
          auth.currentUser,
          driveProvider,
          browserPopupRedirectResolver
        );
      } catch (reauthErr: any) {
        const code = reauthErr?.code || '';
        // Never double-open a popup after user cancel, and never silently switch active Firebase accounts on user-mismatch
        if (
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/user-mismatch'
        ) {
          return null;
        }
        result = await signInWithPopup(auth, driveProvider, browserPopupRedirectResolver);
      }
    } else {
      result = await signInWithPopup(auth, driveProvider, browserPopupRedirectResolver);
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedDriveAccessToken = credential.accessToken;
      notifyDriveAuthChanged();
      return cachedDriveAccessToken;
    }
    return null;
  } catch (error) {
    console.error('Google Drive Connect Error:', error);
    return null;
  }
}

export async function logoutFirebase(): Promise<void> {
  const signedOutUid = auth.currentUser?.uid;
  const pendingTripIdSet = new Set<string>();
  if (signedOutUid) {
    try {
      const idbQueue = await idbGetSyncQueue<any>();
      if (Array.isArray(idbQueue)) {
        idbQueue.forEach((item) => {
          if (item?.type === 'save_trip' && item?.userId === signedOutUid && item?.trip?.id) {
            pendingTripIdSet.add(item.trip.id);
          }
        });
      }
    } catch {}
    if (typeof localStorage !== 'undefined') {
      try {
        const rawQueue = localStorage.getItem('hiyori_offline_sync_queue_v1');
        if (rawQueue) {
          const parsed = JSON.parse(rawQueue);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (item?.type === 'save_trip' && item?.userId === signedOutUid && item?.trip?.id) {
                pendingTripIdSet.add(item.trip.id);
              }
            });
          }
        }
      } catch {}
    }
  }
  try {
    clearDriveAccessToken();
    clearDriveClientCaches();
    await signOut(auth);
  } catch (error) {
    console.error('Firebase Sign-out Error:', error);
  } finally {
    clearAccountTripsOnLogout(signedOutUid, Array.from(pendingTripIdSet));
  }
}

// 5. Internal Helper: Collect media:// IDs referenced by a Trip & sync them to a media subcollection
const SYNCED_MEDIA_META_KEY = 'synced_media_targets_v1';

function collectMediaIdsFromTrip(trip: Trip): string[] {
  const ids = new Set<string>();
  const maybeAdd = (src?: string) => {
    if (isMediaRef(src)) {
      const id = extractMediaId(src);
      if (id) ids.add(id);
    }
  };

  (trip.days || []).forEach((d) => {
    (d.items || []).forEach((it) => {
      (it.memoryPhotos || []).forEach(maybeAdd);
    });
  });
  (trip.memories || []).forEach((m) => maybeAdd(m.imageUrl));
  (trip.expenses || []).forEach((e) => {
    maybeAdd(e.receiptImage);
    (e.receiptImages || []).forEach(maybeAdd);
  });
  (trip.bookings || []).forEach((b: any) => {
    if (Array.isArray(b?.voucherImages)) {
      b.voucherImages.forEach(maybeAdd);
    }
  });

  return Array.from(ids);
}

async function getSyncedMediaSet(): Promise<Record<string, number>> {
  const map = await idbGetMeta<Record<string, number>>(SYNCED_MEDIA_META_KEY);
  return map || {};
}

async function markMediaSynced(targetKey: string): Promise<void> {
  const map = await getSyncedMediaSet();
  map[targetKey] = Date.now();
  // Keep metadata map bounded to most recent 1000 keys
  const entries = Object.entries(map);
  if (entries.length > 1000) {
    entries.sort((a, b) => b[1] - a[1]);
    await idbSetMeta(SYNCED_MEDIA_META_KEY, Object.fromEntries(entries.slice(0, 800)));
  } else {
    await idbSetMeta(SYNCED_MEDIA_META_KEY, map);
  }
}

async function uploadMediaCollectionBatch(
  collectionPath: string,
  targetNamespace: string,
  trip: Trip,
  extraRecords: MediaRecord[],
  ownerIdForDoc: string
): Promise<void> {
  const referencedIds = collectMediaIdsFromTrip(trip);
  if (referencedIds.length === 0 && extraRecords.length === 0) return;

  const syncedMap = await getSyncedMediaSet();
  const extraById = new Map(extraRecords.map((r) => [r.id, r]));

  for (const mediaId of referencedIds) {
    const targetKey = `${targetNamespace}:${mediaId}`;
    if (syncedMap[targetKey]) continue;

    let record = extraById.get(mediaId) || (await idbGetMedia(mediaId));
    // Cross-device fix: if Device B enables Share/Collab before opening Device A's photos locally,
    // pull the missing photo from the user's cloud media subcollection before copying it over!
    if (!record || !record.dataUrl) {
      const fetchedDataUrl = await resolveMediaSrc(`${MEDIA_PREFIX}${mediaId}`, {
        tripId: trip.id,
        ownerId: trip.ownerId || ownerIdForDoc,
        collabId: trip.collabId,
      });
      if (fetchedDataUrl) {
        const mimeMatch = fetchedDataUrl.match(/^data:([^;]+);/);
        record = {
          id: mediaId,
          tripId: trip.id,
          dataUrl: fetchedDataUrl,
          mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
          byteSize: fetchedDataUrl.length,
          createdAt: Date.now(),
        };
      }
    }
    if (!record || !record.dataUrl) continue;

    // Guard single media document size (< 880KB)
    if (record.dataUrl.length >= 880000) {
      console.warn(`[Firestore] Skipping oversized media asset ${mediaId} (${record.dataUrl.length} chars)`);
      continue;
    }

    const docPath = `${collectionPath}/${mediaId}`;
    try {
      await setDoc(
        doc(db, collectionPath, mediaId),
        sanitizeForFirestore({
          id: mediaId,
          tripId: trip.id,
          ownerId: ownerIdForDoc,
          dataUrl: record.dataUrl,
          mimeType: record.mimeType || 'image/jpeg',
          byteSize: record.dataUrl.length,
          createdAt: record.createdAt || Date.now(),
        })
      );
      await markMediaSynced(targetKey);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }
}

// Register cloud media resolver for MediaImage & export hydration
registerCloudMediaResolver(async (mediaId, hint) => {
  const candidatePaths: string[] = [];

  if (hint?.ownerId && hint?.tripId && auth.currentUser?.uid === hint.ownerId) {
    candidatePaths.push(`users/${hint.ownerId}/trips/${hint.tripId}/media/${mediaId}`);
  }
  if (hint?.collabId) {
    candidatePaths.push(`collab_trips/${hint.collabId}/media/${mediaId}`);
  }
  if (hint?.tripId && hint.tripId.startsWith('imported-share_')) {
    const shareId = hint.tripId.replace(/^imported-/, '');
    candidatePaths.push(`shared_trips/${shareId}/media/${mediaId}`);
  }

  for (const fullPath of candidatePaths) {
    try {
      const snap = await getDoc(doc(db, fullPath));
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data?.dataUrl === 'string' && data.dataUrl.length > 0) {
          return data.dataUrl;
        }
      }
    } catch {
      // Try next candidate path
    }
  }
  return null;
});

function computeEditorEmails(trip: Trip, fallbackOwnerEmail?: string): string[] {
  const emails = new Set<string>();
  const owner = (trip.ownerEmail || fallbackOwnerEmail || '').trim().toLowerCase();
  if (owner && owner.includes('@')) {
    emails.add(owner);
  }
  (trip.collaborators || []).forEach((m: CollaboratorMember) => {
    if (m.role === 'owner' || m.role === 'editor') {
      const clean = (m.email || '').trim().toLowerCase();
      if (clean && clean.includes('@')) {
        emails.add(clean);
      }
    }
  });
  return Array.from(emails).slice(0, 30);
}

function computeViewerEmails(trip: Trip): string[] {
  const emails = new Set<string>();
  (trip.collaborators || []).forEach((m: CollaboratorMember) => {
    if (m.role === 'viewer') {
      const clean = (m.email || '').trim().toLowerCase();
      if (clean && clean.includes('@')) {
        emails.add(clean);
      }
    }
  });
  return Array.from(emails).slice(0, 30);
}

function normalizeTripData(
  id: string,
  data: Record<string, any>,
  fallbackOwnerId?: string,
  options?: { preserveLastSyncedAt?: boolean }
): Trip {
  const shouldStampSyncedAt = options?.preserveLastSyncedAt !== false;
  return {
    id,
    ownerId: data.ownerId || fallbackOwnerId,
    ownerEmail: data.ownerEmail || undefined,
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
    bookings: data.bookings || [],
    customExpenseCategories: data.customExpenseCategories || [],
    customCategoryLabels: data.customCategoryLabels || {},
    customExpenseTags: data.customExpenseTags || [],
    customExchangeRates: data.customExchangeRates || {},
    emergencyContacts: data.emergencyContacts || [],
    memories: data.memories || [],
    stickyNotes: data.stickyNotes || undefined,
    deletedItemIds: data.deletedItemIds || undefined,
    isSplitEnabled: data.isSplitEnabled ?? false,
    splitMembers: data.splitMembers || [],
    initialCashAmount: data.initialCashAmount,
    initialCashCurrency: data.initialCashCurrency,
    isSoloTrip: data.isSoloTrip ?? false,
    tripMode: data.tripMode || 'planner',
    destinationLat: typeof data.destinationLat === 'number' ? data.destinationLat : undefined,
    destinationLng: typeof data.destinationLng === 'number' ? data.destinationLng : undefined,
    googlePhotosAlbumUrl: data.googlePhotosAlbumUrl || undefined,
    driveFolderId: data.driveFolderId || undefined,
    isCollaborative: data.isCollaborative ?? false,
    collabId: data.collabId || undefined,
    collaborators: data.collaborators || undefined,
    editorEmails: data.editorEmails || undefined,
    viewerEmails: data.viewerEmails || undefined,
    generalAccess: data.generalAccess || undefined,
    lastUpdatedBy: data.lastUpdatedBy || undefined,
    lastSyncedAt: shouldStampSyncedAt ? data.lastSyncedAt || Date.now() : data.lastSyncedAt || undefined,
    createdAt: data.createdAt || Date.now(),
    updatedAt: data.updatedAt || Date.now(),
  };
}

// 6. User Tombstones Helpers
export async function fetchUserTombstones(userId: string): Promise<Record<string, number> | null> {
  const path = `users/${userId}/meta/tombstones`;
  const docRef = doc(db, path);
  try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const serverSnap = await getDocFromServer(docRef);
      if (!serverSnap.exists()) return {};
      const data = serverSnap.data();
      return (data?.deletedTrips as Record<string, number>) || {};
    }
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return (data?.deletedTrips as Record<string, number>) || {};
  } catch (err) {
    console.warn('[Firestore] fetchUserTombstones warning:', err);
    return null;
  }
}

export function subscribeUserTombstones(
  userId: string,
  onTombstonesChange: (tombstones: Record<string, number>, meta: SnapshotMeta) => void,
  onError?: (error: unknown) => void
) {
  const path = `users/${userId}/meta/tombstones`;
  const docRef = doc(db, path);

  return onSnapshot(
    docRef,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const deletedTrips = (data?.deletedTrips as Record<string, number>) || {};
      onTombstonesChange(deletedTrips, {
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      });
    },
    (error) => {
      console.error('[Firestore] subscribeUserTombstones error:', error);
      onError?.(error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Structured error logged without crashing listener lifecycle
      }
    }
  );
}

export async function recordCloudTripTombstone(userId: string, tripId: string): Promise<void> {
  const path = `users/${userId}/meta/tombstones`;
  try {
    const existing = (await fetchUserTombstones(userId)) || {};
    const now = Date.now();
    const nextTimestamp = Math.max(now, existing[tripId] || 0);
    const nextMap: Record<string, number> = {
      ...existing,
      [tripId]: nextTimestamp,
    };

    if (Object.keys(nextMap).length <= 100) {
      await setDoc(
        doc(db, path),
        sanitizeForFirestore({
          ownerId: userId,
          deletedTrips: { [tripId]: nextTimestamp },
          updatedAt: now,
        }),
        { merge: true }
      );
    } else {
      // Cap to most recent 100 deleted trips
      const sorted = Object.entries(nextMap).sort((a, b) => b[1] - a[1]).slice(0, 100);
      await setDoc(
        doc(db, path),
        sanitizeForFirestore({
          ownerId: userId,
          deletedTrips: Object.fromEntries(sorted),
          updatedAt: now,
        })
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 7. Cloud Trip Sync Helpers
export interface SnapshotMeta {
  hasPendingWrites: boolean;
  fromCache: boolean;
}

export function subscribeUserTrips(
  userId: string,
  onTripsChange: (trips: Trip[], meta: SnapshotMeta) => void,
  onError?: (error: unknown) => void
) {
  const tripsPath = `users/${userId}/trips`;
  const q = query(collection(db, tripsPath));

  return onSnapshot(
    q,
    (snapshot) => {
      const trips: Trip[] = [];
      snapshot.forEach((d) => {
        trips.push(normalizeTripData(d.id, d.data(), userId));
      });
      onTripsChange(trips, {
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        fromCache: snapshot.metadata.fromCache,
      });
    },
    (error) => {
      console.error('[Firestore] subscribeUserTrips error:', error);
      onError?.(error);
      try {
        handleFirestoreError(error, OperationType.LIST, tripsPath);
      } catch {
        // Structured error logged without crashing listener lifecycle
      }
    }
  );
}

export async function saveTripToCloud(userId: string, trip: Trip): Promise<Trip> {
  const path = `users/${userId}/trips/${trip.id}`;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cloud_sync_status', {
        detail: { tripId: trip.id, status: 'syncing', timestamp: Date.now() },
      })
    );
  }

  try {
    // Offload inline Base64 photos into IndexedDB + media subcollection so parent trip doc stays tiny
    const { trip: lightweightTrip, extractedRecords } = await extractInlineImagesToMediaRefs(trip);
    await uploadMediaCollectionBatch(
      `users/${userId}/trips/${lightweightTrip.id}/media`,
      `user:${userId}:${lightweightTrip.id}`,
      lightweightTrip,
      extractedRecords,
      userId
    );

    const syncedAt = Date.now();
    const docRef = doc(db, 'users', userId, 'trips', lightweightTrip.id);
    const payload = sanitizeForFirestore({
      id: lightweightTrip.id,
      ownerId: userId,
      ownerEmail: lightweightTrip.ownerEmail || auth.currentUser?.email || '',
      title: lightweightTrip.title,
      destination: lightweightTrip.destination,
      startDate: lightweightTrip.startDate,
      endDate: lightweightTrip.endDate,
      currency: lightweightTrip.currency,
      budgetTotal: lightweightTrip.budgetTotal || 0,
      coverGradient: lightweightTrip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: lightweightTrip.notes || '',
      days: lightweightTrip.days || [],
      packingList: lightweightTrip.packingList || [],
      todos: lightweightTrip.todos || [],
      expenses: lightweightTrip.expenses || [],
      bookings: lightweightTrip.bookings || [],
      customExpenseCategories: lightweightTrip.customExpenseCategories || [],
      customCategoryLabels: lightweightTrip.customCategoryLabels || {},
      customExpenseTags: lightweightTrip.customExpenseTags || [],
      customExchangeRates: lightweightTrip.customExchangeRates || {},
      emergencyContacts: lightweightTrip.emergencyContacts || [],
      memories: lightweightTrip.memories || [],
      stickyNotes: lightweightTrip.stickyNotes || [],
      deletedItemIds: lightweightTrip.deletedItemIds || {},
      isSplitEnabled: lightweightTrip.isSplitEnabled ?? false,
      splitMembers: lightweightTrip.splitMembers || [],
      initialCashAmount: lightweightTrip.initialCashAmount ?? null,
      initialCashCurrency: lightweightTrip.initialCashCurrency || null,
      isSoloTrip: lightweightTrip.isSoloTrip ?? false,
      tripMode: lightweightTrip.tripMode || 'planner',
      destinationLat: typeof lightweightTrip.destinationLat === 'number' ? lightweightTrip.destinationLat : null,
      destinationLng: typeof lightweightTrip.destinationLng === 'number' ? lightweightTrip.destinationLng : null,
      googlePhotosAlbumUrl: lightweightTrip.googlePhotosAlbumUrl || null,
      driveFolderId: lightweightTrip.driveFolderId || null,
      isCollaborative: lightweightTrip.isCollaborative ?? false,
      collabId: lightweightTrip.collabId || null,
      collaborators: lightweightTrip.collaborators || [],
      editorEmails: computeEditorEmails(lightweightTrip, auth.currentUser?.email || undefined),
      viewerEmails: computeViewerEmails(lightweightTrip),
      generalAccess: lightweightTrip.generalAccess || 'link_viewer',
      lastUpdatedBy: lightweightTrip.lastUpdatedBy || auth.currentUser?.displayName || null,
      lastSyncedAt: syncedAt,
      createdAt: lightweightTrip.createdAt || syncedAt,
      updatedAt: lightweightTrip.updatedAt || syncedAt,
    });

    const jsonStr = JSON.stringify(payload);
    const sizeBytes = new Blob([jsonStr]).size;
    const sizeKb = Math.round(sizeBytes / 1024);

    if (sizeBytes >= 820000) {
      const limitErr = new Error(
        `行程文字資料量 (${sizeKb} KB) 已接近或超過單筆雲端上限 1MB（含 Firestore 內部編碼開銷），請精簡文字備註後再試。`
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cloud_sync_status', {
            detail: {
              tripId: trip.id,
              status: 'error',
              timestamp: Date.now(),
              error: limitErr.message,
              sizeKb,
            },
          })
        );
      }
      throw limitErr;
    }

    if (sizeBytes > 850000 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cloud_sync_warning', {
          detail: { tripId: trip.id, sizeKb },
        })
      );
    }

    await setDoc(docRef, payload, { merge: true });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cloud_sync_status', {
          detail: { tripId: trip.id, status: 'synced', timestamp: Date.now(), sizeKb },
        })
      );
    }

    return {
      ...lightweightTrip,
      lastSyncedAt: syncedAt,
    };
  } catch (error) {
    console.error(`[Firestore] Failed to save trip ${trip.id}:`, error);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cloud_sync_status', {
          detail: {
            tripId: trip.id,
            status: 'error',
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          },
        })
      );
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTripFromCloud(userId: string, tripId: string): Promise<void> {
  const path = `users/${userId}/trips/${tripId}`;
  try {
    await recordCloudTripTombstone(userId, tripId);
    const docRef = doc(db, 'users', userId, 'trips', tripId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// 8. Public Shared Trip Publishing Helpers (Read-only snapshots)
export async function publishSharedTrip(trip: Trip, ownerUid?: string): Promise<string> {
  const effectiveUid = ownerUid || auth.currentUser?.uid;
  if (!effectiveUid) {
    throw new Error('請先登入 Google 帳號才能建立雲端分享連結。');
  }

  const shareId = `share_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `shared_trips/${shareId}`;

  try {
    const { trip: lightweightTrip, extractedRecords } = await extractInlineImagesToMediaRefs(trip);

    // IMPORTANT: Create parent shared_trips/{shareId} doc FIRST so Firestore rules get() on parent doc passes for media writes
    const docRef = doc(db, 'shared_trips', shareId);
    const sharedPayload = sanitizeForFirestore({
      id: shareId,
      originalTripId: lightweightTrip.id,
      ownerId: effectiveUid,
      title: lightweightTrip.title,
      destination: lightweightTrip.destination,
      startDate: lightweightTrip.startDate,
      endDate: lightweightTrip.endDate,
      currency: lightweightTrip.currency,
      budgetTotal: lightweightTrip.budgetTotal || 0,
      coverGradient: lightweightTrip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: lightweightTrip.notes || '',
      days: lightweightTrip.days || [],
      packingList: lightweightTrip.packingList || [],
      todos: lightweightTrip.todos || [],
      expenses: lightweightTrip.expenses || [],
      bookings: lightweightTrip.bookings || [],
      customExpenseCategories: lightweightTrip.customExpenseCategories || [],
      customCategoryLabels: lightweightTrip.customCategoryLabels || {},
      customExpenseTags: lightweightTrip.customExpenseTags || [],
      customExchangeRates: lightweightTrip.customExchangeRates || {},
      emergencyContacts: lightweightTrip.emergencyContacts || [],
      memories: lightweightTrip.memories || [],
      stickyNotes: lightweightTrip.stickyNotes || [],
      isSplitEnabled: lightweightTrip.isSplitEnabled ?? false,
      splitMembers: lightweightTrip.splitMembers || [],
      isSoloTrip: lightweightTrip.isSoloTrip ?? false,
      tripMode: lightweightTrip.tripMode || 'planner',
      destinationLat: typeof lightweightTrip.destinationLat === 'number' ? lightweightTrip.destinationLat : null,
      destinationLng: typeof lightweightTrip.destinationLng === 'number' ? lightweightTrip.destinationLng : null,
      googlePhotosAlbumUrl: lightweightTrip.googlePhotosAlbumUrl || null,
      driveFolderId: lightweightTrip.driveFolderId || null,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sizeBytes = new Blob([JSON.stringify(sharedPayload)]).size;
    if (sizeBytes >= 820000) {
      throw new Error(`分享資料量 (${Math.round(sizeBytes / 1024)} KB) 已接近單筆雲端上限 1MB，請先精簡內容。`);
    }

    await setDoc(docRef, sharedPayload);

    await uploadMediaCollectionBatch(
      `shared_trips/${shareId}/media`,
      `share:${shareId}`,
      lightweightTrip,
      extractedRecords,
      effectiveUid
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
      ...normalizeTripData(`imported-${data.id}`, data, undefined, { preserveLastSyncedAt: false }),
      isCollaborative: false,
      collabId: undefined,
      generalAccess: 'link_viewer',
      createdAt: data.publishedAt || Date.now(),
      updatedAt: data.updatedAt || data.publishedAt || Date.now(),
    };
  } catch (error) {
    console.warn('Failed to fetch shared trip from cloud:', error);
    return null;
  }
}

// 9. Multiplayer Real-time Collaboration & Permissions Helpers
export function checkUserTripPermission(
  trip?: Trip | null,
  user?: User | null
): { canEdit: boolean; role: 'owner' | 'editor' | 'viewer' | 'none'; isOwner: boolean } {
  if (!trip) {
    return { canEdit: true, role: 'owner', isOwner: true };
  }

  // Read-only imported shared snapshot
  if (trip.id?.startsWith('imported-share_')) {
    return { canEdit: false, role: 'viewer', isOwner: false };
  }

  // If trip is not collaborative yet, local creator has full edit rights (gated by requireAuth on UI)
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

  // Check explicit collaborator list by email (requires signed-in user)
  if (user && userEmail && trip.collaborators && trip.collaborators.length > 0) {
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

  // Default policy is 'link_viewer' (no login required to view; login required to edit)
  const general = trip.generalAccess || 'link_viewer';
  if (general === 'link_editor') {
    if (user) {
      return { canEdit: true, role: 'editor', isOwner: false };
    }
    return { canEdit: false, role: 'viewer', isOwner: false };
  }
  if (general === 'link_viewer') {
    return { canEdit: false, role: 'viewer', isOwner: false };
  }

  return { canEdit: false, role: 'none', isOwner: false };
}

export async function enableTripCollaboration(trip: Trip, currentUser?: User | null): Promise<string> {
  const effectiveUser = currentUser || auth.currentUser;
  if (!effectiveUser?.uid) {
    throw new Error('請先登入 Google 帳號才能建立即時共編 / 分享連結。');
  }

  const collabId =
    trip.collabId || `collab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `collab_trips/${collabId}`;

  const ownerEmail = (effectiveUser.email || trip.ownerEmail || '').trim().toLowerCase();
  const ownerName = effectiveUser.displayName || '發起人';

  const initialCollaborators: CollaboratorMember[] =
    trip.collaborators && trip.collaborators.length > 0
      ? trip.collaborators
      : [
          {
            id: effectiveUser.uid,
            email: ownerEmail || effectiveUser.uid,
            name: ownerName,
            role: 'owner',
            addedAt: Date.now(),
          },
        ];

  const defaultAccess = trip.generalAccess || 'link_viewer';
  const enrichedTrip: Trip = {
    ...trip,
    ownerId: effectiveUser.uid,
    ownerEmail,
    collaborators: initialCollaborators,
    generalAccess: defaultAccess,
  };

  try {
    const { trip: lightweightTrip, extractedRecords } = await extractInlineImagesToMediaRefs(enrichedTrip);

    // IMPORTANT: Create parent collab_trips/{collabId} doc FIRST so Firestore rules get() succeeds on media uploads
    const docRef = doc(db, 'collab_trips', collabId);
    const collabPayload = sanitizeForFirestore({
      id: collabId,
      collabId,
      isCollaborative: true,
      originalTripId: lightweightTrip.id,
      ownerId: effectiveUser.uid,
      ownerEmail,
      ownerName,
      generalAccess: defaultAccess,
      collaborators: initialCollaborators,
      editorEmails: computeEditorEmails(enrichedTrip, ownerEmail),
      viewerEmails: computeViewerEmails(enrichedTrip),
      title: lightweightTrip.title,
      destination: lightweightTrip.destination,
      startDate: lightweightTrip.startDate,
      endDate: lightweightTrip.endDate,
      currency: lightweightTrip.currency,
      budgetTotal: lightweightTrip.budgetTotal || 0,
      coverGradient: lightweightTrip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: lightweightTrip.notes || '',
      days: lightweightTrip.days || [],
      packingList: lightweightTrip.packingList || [],
      todos: lightweightTrip.todos || [],
      expenses: lightweightTrip.expenses || [],
      bookings: lightweightTrip.bookings || [],
      customExpenseCategories: lightweightTrip.customExpenseCategories || [],
      customCategoryLabels: lightweightTrip.customCategoryLabels || {},
      customExpenseTags: lightweightTrip.customExpenseTags || [],
      customExchangeRates: lightweightTrip.customExchangeRates || {},
      emergencyContacts: lightweightTrip.emergencyContacts || [],
      memories: lightweightTrip.memories || [],
      stickyNotes: lightweightTrip.stickyNotes || [],
      deletedItemIds: lightweightTrip.deletedItemIds || {},
      isSplitEnabled: lightweightTrip.isSplitEnabled ?? false,
      splitMembers: lightweightTrip.splitMembers || [],
      initialCashAmount: lightweightTrip.initialCashAmount ?? null,
      initialCashCurrency: lightweightTrip.initialCashCurrency || null,
      isSoloTrip: lightweightTrip.isSoloTrip ?? false,
      tripMode: lightweightTrip.tripMode || 'planner',
      destinationLat: typeof lightweightTrip.destinationLat === 'number' ? lightweightTrip.destinationLat : null,
      destinationLng: typeof lightweightTrip.destinationLng === 'number' ? lightweightTrip.destinationLng : null,
      googlePhotosAlbumUrl: lightweightTrip.googlePhotosAlbumUrl || null,
      driveFolderId: lightweightTrip.driveFolderId || null,
      createdAt: lightweightTrip.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastUpdatedBy: ownerName,
    });

    const sizeBytes = new Blob([JSON.stringify(collabPayload)]).size;
    if (sizeBytes >= 820000) {
      throw new Error(`共編資料量 (${Math.round(sizeBytes / 1024)} KB) 已接近單筆雲端上限 1MB，請先精簡內容。`);
    }

    await setDoc(docRef, collabPayload, { merge: true });

    await uploadMediaCollectionBatch(
      `collab_trips/${collabId}/media`,
      `collab:${collabId}`,
      lightweightTrip,
      extractedRecords,
      effectiveUser.uid
    );

    return collabId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCollaborativeTrip(
  collabId: string,
  onTripUpdate: (trip: Trip, meta: SnapshotMeta) => void,
  onError?: (err: any) => void
): () => void {
  const docRef = doc(db, 'collab_trips', collabId);

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const liveTrip: Trip = {
          ...normalizeTripData(data.originalTripId || data.id, data, undefined, {
            preserveLastSyncedAt: false,
          }),
          collabId: data.collabId || collabId,
          isCollaborative: true,
          generalAccess: data.generalAccess || 'link_viewer',
        };
        onTripUpdate(liveTrip, {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        });
      }
    },
    (err) => {
      console.warn('Collaborative subscription error:', err);
      onError?.(err);
    }
  );
}

// Smart ID-level merger with sub-item deletion tombstones
export function mergeTrips(local: Trip, remote: Trip): Trip {
  if (!remote) return local;
  if (!local) return remote;

  const isRemoteNewer = (remote.updatedAt || 0) > (local.updatedAt || 0);
  const newer = isRemoteNewer ? remote : local;
  const older = isRemoteNewer ? local : remote;

  // Combine deletion tombstones (keep latest deletion timestamp per ID, bounded to 400)
  const combinedDeleted: Record<string, number> = {
    ...(older.deletedItemIds || {}),
    ...(newer.deletedItemIds || {}),
  };
  for (const [k, ts] of Object.entries(older.deletedItemIds || {})) {
    combinedDeleted[k] = Math.max(ts || 0, combinedDeleted[k] || 0);
  }
  const boundedDeletedEntries = Object.entries(combinedDeleted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 400);
  const deletedMap = Object.fromEntries(boundedDeletedEntries);
  const isDeleted = (id: string) => Boolean(deletedMap[id]);

  // Merge days & day items by ID, honoring tombstones without resurrecting deleted days or deleted photos
  const mergedDays = (newer.days || []).map((newerDay) => {
    const olderDay = (older.days || []).find((d) => d.dayNumber === newerDay.dayNumber);
    if (!olderDay) {
      return {
        ...newerDay,
        items: (newerDay.items || []).filter((it) => !isDeleted(it.id)),
      };
    }

    const olderItemMap = new Map((olderDay.items || []).map((item) => [item.id, item]));
    const mergedItems = (newerDay.items || []).filter((it) => !isDeleted(it.id));

    for (const [id, olderItem] of olderItemMap.entries()) {
      if (isDeleted(id)) continue;
      const idx = mergedItems.findIndex((it) => it.id === id);
      if (idx >= 0) {
        const newerItem = mergedItems[idx];
        // Respect newerItem.memoryPhotos directly so explicitly removed spot photos do not resurrect
        mergedItems[idx] = {
          ...olderItem,
          ...newerItem,
        };
      } else {
        mergedItems.push(olderItem);
      }
    }

    return {
      ...olderDay,
      ...newerDay,
      items: mergedItems,
    };
  });
  mergedDays.sort((a, b) => a.dayNumber - b.dayNumber);

  // Merge todos by ID honoring tombstones
  const todoMap = new Map(
    (older.todos || []).filter((t) => !isDeleted(t.id)).map((t) => [t.id, t])
  );
  (newer.todos || []).forEach((t) => {
    if (!isDeleted(t.id)) todoMap.set(t.id, t);
  });
  const mergedTodos = Array.from(todoMap.values());

  // Merge packingList by ID honoring tombstones
  const packMap = new Map(
    (older.packingList || []).filter((p) => !isDeleted(p.id)).map((p) => [p.id, p])
  );
  (newer.packingList || []).forEach((p) => {
    if (!isDeleted(p.id)) packMap.set(p.id, p);
  });
  const mergedPacking = Array.from(packMap.values());

  // Merge expenses by ID honoring tombstones
  const expenseMap = new Map(
    (older.expenses || []).filter((e) => !isDeleted(e.id)).map((e) => [e.id, e])
  );
  (newer.expenses || []).forEach((e) => {
    if (!isDeleted(e.id)) expenseMap.set(e.id, e);
  });
  const mergedExpenses = Array.from(expenseMap.values());

  // Merge emergencyContacts honoring tombstones
  const contactMap = new Map(
    (older.emergencyContacts || []).filter((c) => !isDeleted(c.id)).map((c) => [c.id, c])
  );
  (newer.emergencyContacts || []).forEach((c) => {
    if (!isDeleted(c.id)) contactMap.set(c.id, c);
  });
  const mergedContacts = Array.from(contactMap.values());

  // Respect newer.splitMembers / customExpenseTags so removed companions/tags do not resurrect
  const mergedSplitMembers =
    newer.splitMembers !== undefined ? newer.splitMembers : older.splitMembers || [];

  // Merge memories by ID honoring tombstones
  const memoryMap = new Map(
    (older.memories || []).filter((m) => !isDeleted(m.id)).map((m) => [m.id, m])
  );
  (newer.memories || []).forEach((m) => {
    if (!isDeleted(m.id)) memoryMap.set(m.id, m);
  });
  const mergedMemories = Array.from(memoryMap.values());

  // Merge bookings by ID honoring tombstones
  const bookingMap = new Map(
    (older.bookings || []).filter((b) => !isDeleted(b.id)).map((b) => [b.id, b])
  );
  (newer.bookings || []).forEach((b) => {
    if (!isDeleted(b.id)) bookingMap.set(b.id, b);
  });
  const mergedBookings = Array.from(bookingMap.values());

  // Merge stickyNotes by ID honoring tombstones
  let mergedStickyNotes = undefined;
  if (older.stickyNotes !== undefined || newer.stickyNotes !== undefined) {
    const stickyMap = new Map(
      (older.stickyNotes || []).filter((n) => !isDeleted(n.id)).map((n) => [n.id, n])
    );
    (newer.stickyNotes || []).forEach((n) => {
      if (!isDeleted(n.id)) stickyMap.set(n.id, n);
    });
    mergedStickyNotes = Array.from(stickyMap.values());
  }

  const mergedCustomTags =
    newer.customExpenseTags !== undefined ? newer.customExpenseTags : older.customExpenseTags || [];

  return {
    ...older,
    ...newer,
    days: mergedDays,
    todos: mergedTodos,
    packingList: mergedPacking,
    expenses: mergedExpenses,
    bookings: mergedBookings,
    emergencyContacts: mergedContacts,
    splitMembers: mergedSplitMembers,
    customExpenseTags: mergedCustomTags,
    memories: mergedMemories,
    ...(mergedStickyNotes !== undefined ? { stickyNotes: mergedStickyNotes } : {}),
    deletedItemIds: Object.keys(deletedMap).length > 0 ? deletedMap : undefined,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
  };
}

export const mergeSingleTrip = mergeTrips;

export async function syncCollaborativeTrip(
  collabId: string,
  trip: Trip,
  editorName?: string
): Promise<Trip> {
  const path = `collab_trips/${collabId}`;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cloud_sync_status', {
        detail: { tripId: trip.id, status: 'syncing', timestamp: Date.now() },
      })
    );
  }

  try {
    const docRef = doc(db, 'collab_trips', collabId);

    // Offload inline Base64 photos into collab media subcollection
    const { trip: lightweightLocal, extractedRecords } = await extractInlineImagesToMediaRefs(trip);
    await uploadMediaCollectionBatch(
      `collab_trips/${collabId}/media`,
      `collab:${collabId}`,
      lightweightLocal,
      extractedRecords,
      auth.currentUser?.uid || lightweightLocal.ownerId || 'editor'
    );

    let tripToSave = lightweightLocal;
    let existingOwnerId = lightweightLocal.ownerId;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remoteData = snap.data() as any;
        existingOwnerId = remoteData.ownerId || existingOwnerId;
        if (remoteData) {
          tripToSave = mergeTrips(lightweightLocal, normalizeTripData(lightweightLocal.id, remoteData));
        }
      }
    } catch {
      // Offline or cache-only, proceed with lightweight local state
    }

    const isOwnerEditor = !existingOwnerId || existingOwnerId === auth.currentUser?.uid;
    const basePayload: Record<string, any> = {
      id: collabId,
      collabId,
      isCollaborative: true,
      originalTripId: tripToSave.id,
      ownerId: existingOwnerId || auth.currentUser?.uid || '',
      title: tripToSave.title,
      destination: tripToSave.destination,
      startDate: tripToSave.startDate,
      endDate: tripToSave.endDate,
      currency: tripToSave.currency,
      budgetTotal: tripToSave.budgetTotal || 0,
      coverGradient: tripToSave.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: tripToSave.notes || '',
      days: tripToSave.days || [],
      packingList: tripToSave.packingList || [],
      todos: tripToSave.todos || [],
      expenses: tripToSave.expenses || [],
      bookings: tripToSave.bookings || [],
      customExpenseCategories: tripToSave.customExpenseCategories || [],
      customCategoryLabels: tripToSave.customCategoryLabels || {},
      customExpenseTags: tripToSave.customExpenseTags || [],
      customExchangeRates: tripToSave.customExchangeRates || {},
      emergencyContacts: tripToSave.emergencyContacts || [],
      memories: tripToSave.memories || [],
      stickyNotes: tripToSave.stickyNotes || [],
      deletedItemIds: tripToSave.deletedItemIds || {},
      isSplitEnabled: tripToSave.isSplitEnabled ?? false,
      splitMembers: tripToSave.splitMembers || [],
      initialCashAmount: tripToSave.initialCashAmount ?? null,
      initialCashCurrency: tripToSave.initialCashCurrency || null,
      isSoloTrip: tripToSave.isSoloTrip ?? false,
      tripMode: tripToSave.tripMode || 'planner',
      destinationLat: typeof tripToSave.destinationLat === 'number' ? tripToSave.destinationLat : null,
      destinationLng: typeof tripToSave.destinationLng === 'number' ? tripToSave.destinationLng : null,
      googlePhotosAlbumUrl: tripToSave.googlePhotosAlbumUrl || null,
      driveFolderId: tripToSave.driveFolderId || null,
      updatedAt: Date.now(),
      lastUpdatedBy: editorName || auth.currentUser?.displayName || '同行旅伴',
    };

    if (isOwnerEditor) {
      basePayload.ownerEmail = tripToSave.ownerEmail || auth.currentUser?.email || '';
      basePayload.collaborators = tripToSave.collaborators || [];
      basePayload.editorEmails = computeEditorEmails(
        tripToSave,
        auth.currentUser?.email || undefined
      );
      basePayload.viewerEmails = computeViewerEmails(tripToSave);
      basePayload.generalAccess = tripToSave.generalAccess || 'link_viewer';
    }

    const payload = sanitizeForFirestore(basePayload);

    const jsonStr = JSON.stringify(payload);
    const sizeBytes = new Blob([jsonStr]).size;
    const sizeKb = Math.round(sizeBytes / 1024);

    if (sizeBytes >= 820000) {
      const limitErr = new Error(`共編資料量 (${sizeKb} KB) 已接近單筆雲端上限 1MB。`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cloud_sync_status', {
            detail: { tripId: trip.id, status: 'error', timestamp: Date.now(), error: limitErr.message, sizeKb },
          })
        );
      }
      throw limitErr;
    }

    await setDoc(docRef, payload, { merge: true });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cloud_sync_status', {
          detail: { tripId: trip.id, status: 'synced', timestamp: Date.now(), sizeKb },
        })
      );
    }

    return tripToSave;
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cloud_sync_status', {
          detail: {
            tripId: trip.id,
            status: 'error',
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          },
        })
      );
    }
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
      ...normalizeTripData(data.originalTripId || data.id, data, undefined, {
        preserveLastSyncedAt: false,
      }),
      collabId: data.collabId || collabId,
      isCollaborative: true,
      generalAccess: data.generalAccess || 'link_viewer',
    };
  } catch (e) {
    console.warn('Fetch collaborative trip failed:', e);
    return null;
  }
}
