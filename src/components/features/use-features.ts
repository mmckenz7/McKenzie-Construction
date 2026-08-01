"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  DEFAULT_FEATURE_MAP,
  FeatureKey,
  FeatureMap,
} from "@/lib/features/types";

type UseFeaturesOptions = {
  scopeType?:
    | "global"
    | "company"
    | "workspace";

  scopeId?: string;
};

export function useFeatures(
  options: UseFeaturesOptions = {},
) {
  const scopeType =
    options.scopeType ??
    "global";

  const scopeId =
    options.scopeId ??
    "default";

  const [
    features,
    setFeatures,
  ] = useState<FeatureMap>(
    DEFAULT_FEATURE_MAP,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const loadFeatures =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const query =
          new URLSearchParams({
            scopeType,
            scopeId,
          });

        const response = await fetch(
          `/api/features?${query.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            features?: FeatureMap;
          };

        if (
          !response.ok ||
          !result.success ||
          !result.features
        ) {
          throw new Error(
            result.error ??
              "Could not load features.",
          );
        }

        setFeatures(
          result.features,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load features.",
        );
      } finally {
        setLoading(false);
      }
    }, [
      scopeType,
      scopeId,
    ]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  function isEnabled(
    featureKey: FeatureKey,
  ) {
    return Boolean(
      features[featureKey],
    );
  }

  return {
    features,
    loading,
    error,
    isEnabled,
    reloadFeatures:
      loadFeatures,
  };
}
