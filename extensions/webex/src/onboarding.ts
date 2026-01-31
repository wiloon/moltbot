import type {
  ChannelOnboardingAdapter,
  OpenClawConfig,
  DmPolicy,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
} from "openclaw/plugin-sdk";
import { resolveWebexCredentials } from "./token.js";

const channel = "webex" as const;

function setWebexDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      webex: {
        ...(cfg as any).channels?.webex,
        dmPolicy,
      },
    },
  };
}

function setWebexBotToken(cfg: OpenClawConfig, botToken: string): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      webex: {
        ...(cfg as any).channels?.webex,
        botToken,
      },
    },
  };
}

async function noteWebexCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Create a Webex Bot at https://developer.webex.com/my-apps",
      "2) Click 'Create a New App' → 'Create a Bot'",
      "3) Fill in Bot Name, Username, Icon (optional)",
      "4) Copy the 'Bot Access Token' (long string starting with 'Y2lzY29zcGFyazovL...')",
      "Tip: you can also set WEBEX_BOT_TOKEN environment variable.",
      `Docs: ${formatDocsLink("/channels/webex", "webex")}`,
    ].join("\n"),
    "Webex credentials",
  );
}

async function promptWebexBotToken(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  await noteWebexCredentialHelp(params.prompter);

  const token = await params.prompter.text({
    message: "Webex Bot Access Token",
    placeholder: "Y2lzY29zcGFyazovL...",
    validate: (value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return "Bot token required";
      if (trimmed.length < 20) return "Token looks too short";
      return undefined;
    },
  });

  return setWebexBotToken(params.cfg, String(token).trim());
}

export const webexOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  
  getStatus: async (ctx) => {
    const creds = resolveWebexCredentials(ctx.cfg);
    const configured = Boolean(creds?.botToken);
    const dmPolicy = (ctx.cfg as any).channels?.webex?.dmPolicy ?? "pairing";

    const statusLines: string[] = [];
    if (!configured) {
      statusLines.push("❌ Bot token not configured");
    } else {
      statusLines.push("✅ Bot token configured");
    }
    statusLines.push(`DM policy: ${dmPolicy}`);

    return {
      channel,
      configured,
      statusLines,
    };
  },

  configure: async (ctx) => {
    let cfg = ctx.cfg;

    // Step 1: Bot Token
    const creds = resolveWebexCredentials(cfg);
    if (!creds?.botToken) {
      cfg = await promptWebexBotToken({ cfg, prompter: ctx.prompter });
    } else {
      const shouldUpdate = await ctx.prompter.confirm({
        message: "Bot token already configured. Update it?",
        initialValue: false,
      });
      if (shouldUpdate) {
        cfg = await promptWebexBotToken({ cfg, prompter: ctx.prompter });
      }
    }

    // Step 2: DM Policy
    await ctx.prompter.note(
      [
        "Configure who can DM the bot:",
        "- pairing: Users must be approved first (recommended)",
        "- allowlist: Only specified users can DM",
        "- open: Anyone can DM the bot",
      ].join("\n"),
      "DM Access Control",
    );

    const dmPolicy = await ctx.prompter.select<DmPolicy>({
      message: "DM policy",
      options: [
        { value: "pairing", label: "Pairing (recommended)" },
        { value: "allowlist", label: "Allowlist" },
        { value: "open", label: "Open" },
      ],
      initialValue: (cfg as any).channels?.webex?.dmPolicy ?? "pairing",
    });

    cfg = setWebexDmPolicy(cfg, dmPolicy);

    // Step 3: Enable channel
    cfg = {
      ...cfg,
      channels: {
        ...cfg.channels,
        webex: {
          ...(cfg as any).channels?.webex,
          enabled: true,
        },
      },
    };

    return {
      cfg,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  },
};
