const RECOVERY_PATH = "/auth/callback";

export const recoverySessionCookie = "mckenzie-password-recovery";

type RecoveryEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
};

function parseHttpOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getRecoveryCallbackUrl(
  requestOrigin: string | undefined,
  environment: RecoveryEnvironment = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  },
) {
  const sameOrigin = parseHttpOrigin(requestOrigin);
  const previewOrigin =
    environment.VERCEL_ENV === "preview"
      ? parseHttpOrigin(environment.VERCEL_URL)
      : null;
  const trustedOrigin = previewOrigin ?? sameOrigin;

  if (!trustedOrigin) {
    return null;
  }

  return new URL(RECOVERY_PATH, trustedOrigin).toString();
}
