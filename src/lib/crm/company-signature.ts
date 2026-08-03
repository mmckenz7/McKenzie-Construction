const DEFAULT_COMPANY_NAME = "McKenzie Construction";

export function companyEmailSignature(companyName: string | null | undefined) {
  const name = companyName?.trim() || DEFAULT_COMPANY_NAME;
  return `${name}\n865-263-3811`;
}
