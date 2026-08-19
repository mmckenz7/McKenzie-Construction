"use client";

import { useEffect } from "react";

import { recordPublicConversion } from "@/lib/public-analytics";

const conversionKey = "mckenzie-lead-conversion-recorded";

export function LeadConversionTracker() {
  useEffect(() => {
    if (window.sessionStorage.getItem(conversionKey)) {
      return;
    }

    recordPublicConversion("generate_lead", "project_request_submitted");
    window.sessionStorage.setItem(conversionKey, "true");
  }, []);

  return null;
}
