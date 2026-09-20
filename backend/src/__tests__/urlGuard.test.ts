import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

// The guard behaves differently in production, so NODE_ENV has to be set
// before the module (and the config it reads) is first imported.
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

const { checkOutboundUrl } = await import("../utils/urlGuard.js");

after(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("checkOutboundUrl (production)", () => {
  it("allows a normal public https endpoint", () => {
    assert.equal(checkOutboundUrl("https://api.openai.com/v1").ok, true);
  });

  it("rejects cloud metadata", () => {
    // The classic SSRF target: instance credentials.
    assert.equal(checkOutboundUrl("http://169.254.169.254/latest/meta-data/").ok, false);
  });

  it("rejects loopback", () => {
    assert.equal(checkOutboundUrl("https://127.0.0.1:8080/v1").ok, false);
    assert.equal(checkOutboundUrl("https://localhost/v1").ok, false);
  });

  it("rejects each private IPv4 range", () => {
    for (const host of ["10.0.0.5", "172.16.3.1", "172.31.255.254", "192.168.1.1"]) {
      assert.equal(checkOutboundUrl(`https://${host}/v1`).ok, false, host);
    }
  });

  it("allows public addresses that merely look adjacent to private ones", () => {
    // 172.15 and 172.32 sit outside 172.16.0.0/12.
    assert.equal(checkOutboundUrl("https://172.15.0.1/v1").ok, true);
    assert.equal(checkOutboundUrl("https://172.32.0.1/v1").ok, true);
    assert.equal(checkOutboundUrl("https://11.0.0.1/v1").ok, true);
  });

  it("rejects internal hostnames", () => {
    assert.equal(checkOutboundUrl("https://db.internal/v1").ok, false);
    assert.equal(checkOutboundUrl("https://printer.local/v1").ok, false);
  });

  it("rejects non-http protocols", () => {
    assert.equal(checkOutboundUrl("file:///etc/passwd").ok, false);
    assert.equal(checkOutboundUrl("gopher://example.com/").ok, false);
  });

  it("requires https in production", () => {
    assert.equal(checkOutboundUrl("http://example.com/v1").ok, false);
  });

  it("rejects malformed input", () => {
    assert.equal(checkOutboundUrl("not a url").ok, false);
    assert.equal(checkOutboundUrl("").ok, false);
  });
});
