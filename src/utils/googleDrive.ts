import { clearDriveAccessToken } from './firebase';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const HIYORI_ROOT_FOLDER_NAME = '日和手帳 Hiyori 原圖備份';
const MAX_OBJECT_URL_CACHE = 20;
const MULTIPART_MAX_BYTES = 4.5 * 1024 * 1024; // Drive API v3 caps multipart at 5MB; use resumable above 4.5MB

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Google Drive 授權已過期或權限不足，請重新授權連線') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

let cachedRootFolderId: string | null = null;
let inFlightRootFolderPromise: Promise<string> | null = null;
const tripFolderCache = new Map<string, string>();
const inFlightTripFolderPromises = new Map<string, Promise<string>>();
const originalObjectUrlCache = new Map<string, { url: string; mimeType: string }>();
const inFlightOriginalFetches = new Map<string, Promise<string>>();

export function clearDriveClientCaches(): void {
  cachedRootFolderId = null;
  tripFolderCache.clear();
  for (const entry of originalObjectUrlCache.values()) {
    try {
      URL.revokeObjectURL(entry.url);
    } catch {}
  }
  originalObjectUrlCache.clear();
  inFlightOriginalFetches.clear();
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeFolderName(name: string): string {
  return (name || '未命名旅程').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || '未命名旅程';
}

function extensionForMime(mimeType?: string): string {
  if (!mimeType) return '.jpg';
  const lower = mimeType.toLowerCase();
  if (lower.includes('heic')) return '.heic';
  if (lower.includes('heif')) return '.heif';
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('gif')) return '.gif';
  return '.jpg';
}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  // Only invalidate OAuth session on 401 Unauthorized (expired/revoked token).
  // Never wipe User B's valid token or revoke active blob: URLs on 403 Forbidden (e.g., viewing Collaborator A's private Drive file)!
  if (res.status === 401) {
    clearDriveAccessToken();
    throw new DriveAuthExpiredError();
  }
  if (res.status === 403) {
    const cloned = res.clone();
    const errJson = await cloned.json().catch(() => null);
    const reason = errJson?.error?.errors?.[0]?.reason || '';
    if (reason === 'insufficientPermissions' || reason === 'authError') {
      clearDriveAccessToken();
      throw new DriveAuthExpiredError();
    }
  }
  return res;
}

export async function ensureHiyoriRootFolder(token: string): Promise<string> {
  if (cachedRootFolderId) return cachedRootFolderId;
  if (inFlightRootFolderPromise) return inFlightRootFolderPromise;

  inFlightRootFolderPromise = (async () => {
    const q = `name = '${escapeDriveQueryValue(HIYORI_ROOT_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=5`;
    const searchRes = await driveFetch(searchUrl, token);
    if (!searchRes.ok) {
      const errText = await searchRes.text().catch(() => '');
      throw new Error(`無法讀取 Google Drive 資料夾 (${searchRes.status}): ${errText}`);
    }
    const searchData = await searchRes.json();
    if (Array.isArray(searchData.files) && searchData.files.length > 0 && searchData.files[0].id) {
      cachedRootFolderId = searchData.files[0].id;
      return cachedRootFolderId!;
    }

    const createRes = await driveFetch(`${DRIVE_API_BASE}/files?fields=id,name`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: HIYORI_ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { hiyoriRoot: 'true' },
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      throw new Error(`無法建立 Google Drive 根資料夾 (${createRes.status}): ${errText}`);
    }
    const created = await createRes.json();
    cachedRootFolderId = created.id;
    return created.id as string;
  })().finally(() => {
    inFlightRootFolderPromise = null;
  });

  return inFlightRootFolderPromise;
}

