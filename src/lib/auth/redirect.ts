export function getSafeInternalRedirectPath(
  value: unknown,
  fallback = "/admin",
) {
  if (typeof value !== "string") {
    return fallback;
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  const path = value.trim();

  if (
    !path.startsWith("/") ||
    path.includes("\\") ||
    /%(?![0-9a-f]{2})/i.test(path) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c|25(?:2f|5c))/i.test(path)
  ) {
    return fallback;
  }

  try {
    const trustedOrigin = "https://mckenzie-internal.invalid";
    const destination = new URL(path, trustedOrigin);

    if (destination.origin !== trustedOrigin) {
      return fallback;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
