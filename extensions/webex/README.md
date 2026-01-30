# Webex Plugin for Moltbot

Enterprise messaging integration for Cisco Webex Teams.

## Installation

```bash
moltbot plugins install @moltbot/webex
```

Local development:
```bash
moltbot plugins install ./extensions/webex
```

## Quick Setup

1. Create a Webex Bot at https://developer.webex.com/my-apps
2. Get the Bot Access Token
3. Configure Moltbot:

**Polling mode (no public URL needed):**
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "polling",
      botToken: "YOUR_BOT_ACCESS_TOKEN"
    }
  }
}
```

**Webhook mode (requires public URL):**
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "webhook",
      botToken: "YOUR_BOT_ACCESS_TOKEN",
      webhook: {
        url: "https://your-domain.com/webex/webhook"
      }
    }
  }
}
```

Or use environment variable:
```bash
export WEBEX_BOT_TOKEN="YOUR_TOKEN"
```

## Features

- ✅ Direct messages (1:1)
- ✅ Group spaces
- ✅ File attachments
- ✅ Markdown formatting
- ✅ @mentions
- ✅ DM pairing and allowlists
- ✅ **Polling mode** (no public URL needed) or **Webhook mode** (real-time)
- ✅ Corporate firewall friendly

## Documentation

Full documentation: https://docs.molt.bot/channels/webex

## Development

```bash
# Run tests
pnpm test extensions/webex

# Lint
pnpm lint extensions/webex

# Build
pnpm build
```

## License

MIT (same as Moltbot)
