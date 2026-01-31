import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { webexPlugin } from "./src/channel.js";
import { setWebexRuntime } from "./src/runtime.js";

const plugin = {
  id: "webex",
  name: "Webex",
  description: "Webex Bot channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWebexRuntime(api.runtime);
    api.registerChannel({ plugin: webexPlugin });
  },
};

export default plugin;
