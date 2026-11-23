import React, { useEffect, useState } from 'react';
import { getCachedMediaDisplaySrc, isMediaRef, resolveMediaSrc } from '../../utils/image';

interface MediaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  tripId?: string;
  ownerId?: string;
  collabId?: string;
}

const TRANSPARENT_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export const MediaImage: React.FC<MediaImageProps> = ({
  src,
  tripId,
  ownerId,
  collabId,
  alt = '',
  ...rest
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => getCachedMediaDisplaySrc(src));
  const [authTick, setAuthTick] = useState(0);

  // Re-attempt resolving cloud media once Firebase Auth restores on cold start
  useEffect(() => {
    if (!src || !isMediaRef(src) || resolvedSrc) return;
    const handleAuthReady = () => setAuthTick((n) => n + 1);
    window.addEventListener('hiyori_auth_ready', handleAuthReady);
    window.addEventListener('auth_state_change', handleAuthReady);
    return () => {
      window.removeEventListener('hiyori_auth_ready', handleAuthReady);
      window.removeEventListener('auth_state_change', handleAuthReady);
    };
  }, [src, resolvedSrc]);

  useEffect(() => {
    if (!src) {
      setResolvedSrc('');
      return;
    }
    if (!isMediaRef(src)) {
      setResolvedSrc(src);
      return;
    }

    const cached = getCachedMediaDisplaySrc(src);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    // Clear stale previous image immediately while resolving new ref
    setResolvedSrc('');

    let cancelled = false;
    resolveMediaSrc(src, { tripId, ownerId, collabId })
      .then((dataUrl) => {
        if (!cancelled && dataUrl) {
          setResolvedSrc(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, tripId, ownerId, collabId, authTick]);

  return <img src={resolvedSrc || TRANSPARENT_PLACEHOLDER} alt={alt} {...rest} />;
};
