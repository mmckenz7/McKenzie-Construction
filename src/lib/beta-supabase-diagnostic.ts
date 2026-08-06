const stagingProjectRef = "iiofljulghibantfzlim";
const stagingSupabaseUrl =
  `https://${stagingProjectRef}.supabase.co`;

type MatchClassification =
  | "MATCH"
  | "MISMATCH"
  | "MISSING"
  | "UNVERIFIED";

export type BetaSupabaseDiagnostic = {
  url: Exclude<MatchClassification, "UNVERIFIED">;
  projectRef: string;
  publishableKey: MatchClassification;
  serviceRoleKey: MatchClassification;
  betaConfiguration:
    | "CORRECT"
    | "INCORRECT"
    | "UNVERIFIED";
};

export function betaDiagnosticIsAvailable(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF ===
      "beta/estimating-core"
  );
}

function getProjectRef(value: string | undefined) {
  if (!value) {
    return "UNKNOWN";
  }

  try {
    return (
      new URL(value).hostname.split(".")[0] ||
      "UNKNOWN"
    );
  } catch {
    return "UNKNOWN";
  }
}

async function validatePublishableKey(
  key: string | undefined,
  fetchImplementation: typeof fetch,
): Promise<MatchClassification> {
  if (!key) {
    return "MISSING";
  }

  try {
    const response = await fetchImplementation(
      `${stagingSupabaseUrl}/auth/v1/settings`,
      {
        headers: {
          apikey: key,
        },
        cache: "no-store",
      },
    );

    return response.ok ? "MATCH" : "MISMATCH";
  } catch {
    return "UNVERIFIED";
  }
}

async function validateServiceRoleKey(
  key: string | undefined,
  fetchImplementation: typeof fetch,
): Promise<MatchClassification> {
  if (!key) {
    return "MISSING";
  }

  try {
    const response = await fetchImplementation(
      `${stagingSupabaseUrl}/auth/v1/admin/users?page=1&per_page=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: "no-store",
      },
    );

    return response.ok ? "MATCH" : "MISMATCH";
  } catch {
    return "UNVERIFIED";
  }
}

export async function runBetaSupabaseDiagnostic(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): Promise<BetaSupabaseDiagnostic> {
  const url =
    environment.NEXT_PUBLIC_SUPABASE_URL;
  const urlClassification = !url
    ? "MISSING"
    : url === stagingSupabaseUrl
      ? "MATCH"
      : "MISMATCH";

  const [publishableKey, serviceRoleKey] =
    await Promise.all([
      validatePublishableKey(
        environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        fetchImplementation,
      ),
      validateServiceRoleKey(
        environment.SUPABASE_SERVICE_ROLE_KEY,
        fetchImplementation,
      ),
    ]);

  const classifications = [
    urlClassification,
    publishableKey,
    serviceRoleKey,
  ];

  const betaConfiguration = classifications.includes(
    "UNVERIFIED",
  )
    ? "UNVERIFIED"
    : classifications.every(
          (classification) =>
            classification === "MATCH",
        )
      ? "CORRECT"
      : "INCORRECT";

  return {
    url: urlClassification,
    projectRef: getProjectRef(url),
    publishableKey,
    serviceRoleKey,
    betaConfiguration,
  };
}
