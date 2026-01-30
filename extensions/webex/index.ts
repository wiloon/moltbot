import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { webexPlugin } from "./src/channel.js";
import { setWebexRuntime } from "./src/runtime.js";

const plugin = {
  id: "webex",
  name: "Webex",
  description: "Webex Bot channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    setWebexRuntime(api.runtime);
    api.registerChannel({ plugin: webexPlugin });
  },
};

export default plugin;
