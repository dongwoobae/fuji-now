import handler from "vinext/server/fetch-handler";
import { runSnapshotJob } from "./snapshot-job";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSnapshotJob(env, new Date()));
  },
} satisfies ExportedHandler<Env>;
