import { auth } from './firebase';

export interface UploadPermissionContext {
  canEdit?: boolean;
  requireSignedIn?: boolean;
}

/**
 * Check whether the active user has image upload capability.
 * Respects read-only permission flags (canEdit === false) and optional strict auth checks.
 */
export function canUploadImages(context?: UploadPermissionContext | boolean): boolean {
  if (typeof context === 'boolean') {
    return context;
  }
  if (context?.canEdit === false) {
    return false;
  }
  if (context?.requireSignedIn) {
    return Boolean(auth.currentUser);
  }
  return true;
}

/**
 * Strictly checks whether a user is currently authenticated for cloud uploads.
 */
export function isSignedInForUpload(): boolean {
  return Boolean(auth.currentUser);
}
