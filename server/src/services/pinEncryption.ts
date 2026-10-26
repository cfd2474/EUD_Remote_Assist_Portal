import crypto from "node:crypto";

/**
 * Encrypt a remote-unlock PIN to the device's registered RSA public key (base64 SPKI DER),
 * RSA-OAEP with SHA-256. The server never stores or sends the plaintext PIN.
 */
export function encryptPinForDevice(pin: string, publicKeyBase64: string): string {
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  const encrypted = crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(pin, "utf8")
  );
  return encrypted.toString("base64");
}
