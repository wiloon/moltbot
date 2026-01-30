export type WebexCredentials = {
  botToken: string;
};

export function resolveWebexCredentials(
  cfg: unknown
): WebexCredentials | null {
  const webexCfg = (cfg as any)?.channels?.webex;
  
  // Check environment variable first
  const envToken = process.env.WEBEX_BOT_TOKEN?.trim();
  if (envToken) {
    return { botToken: envToken };
  }
  
  // Check config
  const configToken = webexCfg?.botToken?.trim();
  if (configToken) {
    return { botToken: configToken };
  }
  
  return null;
}
