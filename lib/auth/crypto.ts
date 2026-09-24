// HMAC-SHA256 and base64url on Web Crypto alone, so the same code runs in the
// proxy, route handlers and server actions whatever their runtime.

const encoder = new TextEncoder();

let cachedKey: { secret: string; key: Promise<CryptoKey> } | undefined;

// Importing a key is async, so keep the last one; tests that change the
// secret get a fresh key.
function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    const key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

// The label keeps a MAC made for one purpose from verifying for another.
function labelled(label: string, value: string) {
  return encoder.encode(`${label}:${value}`);
}

export async function hmacSign(
  secret: string,
  label: string,
  value: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    labelled(label, value),
  );
  return new Uint8Array(mac);
}

/** Whether `mac` is the MAC of `value`, compared in constant time by Web Crypto. */
export async function hmacVerify(
  secret: string,
  label: string,
  value: string,
  mac: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    mac,
    labelled(label, value),
  );
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Null when `text` isn't unpadded base64url. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    // A length that no byte count produces, such as 4n + 1.
    return null;
  }
}
