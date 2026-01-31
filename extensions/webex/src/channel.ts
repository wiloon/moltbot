import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk";
import { webexOutbound } from "./outbound.js";
import { probeWebex } from "./probe.js";
import { resolveWebexCredentials } from "./token.js";
import { sendMessageWebex, listWebexRooms } from "./send.js";
import { monitorWebexProvider } from "./monitor.js";
import { webexOnboardingAdapter } from "./onboarding.js";

type ResolvedWebexAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  botToken?: string;
};

const meta = {
  id: "webex",
  label: "Webex",
  selectionLabel: "Cisco Webex Teams",
  docsPath: "/channels/webex",
  docsLabel: "webex",
  blurb: "Enterprise messaging; bot integration.",
  aliases: ["webex-teams", "cisco-webex"],
  order: 70,
} as const;

function normalizeWebexTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  
  // Remove prefixes
  const withoutPrefix = trimmed
    .replace(/^webex:/i, "")
    .replace(/^(person|room|user):/i, "")
    .trim();
  
  return withoutPrefix || null;
}

export const webexPlugin: ChannelPlugin<ResolvedWebexAccount> = {
  id: "webex",
  
  meta: {
    ...meta,
  },

  onboarding: webexOnboardingAdapter,

  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    polls: false,
  },

  pairing: {
    idLabel: "webexPersonId",
    normalizeAllowEntry: (entry) => entry.replace(/^(webex|person|user):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      await sendMessageWebex({
        cfg,
        to: id,
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },

  agentPrompt: {
    messageToolHints: () => [
      "- Webex targeting: use person email (user@example.com), person ID, or room ID. Prefix with 'person:' or 'room:' if needed.",
    ],
  },

  reload: { configPrefixes: ["channels.webex"] },

  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg) => {
      const webexCfg = (cfg as any)?.channels?.webex;
      const credentials = resolveWebexCredentials(cfg);
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: webexCfg?.enabled !== false,
        configured: Boolean(credentials?.botToken),
        botToken: credentials?.botToken,
      };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...cfg,
      channels: {
        ...(cfg as any).channels,
        webex: { ...(cfg as any).channels?.webex, enabled },
      },
    }),
    deleteAccount: ({ cfg }) => {
      const next = { ...cfg } as OpenClawConfig;
      const nextChannels = { ...cfg.channels };
      delete (nextChannels as any).webex;
      if (Object.keys(nextChannels).length > 0) {
        next.channels = nextChannels;
      } else {
        delete next.channels;
      }
      return next;
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg }) => 
      (cfg as any).channels?.webex?.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) => 
      allowFrom.map(e => String(e).trim().toLowerCase()).filter(Boolean),
  },

  security: {
    resolveDmPolicy: ({ cfg }) => ({
      policy: (cfg as any).channels?.webex?.dmPolicy ?? "pairing",
      allowFrom: (cfg as any).channels?.webex?.allowFrom ?? [],
      allowFromPath: "channels.webex.",
      approveHint: "Use: moltbot pair webex <personId|email>",
      normalizeEntry: (raw) => raw.replace(/^(webex|person|user):/i, ""),
    }),
    collectWarnings: ({ cfg }) => {
      const defaultGroupPolicy = (cfg as any).channels?.defaults?.groupPolicy;
      const groupPolicy = (cfg as any).channels?.webex?.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Webex groups: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.webex.groupPolicy="allowlist" + channels.webex.groupAllowFrom to restrict senders.`,
      ];
    },
  },

  groups: {
    resolveRequireMention: ({ cfg }) => {
      const groupPolicy = (cfg as any).channels?.webex?.groupPolicy ?? "allowlist";
      return groupPolicy === "mention" || groupPolicy === "allowlist";
    },
    resolveToolPolicy: ({ cfg }) => {
      const groupPolicy = (cfg as any).channels?.webex?.groupPolicy ?? "allowlist";
      if (groupPolicy === "disabled") return "disabled";
      if (groupPolicy === "open") return "open";
      return "allowlist";
    },
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        webex: {
          ...(cfg as any).channels?.webex,
          enabled: true,
        },
      },
    }),
  },

  messaging: {
    normalizeTarget: normalizeWebexTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^(person|room):/i.test(trimmed)) return true;
        if (trimmed.includes("@")) return true; // email
        if (trimmed.startsWith("Y2lzY29zcGFyazovL3VzL")) return true; // Webex Base64 ID
        return false;
      },
      hint: "<personEmail|personId|roomId>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async ({ cfg, query, limit }) => {
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();
      for (const entry of (cfg as any).channels?.webex?.allowFrom ?? []) {
        const trimmed = String(entry).trim();
        if (trimmed && trimmed !== "*") ids.add(trimmed);
      }
      return Array.from(ids)
        .map((raw) => normalizeWebexTarget(raw) ?? raw)
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
    },
    listGroups: async ({ cfg, query, limit }) => {
      try {
        const rooms = await listWebexRooms(cfg);
        const q = query?.trim().toLowerCase() || "";
        return rooms
          .filter((room: any) => {
            if (q) {
              const title = room.title?.toLowerCase() || "";
              return title.includes(q);
            }
            return true;
          })
          .slice(0, limit && limit > 0 ? limit : undefined)
          .map((room: any) => ({ kind: "group", id: room.id, name: room.title }) as const);
      } catch {
        return [];
      }
    },
  },

  resolver: {
    resolveTargets: async ({ inputs }) => {
      const results = inputs.map((input) => ({
        input,
        resolved: false,
        id: undefined as string | undefined,
        name: undefined as string | undefined,
        note: undefined as string | undefined,
      }));

      results.forEach((entry) => {
        const trimmed = entry.input.trim();
        if (!trimmed) {
          entry.note = "empty input";
          return;
        }

        const normalized = normalizeWebexTarget(trimmed);
        if (normalized) {
          entry.resolved = true;
          entry.id = normalized;
        } else {
          entry.note = "invalid target format";
        }
      });

      return results;
    },
  },

  outbound: webexOutbound,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
    }),
    probeAccount: async ({ cfg }) => {
      const probe = await probeWebex((cfg as any).channels?.webex);
      return {
        ok: probe.ok,
        error: probe.error,
        botInfo: probe.botInfo,
      };
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      probe,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      ctx.log?.info("starting webex provider");
      return monitorWebexProvider({
        cfg: ctx.cfg,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
