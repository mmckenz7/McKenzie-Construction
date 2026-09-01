"use client";

import { useEffect } from "react";

import { recordPublicConversion } from "@/lib/public-analytics";

export function LeadConversionTracker({ conversionId }: { conversionId: string }) {
  useEffect(() => {
    const conversionKey = `mckenzie-lead-conversion-recorded:${conversionId}`;
    if (window.sessionStorage.getItem(conversionKey)) {
      return;
    }

    recordPublicConversion("generate_lead", "project_request_submitted");
    window.sessionStorage.setItem(conversionKey, "true");
  }, [conversionId]);

  return null;
}
