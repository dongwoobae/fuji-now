import handler from "vinext/server/fetch-handler";
import { isRecordTick, runRecordJob } from "./record-job";
import { runSnapshotJob } from "./snapshot-job";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSnapshotJob(env, new Date()));
    // 기록은 스냅샷과 따로 돈다. Neon이 실패해도 화면용 스냅샷은 쓰인다.
    if (isRecordTick(controller.scheduledTime)) ctx.waitUntil(runRecordJob(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
