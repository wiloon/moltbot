import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import Webex from "webex";
import { resolveWebexCredentials } from "./token.js";

export type WebexProbeResult = {
  ok: boolean;
  authenticated?: boolean;
  botInfo?: {
    id: string;
    displayName: string;
    emails: string[];
  };
  error?: string;
};

/**
 * Probe Webex API to verify connectivity and credentials
 */
export async function probeWebex(
  webexConfig: any,
): Promise<WebexProbeResult> {
  try {
    const botToken = webexConfig?.botToken?.trim();
    const envToken = process.env.WEBEX_BOT_TOKEN?.trim();
    const token = botToken || envToken;

    if (!token) {
      return {
        ok: false,
        authenticated: false,
        error: "No bot token configured",
      };
    }

    const webex = Webex.init({
      credentials: {
        access_token: token,
      },
    });

    // Get bot's own information to verify token
    const person = await webex.people.get("me");

    return {
      ok: true,
      authenticated: true,
      botInfo: {
        id: person.id,
        displayName: person.displayName,
        emails: person.emails || [],
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    return {
      ok: false,
      authenticated: false,
      error: `Probe failed: ${errorMsg}`,
    };
  }
}

/**
 * Verify webhook configuration
 */
export async function verifyWebexWebhook(
  cfg: MoltbotConfig,
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const credentials = resolveWebexCredentials(cfg);
    if (!credentials) {
      return { ok: false, error: "No credentials configured" };
    }

    const webex = Webex.init({
      credentials: {
        access_token: credentials.botToken,
      },
    });

    // List existing webhooks
    const webhooks = await webex.webhooks.list();
    const existing = webhooks.items.find((wh: any) => wh.targetUrl === webhookUrl);

    if (existing) {
      return { ok: true };
    }

    return { ok: false, error: "Webhook not found" };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}
