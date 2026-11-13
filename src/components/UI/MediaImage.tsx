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

    let cancelled = false;
    resolveMediaSrc(src, { tripId, ownerId, collabId }).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        setResolvedSrc(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src, tripId, ownerId, collabId]);

  return <img src={resolvedSrc || TRANSPARENT_PLACEHOLDER} alt={alt} {...rest} />;
};
