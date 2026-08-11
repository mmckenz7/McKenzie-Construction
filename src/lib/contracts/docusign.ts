import "server-only";

import { createHmac, createPrivateKey, createSign, timingSafeEqual } from "node:crypto";

export type DocusignEnvelopeRecipient = Readonly<{
  name: string;
  email: string;
}>;

export type DocusignEnvelopeRequest = Readonly<{
  contractPreparationId: string;
  recipient: DocusignEnvelopeRecipient;
  emailSubject: string;
}>;

export type DocusignEnvelopeResult = Readonly<{
  envelopeId: string;
  status: string;
}>;

type DocusignEnvironment = "demo" | "production";

type DocusignConfiguration = Readonly<{
  accountId: string;
  environment: DocusignEnvironment;
  integrationKey: string;
  privateKey: string;
  signerRoleName: string;
  templateId: string;
  userId: string;
}>;

type DocusignAccount = Readonly<{
  account_id?: unknown;
  base_uri?: unknown;
}>;

export class DocusignConfigurationError extends Error {
  readonly code = "docusign_not_configured";

  constructor(message: string) {
    super(message);
    this.name = "DocusignConfigurationError";
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new DocusignConfigurationError(`${name} is not configured.`);
  return value;
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function authHost(environment: DocusignEnvironment) {
  return environment === "demo" ? "account-d.docusign.com" : "account.docusign.com";
}

function configuration(): DocusignConfiguration {
  if (process.env.DOCUSIGN_ENABLED?.trim().toLowerCase() !== "true") {
    throw new DocusignConfigurationError("DocuSign sending is disabled.");
  }
  const environmentValue = requiredEnvironment("DOCUSIGN_ENVIRONMENT").toLowerCase();
  if (environmentValue !== "demo" && environmentValue !== "production") {
    throw new DocusignConfigurationError("DOCUSIGN_ENVIRONMENT must be demo or production.");
  }
  return {
    accountId: requiredEnvironment("DOCUSIGN_ACCOUNT_ID"),
    environment: environmentValue,
    integrationKey: requiredEnvironment("DOCUSIGN_INTEGRATION_KEY"),
    privateKey: normalizePrivateKey(requiredEnvironment("DOCUSIGN_PRIVATE_KEY")),
    signerRoleName: requiredEnvironment("DOCUSIGN_SIGNER_ROLE_NAME"),
    templateId: requiredEnvironment("DOCUSIGN_TEMPLATE_ID"),
    userId: requiredEnvironment("DOCUSIGN_USER_ID"),
  };
}

async function responseJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function jwtAssertion(config: DocusignConfiguration) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    aud: authHost(config.environment),
    exp: now + 3600,
    iat: now,
    iss: config.integrationKey,
    scope: "signature impersonation",
    sub: config.userId,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(createPrivateKey(config.privateKey)))}`;
}

async function accessToken(config: DocusignConfiguration) {
  const response = await fetch(`https://${authHost(config.environment)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion: jwtAssertion(config),
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const result = await responseJson(response);
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(`DocuSign OAuth rejected the request (${response.status}).`);
  }
  return result.access_token;
}

async function apiBaseUri(config: DocusignConfiguration, token: string) {
  const response = await fetch(`https://${authHost(config.environment)}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await responseJson(response);
  const accounts = Array.isArray(result.accounts) ? result.accounts as DocusignAccount[] : [];
  const account = accounts.find((candidate) => candidate.account_id === config.accountId);
  if (!response.ok || typeof account?.base_uri !== "string" || !account.base_uri.trim()) {
    throw new Error("The configured DocuSign account is not available to the integration user.");
  }
  return account.base_uri.trim().replace(/\/$/, "");
}

export async function createDocusignEnvelope(
  request: DocusignEnvelopeRequest,
): Promise<DocusignEnvelopeResult> {
  const config = configuration();
  if (!request.contractPreparationId.trim()) throw new TypeError("Contract preparation ID is required.");
  if (!request.recipient.name.trim()) throw new TypeError("Contract recipient name is required.");
  if (!request.recipient.email.trim()) throw new TypeError("Contract recipient email is required.");
  if (!request.emailSubject.trim()) throw new TypeError("Contract email subject is required.");

  const token = await accessToken(config);
  const baseUri = await apiBaseUri(config, token);
  const response = await fetch(
    `${baseUri}/restapi/v2.1/accounts/${encodeURIComponent(config.accountId)}/envelopes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateId: config.templateId,
        templateRoles: [{
          email: request.recipient.email.trim(),
          name: request.recipient.name.trim(),
          roleName: config.signerRoleName,
        }],
        emailSubject: request.emailSubject.trim(),
        status: "sent",
        customFields: {
          textCustomFields: [{
            name: "contract_preparation_id",
            required: "false",
            show: "false",
            value: request.contractPreparationId.trim(),
          }],
        },
      }),
    },
  );
  const result = await responseJson(response);
  if (!response.ok || typeof result.envelopeId !== "string") {
    throw new Error(`DocuSign rejected the envelope (${response.status}).`);
  }
  return {
    envelopeId: result.envelopeId,
    status: typeof result.status === "string" ? result.status : "sent",
  };
}

export function verifyDocusignConnectSignature(rawBody: string, suppliedSignature: string | null) {
  const secret = process.env.DOCUSIGN_CONNECT_HMAC_SECRET?.trim();
  if (!secret || !suppliedSignature?.trim()) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature.trim(), "base64");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
