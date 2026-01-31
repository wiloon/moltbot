import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { monitorWebexProvider } from "./monitor.js";
import { WebexClient } from "./api.js";
import * as runtime from "./runtime.js";

// Mock the WebexClient class
vi.mock("./api.js", () => ({
  WebexClient: vi.fn(),
}));

// Mock runtime module
vi.mock("./runtime.js", () => ({
  getWebexRuntime: vi.fn(),
}));

// Mock token resolution
vi.mock("./token.js", () => ({
  resolveWebexCredentials: () => ({ botToken: "test-token" }),
}));

// Mock probe
vi.mock("./probe.js", () => ({
  probeWebex: vi.fn().mockResolvedValue({
    id: "bot-id-123",
    displayName: "Test Bot",
    emails: ["testbot@webex.bot"],
  }),
}));

describe("monitorWebexProvider - polling mode", () => {
  let mockRuntime: RuntimeEnv;
  let mockConfig: OpenClawConfig;
  let mockClient: any;
  let onMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Setup mock runtime with onMessage spy
    onMessageSpy = vi.fn().mockResolvedValue(undefined);
    mockRuntime = {
      logging: {
        getChildLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      },
      channel: {
        events: {
          onMessage: onMessageSpy,
        },
      },
    } as any;

    // Setup mock config
    mockConfig = {
      channels: {
        webex: {
          enabled: true,
          mode: "polling",
          botToken: "test-token",
          dmPolicy: "allowlist",
          allowFrom: ["user@example.com"],
          polling: {
            intervalSeconds: 5,
          },
        },
      },
    } as OpenClawConfig;

    // Setup mock WebexClient
    mockClient = {
      listRooms: vi.fn().mockResolvedValue({
        items: [
          {
            id: "room-123",
            title: "Test Room",
            type: "direct",
            lastActivity: new Date().toISOString(),
          },
        ],
      }),
      listMessages: vi.fn().mockResolvedValue({
        items: [],
      }),
    };

    // Mock WebexClient constructor to return our mock
    (WebexClient as any).mockImplementation(() => mockClient);

    // Mock getWebexRuntime
    vi.mocked(runtime.getWebexRuntime).mockReturnValue({
      logging: {
        getChildLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      },
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should include roomType and all required fields in event data for direct messages", async () => {
    // Arrange: Mock a direct message
    const testMessage = {
      id: "msg-123",
      roomId: "room-123",
      roomType: "direct",
      personId: "person-123",
      personEmail: "user@example.com",
      text: "Hello bot",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listMessages.mockResolvedValueOnce({
      items: [testMessage],
    });

    // Act: Start monitor and wait for polling cycle
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: mockRuntime,
    });

    // Wait for first poll to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Verify onMessage was called with correct context
    expect(onMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: mockConfig,
        runtime: mockRuntime,
        context: expect.objectContaining({
          channel: "webex",
          from: "user@example.com",
          to: "room-123",
          text: "Hello bot",
          messageId: "msg-123",
          isDirectMessage: true,
        }),
      }),
    );

    // Cleanup
    await shutdown();
  });

  it("should call runtime.channel.events.onMessage when processing messages", async () => {
    // Arrange: Mock a message
    const testMessage = {
      id: "msg-456",
      roomId: "room-123",
      roomType: "direct",
      personId: "person-456",
      personEmail: "user@example.com",
      text: "Test message",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listMessages.mockResolvedValueOnce({
      items: [testMessage],
    });

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Verify onMessage was called
    expect(onMessageSpy).toHaveBeenCalled();
    expect(onMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          text: "Test message",
          messageId: "msg-456",
        }),
      }),
    );

    await shutdown();
  });

  it("should process direct messages without mention requirement", async () => {
    // Arrange: Direct message without bot mention
    const directMessage = {
      id: "msg-direct",
      roomId: "room-direct",
      roomType: "direct",
      personId: "person-123",
      personEmail: "user@example.com",
      text: "Hello",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listRooms.mockResolvedValueOnce({
      items: [
        {
          id: "room-direct",
          title: "Direct Chat",
          type: "direct",
        },
      ],
    });

    mockClient.listMessages.mockResolvedValueOnce({
      items: [directMessage],
    });

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Direct message should be processed even without mention
    expect(onMessageSpy).toHaveBeenCalled();
    expect(onMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          isDirectMessage: true,
          text: "Hello",
        }),
      }),
    );

    await shutdown();
  });

  it("should skip group messages without bot mention when groupPolicy is mention", async () => {
    // Arrange: Group message without bot mention
    const groupMessage = {
      id: "msg-group",
      roomId: "room-group",
      roomType: "group",
      personId: "person-123",
      personEmail: "user@example.com",
      text: "Hello everyone",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listRooms.mockResolvedValueOnce({
      items: [
        {
          id: "room-group",
          title: "Group Chat",
          type: "group",
        },
      ],
    });

    mockClient.listMessages.mockResolvedValueOnce({
      items: [groupMessage],
    });

    // Update config to require mentions in groups
    const groupConfig = {
      ...mockConfig,
      channels: {
        ...mockConfig.channels,
        webex: {
          ...mockConfig.channels!.webex,
          groupPolicy: "mention" as const,
        },
      },
    };

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: groupConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Group message without mention should NOT trigger onMessage
    expect(onMessageSpy).not.toHaveBeenCalled();

    await shutdown();
  });

  it("should process group messages with bot mention when groupPolicy is mention", async () => {
    // Arrange: Group message with bot mention
    const groupMessage = {
      id: "msg-group-mention",
      roomId: "room-group",
      roomType: "group",
      personId: "person-123",
      personEmail: "user@example.com",
      text: "Hello bot",
      created: new Date().toISOString(),
      mentionedPeople: ["bot-id-123"],
    };

    mockClient.listRooms.mockResolvedValueOnce({
      items: [
        {
          id: "room-group",
          title: "Group Chat",
          type: "group",
        },
      ],
    });

    mockClient.listMessages.mockResolvedValueOnce({
      items: [groupMessage],
    });

    // Update config to require mentions in groups
    const groupConfig = {
      ...mockConfig,
      channels: {
        ...mockConfig.channels,
        webex: {
          ...mockConfig.channels!.webex,
          groupPolicy: "mention" as const,
        },
      },
    };

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: groupConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Group message with mention SHOULD trigger onMessage
    expect(onMessageSpy).toHaveBeenCalled();
    expect(onMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          isDirectMessage: false,
          text: "Hello bot",
        }),
      }),
    );

    await shutdown();
  });

  it("should skip bot's own messages", async () => {
    // Arrange: Message from bot itself
    const botMessage = {
      id: "msg-bot",
      roomId: "room-123",
      roomType: "direct",
      personId: "bot-id-123",
      personEmail: "testbot@webex.bot",
      text: "I'm a bot",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listMessages.mockResolvedValueOnce({
      items: [botMessage],
    });

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Bot's own message should NOT trigger onMessage
    expect(onMessageSpy).not.toHaveBeenCalled();

    await shutdown();
  });

  it("should not crash when runtime.channel.events is undefined", async () => {
    // Arrange: Runtime without channel.events
    const incompleteRuntime = {} as RuntimeEnv;

    const testMessage = {
      id: "msg-test",
      roomId: "room-123",
      roomType: "direct",
      personId: "person-123",
      personEmail: "user@example.com",
      text: "Test",
      created: new Date().toISOString(),
      mentionedPeople: [],
    };

    mockClient.listMessages.mockResolvedValueOnce({
      items: [testMessage],
    });

    // Act & Assert: Should not throw
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: incompleteRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should handle gracefully without crashing
    expect(onMessageSpy).not.toHaveBeenCalled();

    await shutdown();
  });

  it("should include all event data fields when constructing webhook event", async () => {
    // Arrange: Message with all fields
    const completeMessage = {
      id: "msg-complete",
      roomId: "room-complete",
      roomType: "direct",
      personId: "person-complete",
      personEmail: "complete@example.com",
      text: "Complete message",
      markdown: "**Complete** message",
      created: new Date().toISOString(),
      mentionedPeople: ["someone"],
      files: ["file1.pdf"],
    };

    mockClient.listMessages.mockResolvedValueOnce({
      items: [completeMessage],
    });

    // Act
    const { shutdown } = await monitorWebexProvider({
      cfg: mockConfig,
      runtime: mockRuntime,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: All fields should be included in context
    expect(onMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          channel: "webex",
          from: "complete@example.com",
          to: "room-complete",
          text: "Complete message",
          messageId: "msg-complete",
          isDirectMessage: true,
          files: ["file1.pdf"],
        }),
      }),
    );

    await shutdown();
  });
});
