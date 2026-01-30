import type { MoltbotConfig, RuntimeEnv } from "clawdbot/plugin-sdk";
import express, { type Request, type Response } from "express";
import Webex from "webex";
import { resolveWebexCredentials } from "./token.js";
import { getWebexRuntime } from "./runtime.js";
import {
  parseWebexWebhookEvent,
  isWebexBotMessage,
  shouldProcessWebexMessage,
  stripWebexBotMention,
} from "./inbound.js";
import { probeWebex } from "./probe.js";

export type MonitorWebexOpts = {
  cfg: MoltbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
};

export type MonitorWebexResult = {
  shutdown: () => Promise<void>;
};

/**
 * Start the Webex provider monitor
 * Sets up webhook server and registers with Webex API
 */
export async function monitorWebexProvider(
  opts: MonitorWebexOpts,
): Promise<MonitorWebexResult> {
  const core = getWebexRuntime();
  const log = core.logging.getChildLogger({ name: "webex" });
  const { cfg, abortSignal } = opts;

  const webexCfg = cfg.channels?.webex;
  if (!webexCfg?.enabled) {
    log.debug("webex provider disabled");
    return { shutdown: async () => {} };
  }

  const credentials = resolveWebexCredentials(cfg);
  if (!credentials) {
    log.error("webex credentials not configured");
    return { shutdown: async () => {} };
  }

  const runtime: RuntimeEnv = opts.runtime ?? {
    log: console.log,
    error: console.error,
    exit: (code: number): never => {
      throw new Error(`exit ${code}`);
    },
  };

  // Probe to get bot info
  const probe = await probeWebex(webexCfg);
  if (!probe.ok || !probe.botInfo) {
    log.error(`webex probe failed: ${probe.error}`);
    return { shutdown: async () => {} };
  }

  const botInfo = probe.botInfo;
  const botId = botInfo.id;
  const botEmail = botInfo.emails[0] || "";
  const botName = botInfo.displayName;

  log.info(`webex bot authenticated: ${botName} (${botEmail})`);

  // Initialize Webex SDK
  const webex = Webex.init({
    credentials: {
      access_token: credentials.botToken,
    },
  });

  // Setup webhook server
  const app = express();
  app.use(express.json());

  const webhookPort = webexCfg.webhook?.port ?? 3979;
  const webhookPath = webexCfg.webhook?.path ?? "/webex/webhook";
  const webhookUrl = webexCfg.webhook?.url || `https://your-domain.com${webhookPath}`;

  let server: any = null;
  let webhookId: string | null = null;

  // Webhook endpoint
  app.post(webhookPath, async (req: Request, res: Response) => {
    try {
      const event = req.body;

      // Acknowledge immediately
      res.status(200).send("OK");

      // Skip if not a message event
      if (event.resource !== "messages" || event.event !== "created") {
        return;
      }

      // Skip bot's own messages
      if (isWebexBotMessage(event, botEmail)) {
        return;
      }

      // Get full message details
      const messageId = event.data.id;
      const fullMessage = await webex.messages.get(messageId);

      // Parse the message
      const parsed = parseWebexWebhookEvent(event, fullMessage, botId);

      // Check if we should process this message
      const requireMentionInGroups = webexCfg.groupPolicy === "mention" || 
        webexCfg.groupPolicy === "allowlist";
      
      if (!shouldProcessWebexMessage(parsed, requireMentionInGroups)) {
        log.debug(`skipping message: no mention in group`);
        return;
      }

      // Clean up the text (remove bot mention if present)
      let text = parsed.text || parsed.markdown || "";
      if (parsed.isBotMentioned) {
        text = stripWebexBotMention(text, botName);
      }

      // Route message to agent
      const messageContext = {
        channel: "webex",
        from: parsed.personEmail || parsed.personId,
        to: parsed.roomId || parsed.personId,
        text,
        messageId: parsed.messageId,
        timestamp: parsed.created,
        isDirectMessage: parsed.roomType === "direct",
        files: parsed.files,
      };

      // Emit message event to runtime
      await core.channel.events.onMessage({
        cfg,
        context: messageContext,
        runtime,
      });

    } catch (error: any) {
      log.error(`webhook error: ${error?.message || String(error)}`);
    }
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "webex" });
  });

  // Start server
  try {
    server = app.listen(webhookPort, () => {
      log.info(`webex webhook server listening on port ${webhookPort}`);
    });

    // Register webhook with Webex
    try {
      // Check if webhook already exists
      const existingWebhooks = await webex.webhooks.list();
      const existing = existingWebhooks.items.find(
        (wh: any) => wh.targetUrl === webhookUrl && wh.resource === "messages",
      );

      if (existing) {
        webhookId = existing.id;
        log.info(`using existing webhook: ${webhookId}`);
      } else {
        // Create new webhook
        const webhook = await webex.webhooks.create({
          name: "Moltbot Webex Webhook",
          targetUrl: webhookUrl,
          resource: "messages",
          event: "created",
        });
        webhookId = webhook.id;
        log.info(`created webhook: ${webhookId}`);
      }
    } catch (error: any) {
      log.warn(`webhook registration failed: ${error?.message || String(error)}`);
      log.warn(`you may need to manually configure webhook to ${webhookUrl}`);
    }

  } catch (error: any) {
    log.error(`failed to start webhook server: ${error?.message || String(error)}`);
    return { shutdown: async () => {} };
  }

  // Handle abort signal
  const abortHandler = () => {
    log.info("webex monitor aborted");
    void shutdown();
  };
  abortSignal?.addEventListener("abort", abortHandler);

  // Shutdown function
  const shutdown = async () => {
    log.info("shutting down webex monitor");

    // Remove abort listener
    abortSignal?.removeEventListener("abort", abortHandler);

    // Delete webhook if we created it
    if (webhookId) {
      try {
        await webex.webhooks.remove(webhookId);
        log.info(`deleted webhook: ${webhookId}`);
      } catch (error: any) {
        log.warn(`failed to delete webhook: ${error?.message || String(error)}`);
      }
    }

    // Stop server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          log.info("webhook server stopped");
          resolve();
        });
      });
    }
  };

  return { shutdown };
}
