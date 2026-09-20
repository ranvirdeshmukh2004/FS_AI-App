import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

const { encrypt, decrypt } = await import("../utils/crypto.js");

describe("crypto", () => {
  it("round-trips a value", () => {
    const secret = "sk-test-abcdefghijklmnopqrstuvwxyz";
    assert.equal(decrypt(encrypt(secret)), secret);
  });

  it("produces a different ciphertext each time", () => {
    // A fresh IV per call, so identical plaintext must not look identical.
    assert.notEqual(encrypt("same"), encrypt("same"));
  });

  it("handles unicode and empty strings", () => {
    assert.equal(decrypt(encrypt("")), "");
    assert.equal(decrypt(encrypt("ключ-🔑-密钥")), "ключ-🔑-密钥");
  });

  it("refuses a tampered ciphertext", () => {
    // GCM authentication is the point: a modified payload must not decrypt.
    const [iv, tag, data] = encrypt("secret").split(":");
    const flipped = data.slice(0, -1) + (data.endsWith("a") ? "b" : "a");
    assert.throws(() => decrypt(`${iv}:${tag}:${flipped}`));
  });

  it("refuses a malformed value", () => {
    assert.throws(() => decrypt("nonsense"));
  });
});
