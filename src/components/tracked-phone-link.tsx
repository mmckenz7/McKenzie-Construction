"use client";

import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";

import { recordPublicConversion } from "@/lib/public-analytics";

type TrackedPhoneLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  children: ReactNode;
  location: string;
};

export function TrackedPhoneLink({
  children,
  location,
  onClick,
  ...anchorProps
}: TrackedPhoneLinkProps) {
  function trackPhoneClick(event: MouseEvent<HTMLAnchorElement>) {
    recordPublicConversion("phone_call_click", location);
    onClick?.(event);
  }

  return (
    <a {...anchorProps} href="tel:+18654333325" onClick={trackPhoneClick}>
      {children}
    </a>
  );
}
