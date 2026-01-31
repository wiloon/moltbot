import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { WebexClient } from "./api.js";
import { resolveWebexCredentials } from "./token.js";

export type SendWebexMessageParams = {
  /** Full config (for credentials) */
  cfg: OpenClawConfig;
  /** Room ID or person email/ID to send to */
  to: string;
  /** Message text (supports Markdown) */
  text: string;
  /** Optional media URL */
  mediaUrl?: string;
};

export type SendWebexMessageResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Send a message to a Webex room or person.
 * Uses pure REST API - no SDK dependencies.
 * Supports plain text, Markdown, and file attachments.
 */
export async function sendMessageWebex(
  params: SendWebexMessageParams,
): Promise<SendWebexMessageResult> {
  const { cfg, to, text, mediaUrl } = params;

  try {
    const credentials = resolveWebexCredentials(cfg);
    if (!credentials) {
      return { ok: false, error: "No Webex credentials configured" };
    }

    // Use REST API client (works in Node.js - no browser dependencies)
    const client = new WebexClient(credentials.botToken);

    const messagePayload: {
      roomId?: string;
      toPersonId?: string;
      toPersonEmail?: string;
      markdown: string;
      files?: string[];
    } = {
      markdown: text,
    };

    // Determine if 'to' is an email, person ID, or room ID
    if (to.includes("@")) {
      // Email address - send to person
      messagePayload.toPersonEmail = to;
    } else if (to.startsWith("Y2lzY29zcGFyazovL3VzL1BFT1BMRS8") || to.startsWith("person:")) {
      // Person ID (Base64 encoded Webex ID or prefixed)
      const personId = to.replace(/^person:/i, "");
      messagePayload.toPersonId = personId;
    } else {
      // Assume room ID
      const roomId = to.replace(/^room:/i, "");
      messagePayload.roomId = roomId;
    }

    // Add file attachment if provided
    if (mediaUrl) {
      messagePayload.files = [mediaUrl];
    }

    const response = await client.createMessage(messagePayload);

    return {
      ok: true,
      messageId: response.id,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    return {
      ok: false,
      error: `Failed to send Webex message: ${errorMsg}`,
    };
  }
}

/**
 * Get message details by ID
 */
export async function getWebexMessage(
  cfg: OpenClawConfig,
  messageId: string,
): Promise<any> {
  const credentials = resolveWebexCredentials(cfg);
  if (!credentials) {
    throw new Error("No Webex credentials configured");
  }

  const client = new WebexClient(credentials.botToken);
  return client.getMessage(messageId);
}

/**
 * List rooms the bot is in
 */
export async function listWebexRooms(cfg: OpenClawConfig): Promise<any[]> {
  const credentials = resolveWebexCredentials(cfg);
  if (!credentials) {
    return [];
  }

  const client = new WebexClient(credentials.botToken);
  const response = await client.listRooms();
  return response.items || [];
}
