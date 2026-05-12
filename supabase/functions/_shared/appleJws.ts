// Apple JWS verification helper (StoreKit 2 / App Store Server Notifications V2).
//
// Performs full App Store Server signature validation:
//   1. Verify the JWS signature with the leaf certificate's public key.
//   2. Walk the x5c chain — each certificate must be signed by the next.
//   3. Pin the chain to Apple Root CA - G3 by exact DER bytes (not by name).
//   4. Validate every certificate's notBefore/notAfter window.
//
// References:
//   - https://developer.apple.com/documentation/appstoreservernotifications/jwsdecodedheader
//   - https://developer.apple.com/documentation/appstoreserverapi/verifying-the-signature-of-a-signed-data-object
//   - Apple Root CA - G3: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@5";
import * as x509 from "npm:@peculiar/x509@1.12.3";

/** Apple Root CA - G3 (DER, base64). Pinned for chain validation.
 *  SHA-256 fingerprint: 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179 */
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

export const APPLE_PRODUCT_IDS = {
  monthly: "spacetime_monthly",
  yearly: "spacetime_yearly",
} as const;
export const ALLOWED_PRODUCT_IDS: readonly string[] = Object.values(APPLE_PRODUCT_IDS);
export const APPLE_BUNDLE_ID = "com.spacetimelabs.spacetime";

export type ApplePlan = keyof typeof APPLE_PRODUCT_IDS;
export type AppleEnv = "Sandbox" | "Production";

export function planForProductId(productId: string | null | undefined): ApplePlan | null {
  if (productId === APPLE_PRODUCT_IDS.monthly) return "monthly";
  if (productId === APPLE_PRODUCT_IDS.yearly) return "yearly";
  return null;
}

function pemFromBase64Der(b64: string): string {
  const wrapped = b64.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

function rawDerFromCert(cert: x509.X509Certificate): Uint8Array {
  return new Uint8Array(cert.rawData);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const APPLE_ROOT_DER: Uint8Array = Uint8Array.from(atob(APPLE_ROOT_CA_G3_B64), (c) => c.charCodeAt(0));

export class AppleJwsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AppleJwsError";
  }
}

/**
 * Verify an Apple-signed JWS and return its decoded payload as T.
 * Throws AppleJwsError if the signature, certificate chain, or root pin is invalid.
 */
export async function verifyAppleJws<T = unknown>(jws: string): Promise<T> {
  let header: { alg?: string; x5c?: string[] };
  try {
    header = decodeProtectedHeader(jws) as { alg?: string; x5c?: string[] };
  } catch {
    throw new AppleJwsError("malformed_jws", "Could not decode JWS header");
  }
  if (!header.alg) throw new AppleJwsError("missing_alg", "JWS header missing alg");
  if (!header.x5c || header.x5c.length < 2) {
    throw new AppleJwsError("missing_x5c", "JWS header missing x5c chain (need leaf + intermediate(s) + root)");
  }

  // Parse the chain.
  let certs: x509.X509Certificate[];
  try {
    certs = header.x5c.map((c) => new x509.X509Certificate(c));
  } catch (e) {
    throw new AppleJwsError("cert_parse_failed", `Could not parse x5c chain: ${(e as Error).message}`);
  }

  // 1. Pin the root to Apple Root CA - G3 by exact DER bytes (not by name).
  const presentedRoot = certs[certs.length - 1];
  if (!bytesEqual(rawDerFromCert(presentedRoot), APPLE_ROOT_DER)) {
    throw new AppleJwsError("untrusted_root", "Chain root does not match Apple Root CA - G3");
  }

  // 2. Validity windows for every cert in the chain.
  const now = new Date();
  for (const c of certs) {
    if (now < c.notBefore || now > c.notAfter) {
      throw new AppleJwsError("cert_expired", `Certificate outside validity window: ${c.subject}`);
    }
  }

  // 3. Walk the chain — each cert must be signed by the next.
  for (let i = 0; i < certs.length - 1; i++) {
    const ok = await certs[i].verify({ publicKey: certs[i + 1].publicKey, signatureOnly: true });
    if (!ok) throw new AppleJwsError("chain_broken", `Certificate chain broken at index ${i}`);
  }
  // Root must be self-signed (defense in depth — already pinned by DER).
  const rootSelfOk = await presentedRoot.verify({ publicKey: presentedRoot.publicKey, signatureOnly: true });
  if (!rootSelfOk) throw new AppleJwsError("root_self_sig_invalid", "Root certificate self-signature invalid");

  // 4. Verify the JWS signature with the leaf cert's public key.
  const leafPem = pemFromBase64Der(header.x5c[0]);
  let leafKey;
  try {
    leafKey = await importX509(leafPem, header.alg);
  } catch (e) {
    throw new AppleJwsError("leaf_import_failed", `Could not import leaf cert: ${(e as Error).message}`);
  }
  try {
    const { payload } = await jwtVerify(jws, leafKey);
    return payload as unknown as T;
  } catch (e) {
    throw new AppleJwsError("signature_invalid", `JWS signature verification failed: ${(e as Error).message}`);
  }
}

/** Validate the bundleId field on a verified Apple payload. */
export function assertBundleId(bundleId: string | null | undefined): void {
  const expected = Deno.env.get("APPLE_BUNDLE_ID") || APPLE_BUNDLE_ID;
  if (!bundleId) throw new AppleJwsError("missing_bundle_id", "Payload missing bundleId");
  if (bundleId !== expected) {
    throw new AppleJwsError("bundle_mismatch", `bundleId ${bundleId} does not match expected ${expected}`);
  }
}

/** Validate productId is one of our known subscription products. */
export function assertProductId(productId: string | null | undefined): ApplePlan {
  if (!productId) throw new AppleJwsError("missing_product_id", "Payload missing productId");
  const plan = planForProductId(productId);
  if (!plan) {
    throw new AppleJwsError("unsupported_product", `Unsupported productId: ${productId}`);
  }
  return plan;
}

/**
 * Validate the StoreKit environment field. Sandbox is allowed everywhere;
 * Production is only allowed to be presented as Production. We refuse if Apple
 * sends something other than Sandbox/Production, or if APPLE_REQUIRE_PRODUCTION=1
 * and the payload is Sandbox.
 */
export function assertEnvironment(env: string | null | undefined): AppleEnv {
  if (env !== "Sandbox" && env !== "Production") {
    throw new AppleJwsError("invalid_environment", `Unexpected Apple environment: ${env ?? "null"}`);
  }
  if (env === "Sandbox" && Deno.env.get("APPLE_REQUIRE_PRODUCTION") === "1") {
    throw new AppleJwsError("sandbox_in_production", "Sandbox transaction received but production is required");
  }
  return env;
}