export async function ensureTripDriveFolder(
  token: string,
  tripId: string,
  tripTitle: string,
  existingFolderId?: string
): Promise<string> {
  const cached = tripFolderCache.get(tripId);
  if (cached) return cached;

  const inflight = inFlightTripFolderPromises.get(tripId);
  if (inflight) return inflight;

  const task = (async () => {
    if (existingFolderId) {
      try {
        const checkRes = await driveFetch(
          `${DRIVE_API_BASE}/files/${encodeURIComponent(existingFolderId)}?fields=id,trashed`,
          token
        );
        if (checkRes.ok) {
          const meta = await checkRes.json();
          if (meta?.id && !meta?.trashed) {
            tripFolderCache.set(tripId, meta.id);
            return meta.id as string;
          }
        }
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) throw err;
      }
    }

    const rootId = await ensureHiyoriRootFolder(token);
    const safeTitle = sanitizeFolderName(tripTitle);

    const q = `'${escapeDriveQueryValue(rootId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='hiyoriTripId' and value='${escapeDriveQueryValue(tripId)}' }`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=5`;
    const searchRes = await driveFetch(searchUrl, token);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData.files) && searchData.files.length > 0 && searchData.files[0].id) {
        const foundId = searchData.files[0].id as string;
        tripFolderCache.set(tripId, foundId);
        return foundId;
      }
    }

    const createRes = await driveFetch(`${DRIVE_API_BASE}/files?fields=id,name`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: safeTitle,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId],
        appProperties: { hiyoriTripId: tripId },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      throw new Error(`無法建立旅程相簿資料夾 (${createRes.status}): ${errText}`);
    }
    const created = await createRes.json();
    tripFolderCache.set(tripId, created.id);
    return created.id as string;
  })().finally(() => {
    inFlightTripFolderPromises.delete(tripId);
  });

  inFlightTripFolderPromises.set(tripId, task);
  return task;
}

export interface DriveUploadResult {
  driveFileId: string;
  driveFolderId: string;
  originalBytes: number;
  originalMimeType: string;
}

export async function uploadOriginalPhotoToDrive(
  file: File,
  opts: {
    token: string;
    tripId: string;
    tripTitle: string;
    existingFolderId?: string;
    takenDate?: string;
  }
): Promise<DriveUploadResult> {
  const folderId = await ensureTripDriveFolder(
    opts.token,
    opts.tripId,
    opts.tripTitle,
    opts.existingFolderId
  );

  const datePrefix = opts.takenDate ? `${opts.takenDate}_` : '';
  const cleanFileName = (file.name || `photo_${Date.now()}.jpg`).replace(/[\\/:*?"<>|]/g, '_');
  const uploadName = cleanFileName.startsWith(datePrefix) ? cleanFileName : `${datePrefix}${cleanFileName}`;
  const mimeType = file.type || 'image/jpeg';

  const metadata = {
    name: uploadName,
    parents: [folderId],
    mimeType,
    appProperties: {
      hiyoriTripId: opts.tripId,
      ...(opts.takenDate ? { takenDate: opts.takenDate } : {}),
    },
  };

  // Files > 4.5MB must use Drive Resumable Upload API (multipart caps at 5MB)
  if (file.size > MULTIPART_MAX_BYTES) {
    const initRes = await driveFetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,size,mimeType`,
      opts.token,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(file.size),
        },
        body: JSON.stringify(metadata),
      }
    );
    if (!initRes.ok) {
      const errText = await initRes.text().catch(() => '');
      throw new Error(`無法建立 Google Drive 大檔上傳階段 (${initRes.status}): ${errText}`);
    }
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Google Drive 未回傳續傳網址');
    }
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      throw new Error(`原圖續傳 Google Drive 失敗 (${putRes.status}): ${errText}`);
    }
    const created = await putRes.json();
    return {
      driveFileId: created.id,
      driveFolderId: folderId,
      originalBytes: Number(created.size) || file.size,
      originalMimeType: created.mimeType || mimeType,
    };
  }

  const boundary = `hiyori_drive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--`;

  const bodyBlob = new Blob([metaPart, file, endPart], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,size,mimeType`,
    opts.token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`原圖上傳 Google Drive 失敗 (${res.status}): ${errText}`);
  }

  const created = await res.json();
  return {
    driveFileId: created.id,
    driveFolderId: folderId,
    originalBytes: Number(created.size) || file.size,
    originalMimeType: created.mimeType || mimeType,
  };
}

export function getCachedDriveOriginalObjectUrl(driveFileId?: string): string | null {
  if (!driveFileId) return null;
  return originalObjectUrlCache.get(driveFileId)?.url || null;
}

export async function fetchDriveOriginalObjectUrl(
  driveFileId: string,
  token: string
): Promise<string> {
  const cached = originalObjectUrlCache.get(driveFileId);
  if (cached) {
    originalObjectUrlCache.delete(driveFileId);
    originalObjectUrlCache.set(driveFileId, cached);
    return cached.url;
  }

  const existingPromise = inFlightOriginalFetches.get(driveFileId);
  if (existingPromise) return existingPromise;

  const task = (async () => {
    const res = await driveFetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}?alt=media`,
      token
    );
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('找不到 Google Drive 上的原圖檔案（可能已被移動或刪除）');
      }
      throw new Error(`無法載入 Google Drive 原圖 (${res.status})`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (originalObjectUrlCache.size >= MAX_OBJECT_URL_CACHE) {
      const oldestKey = originalObjectUrlCache.keys().next().value;
      if (oldestKey) {
        const oldestEntry = originalObjectUrlCache.get(oldestKey);
        originalObjectUrlCache.delete(oldestKey);
        if (oldestEntry) {
          try {
            URL.revokeObjectURL(oldestEntry.url);
          } catch {}
        }
      }
    }

    originalObjectUrlCache.set(driveFileId, {
      url: objectUrl,
      mimeType: blob.type || res.headers.get('Content-Type') || 'image/jpeg',
    });
    return objectUrl;
  })();

  inFlightOriginalFetches.set(driveFileId, task);
  try {
    return await task;
  } finally {
    inFlightOriginalFetches.delete(driveFileId);
  }
}

export async function downloadDriveOriginalFile(
  driveFileId: string,
  filename: string,
  token: string
): Promise<void> {
  const objectUrl = await fetchDriveOriginalObjectUrl(driveFileId, token);
  const entry = originalObjectUrlCache.get(driveFileId);
  const expectedExt = extensionForMime(entry?.mimeType);
  let safeName = (filename || `hiyori_original_${driveFileId}`).replace(/[\\/:*?"<>|]/g, '_');
  // Avoid saving an image/heic blob with a forced .jpg extension
  if (entry?.mimeType && !safeName.toLowerCase().endsWith(expectedExt)) {
    safeName = safeName.replace(/\.(jpe?g|png|webp|heic|heif)$/i, '') + expectedExt;
  }
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = safeName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function deleteDriveFile(driveFileId: string, token: string): Promise<void> {
  const res = await driveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`,
    token,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`無法刪除 Google Drive 原圖 (${res.status})`);
  }
  const cached = originalObjectUrlCache.get(driveFileId);
  if (cached) {
    originalObjectUrlCache.delete(driveFileId);
    try {
      URL.revokeObjectURL(cached.url);
    } catch {}
  }
}

export function formatBytesLabel(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
