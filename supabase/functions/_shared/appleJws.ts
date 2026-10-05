// Apple's pinned official typed verifier uses a WebCrypto adapter for App Store
// purpose OIDs, CA/issuer constraints and offline signed-date certificate policy. Current entitlement is
// always retrieved separately; a historical signature is never current status.
import { Buffer } from "node:buffer";
import { decodeProtectedHeader, decodeJwt, importX509, jwtVerify } from "npm:jose@5.10.0";
import * as x509 from "npm:@peculiar/x509@1.12.3";
import { SignedDataVerifier, Environment } from "npm:@apple/app-store-server-library@3.1.0";
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";


export const APPLE_BUNDLE_ID = "com.spacetimelabs.spacetime";
export const APPLE_APP_ID = 6768721654;
export const APPLE_PRODUCT_IDS = { monthly: "spacetime_monthly", yearly: "spacetime_yearly" } as const;
export type AppleEnv = "Sandbox" | "Production";
export type ApplePlan = keyof typeof APPLE_PRODUCT_IDS;
export class AppleJwsError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function planForProductId(productId?: string | null): ApplePlan | null {
  return productId === APPLE_PRODUCT_IDS.monthly ? "monthly" : productId === APPLE_PRODUCT_IDS.yearly ? "yearly" : null;
}
export function assertProductId(productId?: string | null): ApplePlan {
  const plan = planForProductId(productId);
  if (!plan) throw new AppleJwsError("unsupported_product", "Unsupported subscription product");
  return plan;
}
export function assertBundleId(bundleId?: string | null) {
  if (bundleId !== (Deno.env.get("APPLE_BUNDLE_ID") || APPLE_BUNDLE_ID))
    throw new AppleJwsError("bundle_mismatch", "Wrong app bundle");
}
export function assertEnvironment(environment?: string | null): AppleEnv {
  // Dual mode is explicit for TestFlight/App Review alongside live purchases.
  // Each payload still uses Apple's verifier for its own signed environment.
  // A missing setting fails closed to Production, with no Xcode/local bypass.
  const expected = Deno.env.get("APPLE_BILLING_ENVIRONMENT") || "Production";
  if ((environment !== "Sandbox" && environment !== "Production")
    || (environment !== expected && expected !== "ProductionAndSandbox"))
    throw new AppleJwsError("environment_mismatch", "Wrong Apple billing environment");
  return environment;
}
const root = Buffer.from(APPLE_ROOT_CA_G3_B64, "base64");
// Edge Runtime does not implement Node X509Certificate.verify/toString.
// Keep Apple's typed decoders and app/environment checks. Only the protected
// crypto primitive is adapted to WebCrypto with the same offline trust policy.
// No algorithm, purpose, CA, issuer, signature, root or date check is bypassed.
export class EdgeSignedDataVerifier extends SignedDataVerifier {
  private readonly trustedRootBytes: Buffer[];
  constructor(roots: Buffer[], online: boolean, environment: Environment, bundle: string, appId?: number) {
    super(roots, online, environment, bundle, appId);
    this.trustedRootBytes = roots.map(value => Buffer.from(value));
  }
  protected override async verifyJWT<T>(jws: string, validator: { validate(value: unknown): boolean },
    extractDate: (payload: T) => Date): Promise<T> {
    if (this.enableOnlineChecks) throw new Error("Online certificate verification is not supported by this adapter");
    const header = decodeProtectedHeader(jws);
    const chain = header.x5c;
    const payload = decodeJwt(jws) as T;
    if (header.alg !== "ES256" || !chain || chain.length !== 3 || !validator.validate(payload))
      throw new Error("Invalid signed data");
    const certs = chain.map(value => new x509.X509Certificate(value));
    const [leaf, intermediate, rootCert] = certs;
    if (!this.trustedRootBytes.some(root => root.equals(Buffer.from(rootCert.rawData))))
      throw new Error("Untrusted root");
    if (leaf.issuer !== intermediate.subject || intermediate.issuer !== rootCert.subject
      || !intermediate.getExtension(x509.BasicConstraintsExtension)?.ca
      || leaf.getExtension(x509.BasicConstraintsExtension)?.ca
      || !leaf.getExtension("1.2.840.113635.100.6.11.1")
      || !intermediate.getExtension("1.2.840.113635.100.6.2.1")) throw new Error("Invalid App Store certificate purposes or constraints");
    const date = extractDate(payload).getTime();
    if (!Number.isFinite(date)) throw new Error("Invalid signing date");
    for (const cert of certs) {
      // Apple's offline verifier permits 60 seconds of signing clock skew.
      if (cert.notBefore.getTime() > date + 60000 || cert.notAfter.getTime() < date - 60000)
        throw new Error("Certificate outside signing-date validity");
    }
    if (!await leaf.verify({publicKey:intermediate.publicKey,signatureOnly:true})
      || !await intermediate.verify({publicKey:rootCert.publicKey,signatureOnly:true})
      || !await rootCert.verify({publicKey:rootCert.publicKey,signatureOnly:true})) throw new Error("Invalid certificate chain signature");
    const pem = '-----BEGIN CERTIFICATE-----\n' + chain[0].match(/.{1,64}/g)!.join('\n') + '\n-----END CERTIFICATE-----\n';
    const key = await importX509(pem,"ES256");
    await jwtVerify(jws,key,{algorithms:["ES256"]});
    return payload;
  }
}
const verifiers = new Map<string, SignedDataVerifier>();
export async function verifyAppleJws<T>(jws: string, kind: "transaction" | "notification" | "renewal", expected?: AppleEnv): Promise<T> {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) throw new Error("Malformed JWS");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const hint = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3
      || !Buffer.from(header.x5c[2], "base64").equals(root)) throw new Error("Unsupported certificate chain or algorithm");
    if (!Number.isFinite(hint.signedDate) || hint.signedDate <= 0 || hint.signedDate > Date.now() + 300000)
      throw new Error("Invalid signing date");
    // Untrusted hint only selects a verifier; its public method subsequently
    // verifies the signature, typed claims, bundle/app ID and environment.
    const environment = assertEnvironment(expected ?? hint.environment ?? hint.data?.environment ?? hint.summary?.environment);
    let verifier = verifiers.get(environment);
    if (!verifier) {
      verifier = new EdgeSignedDataVerifier([root], false,
        environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION,
        Deno.env.get("APPLE_BUNDLE_ID") || APPLE_BUNDLE_ID, APPLE_APP_ID);
      verifiers.set(environment, verifier);
    }
    const result = kind === "transaction" ? await verifier.verifyAndDecodeTransaction(jws)
      : kind === "renewal" ? await verifier.verifyAndDecodeRenewalInfo(jws)
      : await verifier.verifyAndDecodeNotification(jws);
    return result as T;
  } catch (error) {
    if (error instanceof AppleJwsError) throw error;
    throw new AppleJwsError("untrusted_jws", "Apple signed data verification failed");
  }
}
