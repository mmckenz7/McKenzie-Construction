const RECOVERY_PATH = "/auth/callback";

export const recoverySessionCookie = "mckenzie-password-recovery";

type RecoveryEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_BRANCH_URL?: string;
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

function parseVercelPreviewOrigin(value: string | undefined) {
  const origin = parseHttpOrigin(value);

  if (!origin) {
    return null;
  }

  const url = new URL(origin);

  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    return null;
  }

  return origin;
}

export function getRecoveryCallbackUrl(
  requestOrigin: string | undefined,
  environment: RecoveryEnvironment = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  },
) {
  const sameOrigin = parseHttpOrigin(requestOrigin);
  const isPreview = environment.VERCEL_ENV === "preview";
  const previewOrigin = isPreview
    ? parseVercelPreviewOrigin(environment.VERCEL_BRANCH_URL) ??
      parseVercelPreviewOrigin(environment.VERCEL_URL)
    : null;
  const trustedOrigin = isPreview ? previewOrigin : sameOrigin;

  if (!trustedOrigin) {
    return null;
  }

  return new URL(RECOVERY_PATH, trustedOrigin).toString();
}
