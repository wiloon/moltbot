/**
 * Webex inbound message handling
 * Processes webhook events from Webex API
 */

export type WebexWebhookEvent = {
  id: string;
  name: string;
  targetUrl: string;
  resource: string;
  event: string;
  filter?: string;
  orgId?: string;
  createdBy: string;
  appId?: string;
  ownedBy: string;
  status: string;
  created: string;
  data: {
    id: string;
    roomId?: string;
    roomType?: string;
    personId?: string;
    personEmail?: string;
    mentionedPeople?: string[];
    created?: string;
  };
};

export type ParsedWebexMessage = {
  messageId: string;
  roomId?: string;
  roomType?: "direct" | "group";
  personId: string;
  personEmail: string;
  text?: string;
  markdown?: string;
  files?: string[];
  mentionedPeople?: string[];
  created: Date;
  isBotMentioned: boolean;
};

/**
 * Check if the message is from the bot itself
 */
export function isWebexBotMessage(event: WebexWebhookEvent, botEmail: string): boolean {
  return event.data.personEmail === botEmail;
}

/**
 * Check if bot was mentioned in the message
 */
export function wasWebexBotMentioned(event: WebexWebhookEvent, botId: string): boolean {
  const mentionedPeople = event.data.mentionedPeople || [];
  return mentionedPeople.includes(botId);
}

/**
 * Parse Webex webhook event into normalized message structure
 */
export function parseWebexWebhookEvent(
  event: WebexWebhookEvent,
  fullMessage: any,
  botId: string,
): ParsedWebexMessage {
  const isBotMentioned = wasWebexBotMentioned(event, botId);

  return {
    messageId: event.data.id,
    roomId: event.data.roomId,
    roomType: event.data.roomType === "direct" ? "direct" : "group",
    personId: event.data.personId || "",
    personEmail: event.data.personEmail || "",
    text: fullMessage?.text,
    markdown: fullMessage?.markdown,
    files: fullMessage?.files || [],
    mentionedPeople: event.data.mentionedPeople || [],
    created: new Date(event.data.created || Date.now()),
    isBotMentioned,
  };
}

/**
 * Strip mention tags from Webex message text
 * Webex doesn't wrap mentions in tags like Teams, but we may need to clean up
 * the bot mention from the text for processing
 */
export function stripWebexBotMention(text: string, botName: string): string {
  // Remove @BotName from the beginning of the message
  const pattern = new RegExp(`^@${botName}\\s*`, "i");
  return text.replace(pattern, "").trim();
}

/**
 * Determine if a message should be processed based on room type and mentions
 */
export function shouldProcessWebexMessage(
  parsed: ParsedWebexMessage,
  requireMentionInGroups: boolean,
): boolean {
  // Always process direct messages
  if (parsed.roomType === "direct") {
    return true;
  }

  // In group rooms, check mention requirement
  if (requireMentionInGroups) {
    return parsed.isBotMentioned;
  }

  return true;
}
