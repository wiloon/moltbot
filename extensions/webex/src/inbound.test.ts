import { describe, expect, it } from "vitest";
import {
  parseWebexWebhookEvent,
  wasWebexBotMentioned,
  stripWebexBotMention,
  shouldProcessWebexMessage,
  isWebexBotMessage,
} from "./inbound.js";

describe("webex inbound", () => {
  describe("isWebexBotMessage", () => {
    it("identifies bot's own messages", () => {
      const event = {
        data: {
          personEmail: "bot@webex.bot",
        },
      } as any;

      expect(isWebexBotMessage(event, "bot@webex.bot")).toBe(true);
    });

    it("identifies non-bot messages", () => {
      const event = {
        data: {
          personEmail: "user@example.com",
        },
      } as any;

      expect(isWebexBotMessage(event, "bot@webex.bot")).toBe(false);
    });
  });

  describe("wasWebexBotMentioned", () => {
    it("detects bot mention", () => {
      const event = {
        data: {
          mentionedPeople: ["bot-id-123", "other-user-id"],
        },
      } as any;

      expect(wasWebexBotMentioned(event, "bot-id-123")).toBe(true);
    });

    it("returns false when bot not mentioned", () => {
      const event = {
        data: {
          mentionedPeople: ["other-user-id"],
        },
      } as any;

      expect(wasWebexBotMentioned(event, "bot-id-123")).toBe(false);
    });

    it("handles missing mentionedPeople", () => {
      const event = {
        data: {},
      } as any;

      expect(wasWebexBotMentioned(event, "bot-id-123")).toBe(false);
    });
  });

  describe("stripWebexBotMention", () => {
    it("removes bot mention from beginning", () => {
      const text = "@Moltbot hello world";
      expect(stripWebexBotMention(text, "Moltbot")).toBe("hello world");
    });

    it("handles case-insensitive mention", () => {
      const text = "@moltbot hello";
      expect(stripWebexBotMention(text, "Moltbot")).toBe("hello");
    });

    it("returns original text if no mention", () => {
      const text = "hello world";
      expect(stripWebexBotMention(text, "Moltbot")).toBe("hello world");
    });
  });

  describe("shouldProcessWebexMessage", () => {
    it("always processes direct messages", () => {
      const parsed = {
        roomType: "direct",
        isBotMentioned: false,
      } as any;

      expect(shouldProcessWebexMessage(parsed, true)).toBe(true);
    });

    it("processes group message with mention when required", () => {
      const parsed = {
        roomType: "group",
        isBotMentioned: true,
      } as any;

      expect(shouldProcessWebexMessage(parsed, true)).toBe(true);
    });

    it("skips group message without mention when required", () => {
      const parsed = {
        roomType: "group",
        isBotMentioned: false,
      } as any;

      expect(shouldProcessWebexMessage(parsed, true)).toBe(false);
    });

    it("processes group message without mention when not required", () => {
      const parsed = {
        roomType: "group",
        isBotMentioned: false,
      } as any;

      expect(shouldProcessWebexMessage(parsed, false)).toBe(true);
    });
  });

  describe("parseWebexWebhookEvent", () => {
    it("parses complete webhook event", () => {
      const event = {
        id: "event-123",
        data: {
          id: "msg-123",
          roomId: "room-123",
          roomType: "direct",
          personId: "person-123",
          personEmail: "user@example.com",
          mentionedPeople: ["bot-id"],
          created: "2026-01-29T00:00:00.000Z",
        },
      } as any;

      const fullMessage = {
        text: "Hello bot",
        markdown: "**Hello** bot",
        files: ["https://example.com/file.pdf"],
      };

      const parsed = parseWebexWebhookEvent(event, fullMessage, "bot-id");

      expect(parsed).toEqual({
        messageId: "msg-123",
        roomId: "room-123",
        roomType: "direct",
        personId: "person-123",
        personEmail: "user@example.com",
        text: "Hello bot",
        markdown: "**Hello** bot",
        files: ["https://example.com/file.pdf"],
        mentionedPeople: ["bot-id"],
        created: new Date("2026-01-29T00:00:00.000Z"),
        isBotMentioned: true,
      });
    });

    it("handles group room type", () => {
      const event = {
        data: {
          id: "msg-123",
          roomType: "group",
          personId: "person-123",
          personEmail: "user@example.com",
          mentionedPeople: [],
        },
      } as any;

      const parsed = parseWebexWebhookEvent(event, {}, "bot-id");

      expect(parsed.roomType).toBe("group");
      expect(parsed.isBotMentioned).toBe(false);
    });
  });
});
