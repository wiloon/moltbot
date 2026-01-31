import type { PluginRuntime } from "openclaw/plugin-sdk";

let webexRuntime: PluginRuntime | null = null;

export function setWebexRuntime(runtime: PluginRuntime): void {
  webexRuntime = runtime;
}

export function getWebexRuntime(): PluginRuntime {
  if (!webexRuntime) {
    throw new Error("Webex runtime not initialized");
  }
  return webexRuntime;
}
