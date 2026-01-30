---
summary: "Webex bot setup, capabilities, and configuration"
read_when:
  - Setting up Webex channel
  - Troubleshooting Webex connection
---
# Webex (plugin)

Status: DMs and spaces supported.

## Plugin required
Webex ships as a plugin and is not bundled with core.

Install via CLI:
```bash
moltbot plugins install @moltbot/webex
```

Local checkout:
```bash
moltbot plugins install ./extensions/webex
```

## Quick setup
1) Create a Webex Bot at https://developer.webex.com/my-apps
2) Click "Create a New App" → "Create a Bot"
3) Fill in Bot Name, Username, and Icon (optional)
4) Copy the Bot Access Token
5) Configure Moltbot with the token
6) Start the gateway

Minimal config:
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "webhook",  // or "polling" or "both"
      botToken: "YOUR_BOT_ACCESS_TOKEN"
    }
  }
}
```

Or set environment variable:
```bash
export WEBEX_BOT_TOKEN="YOUR_BOT_ACCESS_TOKEN"
moltbot gateway
```

### Receiving Messages: Webhook vs Polling

Moltbot supports **three modes** for receiving messages from Webex:

| Mode | Description | Use Case | Requires Public URL |
|------|-------------|----------|---------------------|
| `webhook` | Webex pushes messages to your server | Best performance, real-time | ✅ Yes |
| `polling` | Moltbot polls Webex API for new messages | Corporate firewalls, internal networks | ❌ No |
| `both` | Run webhook + polling simultaneously | Maximum reliability | ✅ Yes (for webhook) |

**Recommendation**:
- 📍 **Internal/corporate network** (e.g., Cisco employees): Use `"mode": "polling"`
- 🌐 **Public server with domain**: Use `"mode": "webhook"`
- 💪 **Maximum uptime**: Use `"mode": "both"`

## Creating a Webex Bot

### Step 1: Developer Portal
1. Visit https://developer.webex.com/my-apps
2. Sign in with your Webex account
3. Click "Create a New App"
4. Select "Create a Bot"

### Step 2: Bot Configuration
- **Bot Name**: Moltbot (or your preferred name)
- **Bot Username**: moltbot-assistant (must be unique)
- **Icon**: Upload a logo (optional)
- **App Hub Description**: AI assistant bot (optional)

### Step 3: Get Bot Access Token
After creating the bot, you'll see:
- **Bot Access Token**: Long string starting with `Y2lzY29zcGFyazovL...`
- **Bot ID**: Unique identifier for your bot
- **Bot Username**: The username you chose

⚠️ **Important**: Save the Bot Access Token immediately. This token does not expire.

## Access control

### DM access
- Default: `pairing` (users must be approved first)
- `channels.webex.allowFrom` accepts Webex person IDs or emails
- Use `moltbot pair webex <personId|email>` to approve users

### Space/Room access
- Default: `allowlist` (only approved senders in spaces)
- `channels.webex.groupPolicy` controls space access:
  - `allowlist`: Only approved senders (default)
  - `mention`: Anyone can trigger if they @mention the bot
  - `open`: Anyone in the space can trigger
  - `disabled`: No space messages processed
- `channels.webex.groupAllowFrom` controls senders in spaces

## Webhook setup (webhook mode only)

**Only required if using `"mode": "webhook"` or `"mode": "both"`**

Webex requires a public HTTPS endpoint to receive messages. Configure:

```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "webhook",  // webhook requires public URL
      botToken: "YOUR_TOKEN",
      webhook: {
        port: 3979,
        path: "/webex/webhook",
        url: "https://your-domain.com/webex/webhook"
      }
    }
  }
}
```

### Webhook Requirements
- **HTTPS**: Webex only sends to HTTPS URLs
- **Public**: Must be accessible from the internet
- **Fast Response**: Respond with 200 OK within 10 seconds

### Webhook URL Options
1. **Public Server**: Deploy Moltbot on a server with a public IP
2. **ngrok**: Use ngrok for local development
   ```bash
   ngrok http 3979
   # Use the https URL: https://abc123.ngrok.io/webex/webhook
   ```
3. **Cloudflare Tunnel**: Use cloudflared for production tunneling
4. **VPS**: Deploy on a VPS (AWS, DigitalOcean, etc.)

## Polling setup (polling mode only)

**Only required if using `"mode": "polling"` or `"mode": "both"`**

Polling mode fetches messages from Webex API at regular intervals. No public URL required!

**Minimal config (polling only):**
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "polling",
      botToken: "YOUR_TOKEN",
      polling: {
        intervalSeconds: 5  // default, can be omitted
      }
    }
  }
}
```

**Note:** When using `mode: "polling"`, you can completely omit the `webhook` section.

### Polling Considerations
- **Latency**: ~5 second delay (configurable)
- **Rate Limits**: Webex API has rate limits (120 req/min)
- **Best For**: Corporate networks, firewalls, testing
- **Recommended Interval**: 5-10 seconds
- **Config Cleanup**: No `webhook` section needed!

## Configuration examples by mode

### Polling mode (recommended for internal networks)
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "polling",
      botToken: "YOUR_BOT_ACCESS_TOKEN",
      dmPolicy: "allowlist",
      allowFrom: ["user@example.com"],
      polling: {
        intervalSeconds: 5  // optional, defaults to 5
      }
    }
  }
}
```

### Webhook mode (requires public URL)
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "webhook",
      botToken: "YOUR_BOT_ACCESS_TOKEN",
      dmPolicy: "allowlist",
      allowFrom: ["user@example.com"],
      webhook: {
        port: 3979,
        path: "/webex/webhook",
        url: "https://your-domain.com/webex/webhook"
      }
    }
  }
}
```

