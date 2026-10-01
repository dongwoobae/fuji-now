import handler from "vinext/server/fetch-handler";
import { RECORD_CRON, runRecordJob } from "./record-job";
import { runSnapshotJob } from "./snapshot-job";
import { runStatsJob } from "./stats-job";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  // 예약 작업 CPU 한도는 실행마다 따로 센다. 기록·통계를 스냅샷과 다른 실행으로 뗀 이유는 설계 문서 "예약 작업 CPU" 절에 있다.
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === RECORD_CRON) {
      const at = new Date(controller.scheduledTime);
      ctx.waitUntil(runRecordJob(env, at));
      ctx.waitUntil(runStatsJob(env, at));
      return;
    }
    ctx.waitUntil(runSnapshotJob(env, new Date()));
  },
} satisfies ExportedHandler<Env>;
