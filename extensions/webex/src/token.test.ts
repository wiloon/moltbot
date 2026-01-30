import { describe, expect, it } from "vitest";
import { resolveWebexCredentials } from "./token.js";

describe("webex token resolution", () => {
  it("resolves token from environment variable", () => {
    const originalEnv = process.env.WEBEX_BOT_TOKEN;
    process.env.WEBEX_BOT_TOKEN = "test-token-from-env";

    const credentials = resolveWebexCredentials({});

    expect(credentials).toEqual({ botToken: "test-token-from-env" });

    // Restore
    if (originalEnv) {
      process.env.WEBEX_BOT_TOKEN = originalEnv;
    } else {
      delete process.env.WEBEX_BOT_TOKEN;
    }
  });

  it("resolves token from config", () => {
    const cfg = {
      channels: {
        webex: {
          botToken: "test-token-from-config",
        },
      },
    };

    const credentials = resolveWebexCredentials(cfg);

    expect(credentials).toEqual({ botToken: "test-token-from-config" });
  });

  it("prefers environment variable over config", () => {
    const originalEnv = process.env.WEBEX_BOT_TOKEN;
    process.env.WEBEX_BOT_TOKEN = "env-token";

    const cfg = {
      channels: {
        webex: {
          botToken: "config-token",
        },
      },
    };

    const credentials = resolveWebexCredentials(cfg);

    expect(credentials).toEqual({ botToken: "env-token" });

    // Restore
    if (originalEnv) {
      process.env.WEBEX_BOT_TOKEN = originalEnv;
    } else {
      delete process.env.WEBEX_BOT_TOKEN;
    }
  });

  it("returns null when no credentials configured", () => {
    const originalEnv = process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_BOT_TOKEN;

    const credentials = resolveWebexCredentials({});

    expect(credentials).toBeNull();

    // Restore
    if (originalEnv) {
      process.env.WEBEX_BOT_TOKEN = originalEnv;
    }
  });

  it("handles empty token strings", () => {
    const cfg = {
      channels: {
        webex: {
          botToken: "   ",
        },
      },
    };

    const credentials = resolveWebexCredentials(cfg);

    expect(credentials).toBeNull();
  });
});
