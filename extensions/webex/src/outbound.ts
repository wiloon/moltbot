import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import { getWebexRuntime } from "./runtime.js";
import { sendMessageWebex } from "./send.js";

export const webexOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getWebexRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 7439, // Webex markdown limit

  sendText: async ({ cfg, to, text }) => {
    const result = await sendMessageWebex({ cfg, to, text });
    return {
      channel: "webex",
      ok: result.ok,
      messageId: result.messageId,
      error: result.error,
    };
  },

  sendMedia: async ({ cfg, to, text, mediaUrl }) => {
    const result = await sendMessageWebex({ cfg, to, text, mediaUrl });
    return {
      channel: "webex",
      ok: result.ok,
      messageId: result.messageId,
      error: result.error,
    };
  },
};
