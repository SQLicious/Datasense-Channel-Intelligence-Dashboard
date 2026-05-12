export const PUBLIC_SYNC_WINDOW_MS = 12 * 60 * 60 * 1000;
export const PUBLIC_SYNC_MAX_ATTEMPTS = 2;

export function getPublicSyncRateLimit(attempts: string[], nowIso: string) {
  const now = Date.parse(nowIso);

  if (Number.isNaN(now)) {
    return {
      blocked: false as const,
      retryAt: undefined,
      recentAttempts: [] as string[],
      remainingAttempts: PUBLIC_SYNC_MAX_ATTEMPTS,
    };
  }

  const recentAttempts = attempts
    .filter((attempt) => {
      const parsed = Date.parse(attempt);
      return !Number.isNaN(parsed) && now - parsed < PUBLIC_SYNC_WINDOW_MS;
    })
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  if (recentAttempts.length >= PUBLIC_SYNC_MAX_ATTEMPTS) {
    const retryAt = new Date(Date.parse(recentAttempts[0]) + PUBLIC_SYNC_WINDOW_MS).toISOString();
    return {
      blocked: true as const,
      retryAt,
      recentAttempts,
      remainingAttempts: 0,
    };
  }

  return {
    blocked: false as const,
    retryAt: undefined,
    recentAttempts,
    remainingAttempts: PUBLIC_SYNC_MAX_ATTEMPTS - recentAttempts.length,
  };
}

export function formatPublicSyncRateLimitMessage(retryAt: string) {
  return `Public sync is limited to 2 runs per IP every 12 hours. Try again after ${retryAt}.`;
}
