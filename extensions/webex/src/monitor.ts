import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import express, { type Request, type Response } from "express";
import { WebexClient } from "./api.js";
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
  cfg: OpenClawConfig;
  abortSignal?: AbortSignal;
};

export type MonitorWebexResult = {
  shutdown: () => Promise<void>;
  mode: "webhook" | "polling" | "both";
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
    return { shutdown: async () => {}, mode: "webhook" };
  }

  const credentials = resolveWebexCredentials(cfg);
  if (!credentials) {
    log.error("webex credentials not configured");
    return { shutdown: async () => {}, mode: "webhook" };
  }

  // Determine mode: webhook, polling, or both
  const mode = webexCfg.mode || "webhook";

  // Probe to get bot info
  const probe = await probeWebex(webexCfg);
  if (!probe.ok || !probe.botInfo) {
    log.error(`webex probe failed: ${probe.error}`);
    return { shutdown: async () => {}, mode };
  }

  const botInfo = probe.botInfo;
  const botId = botInfo.id;
  const botEmail = botInfo.emails[0] || "";
  const botName = botInfo.displayName;

  log.info(`webex bot authenticated: ${botName} (${botEmail})`);

  // Use REST API client (works in Node.js - no browser dependencies)
  const client = new WebexClient(credentials.botToken);

  // State for polling mode
  const pollStartTime = Date.now();
  let pollingInterval: NodeJS.Timeout | null = null;
  const pollingIntervalMs = (webexCfg.polling?.intervalSeconds ?? 5) * 1000;

  // Setup webhook server (if mode includes webhook)
  const app = express();
  app.use(express.json());

  const webhookPort = webexCfg.webhook?.port ?? 3979;
  const webhookPath = webexCfg.webhook?.path ?? "/webex/webhook";
  const webhookUrl = webexCfg.webhook?.url || `https://your-domain.com${webhookPath}`;

  let server: any = null;
  let webhookId: string | null = null;
  const enableWebhook = mode === "webhook" || mode === "both";
  const enablePolling = mode === "polling" || mode === "both";

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
      const fullMessage = await client.getMessage(messageId);

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

      // Route message to agent using runtime dispatch
      const route = core.channel.routing.resolveAgentRoute({
        cfg,
        channel: "webex",
        accountId: DEFAULT_ACCOUNT_ID,
        peer: {
          kind: parsed.roomType === "direct" ? "dm" : "group",
          id: parsed.roomId,
        },
      });

      const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
        agentId: route.agentId,
      });

      const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
      const previousTimestamp = core.channel.session.readSessionUpdatedAt({
        storePath,
        sessionKey: route.sessionKey,
      });

      const fromLabel = parsed.personEmail || parsed.personId;
      const body = core.channel.reply.formatAgentEnvelope({
        channel: "Webex",
        from: fromLabel,
        timestamp: parsed.created,
        previousTimestamp,
        envelope: envelopeOptions,
        body: text,
      });

      const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: body,
        RawBody: text,
        CommandBody: text,
        From: `webex:${parsed.personId}`,
        To: `webex:${parsed.roomId}`,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: parsed.roomType === "direct" ? "direct" : "channel",
        ConversationLabel: fromLabel,
        SenderName: parsed.personId,
        SenderId: parsed.personId,
        SenderUsername: parsed.personEmail,
        WasMentioned: parsed.roomType !== "direct" ? parsed.wasMentioned : undefined,
        Provider: "webex",
        Surface: "webex",
        MessageSid: parsed.messageId,
        MessageSidFull: parsed.messageId,
        OriginatingChannel: "webex",
        OriginatingTo: `webex:${parsed.roomId}`,
      });

      // Record session metadata
      await core.channel.session
        .recordSessionMetaFromInbound({
          storePath,
          sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
          ctx: ctxPayload,
        })
        .catch((err) => {
          log.warn(`failed to record session metadata: ${String(err)}`);
        });

      // Dispatch to agent
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload) => {
            const { sendMessageWebex } = await import("./send.js");
            const result = await sendMessageWebex({
              cfg,
              to: parsed.roomId,
              text: payload.text,
              mediaUrl: payload.mediaUrl,
            });
            if (!result.ok) {
              throw new Error(result.error || "failed to send message");
            }
          },
          onError: (err, info) => {
            log.error(`Webex ${info.kind} reply failed: ${String(err)}`);
          },
        },
      });

    } catch (error: any) {
      log.error(`webhook error: ${error?.message || String(error)}`);
    }
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "webex" });
  });

  // Start webhook server (if enabled)
  if (enableWebhook) {
    try {
      server = app.listen(webhookPort, () => {
        log.info(`webex webhook server listening on port ${webhookPort}`);
      });

    // Register webhook with Webex
    try {
      // Check if webhook already exists
      const existingWebhooks = await client.listWebhooks();
      const existing = existingWebhooks.items.find(
        (wh) => wh.targetUrl === webhookUrl && wh.resource === "messages",
      );

      if (existing) {
        webhookId = existing.id;
        log.info(`using existing webhook: ${webhookId}`);
      } else {
        // Create new webhook
        const webhook = await client.createWebhook({
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
      if (mode === "webhook") {
        return { shutdown: async () => {}, mode };
      }
      log.warn("continuing with polling mode only");
    }
  }

  // Start polling (if enabled)
  if (enablePolling) {
    log.info(`starting polling mode (interval: ${pollingIntervalMs / 1000}s)`);
    
    // Track last message time per room
    const lastMessageTimeByRoom = new Map<string, number>();
    
    const pollMessages = async () => {
      try {
        // First, get all rooms the bot is in
        const rooms = await client.listRooms({ sortBy: "lastactivity", max: 50 });
        log.debug(`polling: fetched ${rooms.items.length} rooms`);
        
        for (const room of rooms.items) {
          try {
            // Get last known time for this room (or use poll start time)
            const lastTime = lastMessageTimeByRoom.get(room.id) || pollStartTime;
            
            // List recent messages in this room
            const messages = await client.listMessages({
              roomId: room.id,
              max: 20,
            });

            // Process messages in reverse chronological order (oldest first)
            const items = messages.items || [];
            log.debug(`polling room ${room.id}: fetched ${items.length} messages, lastTime=${new Date(lastTime).toISOString()}`);
            
            for (const message of [...items].reverse()) {
              const messageTime = new Date(message.created).getTime();
              
              // Skip messages we've already processed
              if (messageTime <= lastTime) {
                log.debug(`skipping old message: ${messageTime} <= ${lastTime}`);
                continue;
              }

              // Skip bot's own messages
              if (message.personEmail === botEmail) {
                log.debug(`skipping bot's own message: ${message.id}`);
                lastMessageTimeByRoom.set(room.id, Math.max(lastTime, messageTime));
                continue;
              }

              log.info(`processing message ${message.id} from ${message.personEmail}: "${message.text}"`);

              // Parse the message (similar to webhook handler)
              // Include all necessary fields from the message for proper parsing
              const event = {
                resource: "messages",
                event: "created",
                data: { 
                  id: message.id,
                  roomId: message.roomId,
                  roomType: message.roomType,
                  personId: message.personId,
                  personEmail: message.personEmail,
                  created: message.created,
                  mentionedPeople: message.mentionedPeople,
                },
              };
              
              const parsed = parseWebexWebhookEvent(event, message, botId);

              // Check if we should process this message
              const requireMentionInGroups = webexCfg.groupPolicy === "mention" || 
                webexCfg.groupPolicy === "allowlist";
              
              if (!shouldProcessWebexMessage(parsed, requireMentionInGroups)) {
                log.debug(`skipping message: no mention in group`);
                lastMessageTimeByRoom.set(room.id, Math.max(lastTime, messageTime));
                continue;
              }

              // Clean up the text (remove bot mention if present)
              let text = parsed.text || parsed.markdown || "";
              if (parsed.isBotMentioned) {
                text = stripWebexBotMention(text, botName);
              }

              log.info(`received message from ${parsed.personEmail}: ${text.substring(0, 50)}...`);

              // Route message to agent using runtime dispatch
              const route = core.channel.routing.resolveAgentRoute({
                cfg,
                channel: "webex",
                accountId: DEFAULT_ACCOUNT_ID,
                peer: {
                  kind: parsed.roomType === "direct" ? "dm" : "group",
                  id: parsed.roomId,
                },
              });

              const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
                agentId: route.agentId,
              });

              const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
              const previousTimestamp = core.channel.session.readSessionUpdatedAt({
                storePath,
                sessionKey: route.sessionKey,
              });

              const fromLabel = parsed.personEmail || parsed.personId;
              const body = core.channel.reply.formatAgentEnvelope({
                channel: "Webex",
                from: fromLabel,
                timestamp: parsed.created,
                previousTimestamp,
                envelope: envelopeOptions,
                body: text,
              });

              const ctxPayload = core.channel.reply.finalizeInboundContext({
                Body: body,
                RawBody: text,
                CommandBody: text,
                From: `webex:${parsed.personId}`,
                To: `webex:${parsed.roomId}`,
                SessionKey: route.sessionKey,
                AccountId: route.accountId,
                ChatType: parsed.roomType === "direct" ? "direct" : "channel",
                ConversationLabel: fromLabel,
                SenderName: parsed.personId,
                SenderId: parsed.personId,
                SenderUsername: parsed.personEmail,
                WasMentioned: parsed.roomType !== "direct" ? parsed.wasMentioned : undefined,
                Provider: "webex",
                Surface: "webex",
                MessageSid: parsed.messageId,
                MessageSidFull: parsed.messageId,
                OriginatingChannel: "webex",
                OriginatingTo: `webex:${parsed.roomId}`,
              });

              // Record session metadata
              await core.channel.session
                .recordSessionMetaFromInbound({
                  storePath,
                  sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
                  ctx: ctxPayload,
                })
                .catch((err) => {
                  log.warn(`failed to record session metadata: ${String(err)}`);
                });

              // Dispatch to agent
              await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
                ctx: ctxPayload,
                cfg,
                dispatcherOptions: {
                  deliver: async (payload) => {
                    const { sendMessageWebex } = await import("./send.js");
                    const result = await sendMessageWebex({
                      cfg,
                      to: parsed.roomId,
                      text: payload.text,
                      mediaUrl: payload.mediaUrl,
                    });
                    if (!result.ok) {
                      throw new Error(result.error || "failed to send message");
                    }
                  },
                  onError: (err, info) => {
                    log.error(`Webex ${info.kind} reply failed: ${String(err)}`);
                  },
                },
              });

              // Update last message time for this room
              lastMessageTimeByRoom.set(room.id, Math.max(lastTime, messageTime));
            }
          } catch (roomError: any) {
            log.warn(`error polling room ${room.id}: ${roomError?.message || String(roomError)}`);
            if (roomError?.stack) {
              log.debug(`room error stack: ${roomError.stack}`);
            }
          }
        }
      } catch (error: any) {
        log.error(`polling error: ${error?.message || String(error)}`);
        log.error(`error details: ${JSON.stringify(error, null, 2)}`);
        if (error?.stack) {
          log.error(`error stack: ${error.stack}`);
        }
      }
    };

    // Initial poll
    void pollMessages();

    // Set up interval
    pollingInterval = setInterval(() => {
      void pollMessages();
    }, pollingIntervalMs);
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

    // Stop polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
      log.info("polling stopped");
    }

    // Delete webhook if we created it
    if (webhookId) {
      try {
        await client.deleteWebhook(webhookId);
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

  return { shutdown, mode };
}
