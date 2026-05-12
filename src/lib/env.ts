export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function getTargetHandle(): string {
  return process.env.YOUTUBE_CHANNEL_HANDLE || "@Senseofdata";
}
