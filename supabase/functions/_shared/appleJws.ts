// Apple JWS verification helper (StoreKit 2 / App Store Server Notifications V2).
// Verifies the JWS signature using the leaf certificate from the JWS x5c header,
// then walks the certificate chain and confirms the root is an Apple Root CA.
//
// References:
//   - https://developer.apple.com/documentation/appstoreservernotifications/jwsdecodedheader
//   - https://developer.apple.com/documentation/appstoreserverapi/verifying-the-signature-of-a-signed-data-object
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@5";
import * as x509 from "npm:@peculiar/x509@1.12.3";

export const APPLE_PRODUCT_IDS = {
  monthly: "spacetime_monthly",
  yearly: "spacetime_yearly",
} as const;

export type ApplePlan = keyof typeof APPLE_PRODUCT_IDS;

export function planForProductId(productId: string | null | undefined): ApplePlan | null {
  if (productId === APPLE_PRODUCT_IDS.monthly) return "monthly";
  if (productId === APPLE_PRODUCT_IDS.yearly) return "yearly";
  return null;
}

function pemFromBase64Der(b64: string): string {
  // Wrap in 64-char lines for PEM compliance
  const wrapped = b64.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

/**
 * Verify an Apple-signed JWS and return its decoded payload as T.
 * Throws if the signature, certificate chain, or root issuer is invalid.
 */
export async function verifyAppleJws<T = unknown>(jws: string): Promise<T> {
  const header = decodeProtectedHeader(jws) as { alg?: string; x5c?: string[] };
  if (!header.alg || !header.x5c || header.x5c.length < 2) {
    throw new Error("JWS missing required x5c chain");
  }

  // 1. Verify the JWS signature using the leaf certificate's public key.
  const leafPem = pemFromBase64Der(header.x5c[0]);
  const leafKey = await importX509(leafPem, header.alg);
  const { payload } = await jwtVerify(jws, leafKey);

  // 2. Walk the cert chain — each cert must be signed by the next.
  const certs = header.x5c.map((c) => new x509.X509Certificate(c));
  for (let i = 0; i < certs.length - 1; i++) {
    const ok = await certs[i].verify({ publicKey: certs[i + 1].publicKey, signatureOnly: true });
    if (!ok) throw new Error(`Certificate chain broken at index ${i}`);
  }

  // 3. Validity windows.
  const now = new Date();
  for (const c of certs) {
    if (now < c.notBefore || now > c.notAfter) {
      throw new Error(`Certificate expired or not yet valid: ${c.subject}`);
    }
  }

  // 4. Root must be Apple Root CA (self-signed, with "Apple Root" in CN).
  const root = certs[certs.length - 1];
  const subject = root.subject || "";
  const issuer = root.issuer || "";
  if (!/Apple Root CA/i.test(subject) || subject !== issuer) {
    throw new Error(`Untrusted root certificate: ${subject}`);
  }
  // Confirm the root is self-signed.
  const rootSelfOk = await root.verify({ publicKey: root.publicKey, signatureOnly: true });
  if (!rootSelfOk) throw new Error("Root certificate self-signature invalid");

  return payload as unknown as T;
}