### Both modes (maximum reliability)
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "both",
      botToken: "YOUR_BOT_ACCESS_TOKEN",
      dmPolicy: "allowlist",
      allowFrom: ["user@example.com"],
      webhook: {
        port: 3979,
        path: "/webex/webhook",
        url: "https://your-domain.com/webex/webhook"
      },
      polling: {
        intervalSeconds: 10  // slower when webhook is primary
      }
    }
  }
}
```

### Full configuration (all options)
```json5
{
  channels: {
    webex: {
      enabled: true,
      mode: "polling",  // or "webhook" or "both"
      botToken: "YOUR_BOT_ACCESS_TOKEN",
      
      // DM access control
      dmPolicy: "pairing",  // or "allowlist", "open"
      allowFrom: [
        "user@example.com",
        "Y2lzY29zcGFyazovL3VzL1BFT1BMRS8xMjM0NTY3OA=="
      ],
      
      // Space access control
      groupPolicy: "mention",  // or "allowlist", "open", "disabled"
      groupAllowFrom: [
        "admin@example.com"
      ],
      
      // Webhook (omit if mode = "polling")
      webhook: {
        port: 3979,
        path: "/webex/webhook",
        url: "https://your-domain.com/webex/webhook"
      },
      
      // Polling (omit if mode = "webhook")
      polling: {
        intervalSeconds: 5
      }
    }
  }
}
```

## How it works

### Message Flow (Webhook Mode)
1. User sends a message in Webex (DM or space)
2. Webex API sends webhook notification to your server
3. Moltbot fetches full message details
4. Message is processed by the agent
5. Agent response is sent back to Webex

### Message Flow (Polling Mode)
1. User sends a message in Webex (DM or space)
2. Message is stored on Webex servers
3. Moltbot polls Webex API every N seconds
4. New messages are fetched and processed
5. Agent response is sent back to Webex

### Bot Mention Requirement
- **DMs**: Bot always receives messages
- **Spaces**: Bot only receives messages when @mentioned (unless groupPolicy is "open")

### First Contact Requirement
⚠️ **Important**: Webex bots cannot initiate first contact with users.

- Users must message the bot first before the bot can send them messages
- After the first message, the bot can send messages anytime (including scheduled reminders)
- This is a Webex platform limitation for privacy/anti-spam

### Supported Features
- ✅ Text messages (plain text and Markdown)
- ✅ File attachments (via URL)
- ✅ Direct messages (1:1)
- ✅ Group spaces
- ✅ @mentions
- ❌ Reactions (not supported by Webex API)
- ❌ Threads (Webex doesn't have threads)
- ❌ Polls (not implemented yet)

## Troubleshooting

### Check logs
```bash
moltbot gateway
# Look for Webex-related messages
```

### Verify token
```bash
moltbot channels status webex --deep
```

### Test probe
```bash
moltbot channels probe webex
```

### Common issues

#### Bot not receiving messages
- ✅ Check that bot is added to the space
- ✅ Verify users are @mentioning the bot in spaces
- ✅ Check webhook URL is publicly accessible (HTTPS)
- ✅ Confirm webhook is registered with Webex

#### "No credentials configured"
- Set `channels.webex.botToken` in config
- Or set `WEBEX_BOT_TOKEN` environment variable

#### "Webhook registration failed"
- Verify `channels.webex.webhook.url` is correct
- Ensure URL is HTTPS and publicly accessible
- Check firewall/network settings
- Try manually registering webhook at https://developer.webex.com/docs/api/v1/webhooks

#### "Bot cannot send to user"
- User must message the bot first
- Cannot initiate contact with new users
- Check user is in `allowFrom` if dmPolicy is "allowlist"

### Webhook debugging
Check webhook status:
```bash
# View webhook logs
tail -f ~/.moltbot/logs/gateway.log | grep webex

# Test webhook endpoint
curl -X POST https://your-domain.com/webex/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Rate limits
Webex API limits:
- **120 requests per minute** per bot
- Moltbot handles rate limiting automatically
- Large message volumes may be delayed

## Security notes

- **Bot tokens do not expire** - store securely
- Default `dmPolicy: "pairing"` requires user approval
- Use `allowlist` for production environments
- Never commit tokens to git
- Consider using environment variables for secrets

## Pairing workflow

When `dmPolicy: "pairing"`:

1. User messages bot → request logged
2. Admin approves:
   ```bash
   moltbot pair webex user@example.com
   ```
3. User receives approval notification
4. User can now interact with bot

View pending requests:
```bash
moltbot pairing list
```

## Tips

### Development
- Use ngrok for local development
- Set `WEBEX_BOT_TOKEN` environment variable
- Enable debug logging: `MOLTBOT_LOG_LEVEL=debug`

### Production
- Use a VPS or cloud server with public IP
- Configure proper firewall rules
- Use process manager (systemd, PM2, etc.)
- Monitor webhook health endpoint

### Testing
- Create a test space for bot testing
- Add bot to space and @mention it
- Use Webex developer portal to monitor API calls

## Related documentation

- [Configuration](/ configuration)
- [Gateway](/gateway/getting-started)
- [Security](/gateway/security)
- [Pairing](/gateway/pairing)
- [Channels overview](/channels)

## Webex resources

- [Webex Developer Portal](https://developer.webex.com/)
- [Webex Bot Documentation](https://developer.webex.com/docs/bots)
- [Webex API Reference](https://developer.webex.com/docs/api/v1/messages)
- [Webhooks Guide](https://developer.webex.com/docs/api/guides/webhooks)
