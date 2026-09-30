import { SPOTS } from "@/lib/lakes";
import type { CameraPart } from "@/lib/snapshot/schema";
import { CameraSlot } from "./camera-slot";

type Props = { part: CameraPart | null; night: boolean };

export function SpotCard({ part, night }: Props) {
  return (
    <article className="panel lake-card" id="spots">
      <header className="lake-head">
        <h2>{SPOTS.name}</h2>
        {night && <span className="tag">야간 — 화면이 어두울 수 있음</span>}
      </header>
      <CameraSlot card={SPOTS} part={part} />
    </article>
  );
}
