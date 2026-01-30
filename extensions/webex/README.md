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

```json5
{
  channels: {
    webex: {
      enabled: true,
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
- ✅ Webhook-based message receiving

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
