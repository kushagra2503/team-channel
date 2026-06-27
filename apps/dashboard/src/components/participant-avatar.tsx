import { memo, useEffect, useState } from 'react';
import { avatarStorageId } from '@/lib/avatar-identity';
import { getCachedAvatarUrl, preloadAvatar } from '@/lib/avatar-cache';
import { avatarColor, participantInitials } from './participantDisplay';

export type ParticipantAvatarProps = {
  avatarUrl?: string;
  displayName: string;
  size?: number;
  className?: string;
};

export const ParticipantAvatar = memo(function ParticipantAvatar({
  avatarUrl,
  displayName,
  size = 36,
  className
}: ParticipantAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string | undefined>(() =>
    avatarUrl ? (getCachedAvatarUrl(avatarUrl) ?? avatarUrl) : undefined
  );

  useEffect(() => {
    setFailed(false);
    if (!avatarUrl) {
      setSrc(undefined);
      return;
    }

    const cached = getCachedAvatarUrl(avatarUrl);
    if (cached) {
      setSrc(cached);
      return;
    }

    setSrc(avatarUrl);
    let cancelled = false;
    void preloadAvatar(avatarUrl).then((blobUrl) => {
      if (!cancelled && blobUrl) setSrc(blobUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  const style = { width: size, height: size };
  const colorSeed = avatarStorageId(displayName);

  if (!src || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${className ?? ''}`}
        style={{ ...style, backgroundColor: avatarColor(colorSeed), fontSize: Math.max(9, Math.round(size * 0.28)) }}
      >
        {participantInitials(displayName)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="sync"
      fetchPriority="high"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full [image-rendering:pixelated] ${className ?? ''}`}
      style={style}
    />
  );
});
