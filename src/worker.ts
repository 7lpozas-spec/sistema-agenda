import { createApp, tareasProgramadas } from "./app";
import { AgendaLock, CaptureSession } from "./locks";

const app = createApp();

export { AgendaLock, CaptureSession };

export default {
  fetch: app.fetch,
  scheduled(_controlador: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(tareasProgramadas(env));
  },
};
