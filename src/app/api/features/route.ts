import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  getFeatureScopeFromRequest,
  getServerFeatureMap,
} from "@/lib/features/server";

export async function GET(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const scope =
    getFeatureScopeFromRequest(
      request,
    );

  try {
    const features =
      await getServerFeatureMap(
        scope,
      );

    return NextResponse.json({
      success: true,
      scopeType:
        scope.scopeType,
      scopeId:
        scope.scopeId,
      features,
    });
  } catch (featureError) {
    return NextResponse.json(
      {
        success: false,
        error:
          featureError instanceof Error
            ? featureError.message
            : "Could not load features.",
      },
      {
        status: 500,
      },
    );
  }
}
