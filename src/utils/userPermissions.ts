import { auth } from './firebase';

export const ADMIN_UPLOAD_EMAIL = 'n9102125@gmail.com';

/**
 * Check whether the active user has image upload authorization.
 * Only n9102125@gmail.com is allowed to upload images.
 * Non-authorized users will not see any upload features.
 */
export function canUploadImages(overrideEmail?: string | null): boolean {
  // 1. Explicit email passed in
  if (overrideEmail && overrideEmail.trim().toLowerCase() === ADMIN_UPLOAD_EMAIL.toLowerCase()) {
    return true;
  }

  // 2. Firebase Auth current user email
  const firebaseEmail = auth.currentUser?.email;
  if (firebaseEmail && firebaseEmail.trim().toLowerCase() === ADMIN_UPLOAD_EMAIL.toLowerCase()) {
    return true;
  }

  // 3. Local active email (convenient for testing and session persistence)
  if (typeof window !== 'undefined') {
    const localEmail = localStorage.getItem('app_user_email') || localStorage.getItem('override_user_email');
    if (localEmail && localEmail.trim().toLowerCase() === ADMIN_UPLOAD_EMAIL.toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Set active simulated/test user email
 */
export function setActiveUserEmail(email: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_user_email', email.trim().toLowerCase());
    window.dispatchEvent(new Event('auth_state_change'));
  }
}

/**
 * Clear active user email
 */
export function clearActiveUserEmail() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('app_user_email');
    localStorage.removeItem('override_user_email');
    window.dispatchEvent(new Event('auth_state_change'));
  }
}
