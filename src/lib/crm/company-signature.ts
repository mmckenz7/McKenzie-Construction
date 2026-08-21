const DEFAULT_COMPANY_NAME = "McKenzie Construction";
export const COMPANY_PHONE_DISPLAY = "865-433-3325";

export function companyEmailSignature(companyName: string | null | undefined) {
  const name = companyName?.trim() || DEFAULT_COMPANY_NAME;
  return `${name}\n${COMPANY_PHONE_DISPLAY}`;
}
