import { ExternalLink } from "lucide-react";
import type { CameraCard } from "@/lib/lakes";
import type { CameraPart } from "@/lib/snapshot/schema";
import { cameraStateOf } from "@/lib/view";
import { CameraSwitcher } from "./camera-switcher";

type Props = { card: CameraCard; part: CameraPart | null };

export function CameraSlot({ card, part }: Props) {
  const state = cameraStateOf(part);

  if (state.kind === "live") {
    const cameras = state.cameras.map((camera) => ({
      videoId: camera.videoId,
      channelTitle: camera.channelTitle,
      label: card.candidates.find((candidate) => candidate.videoId === camera.videoId)?.label ?? camera.title,
    }));
    return <CameraSwitcher placeName={card.name} cameras={cameras} />;
  }

  return (
    <div className="camera-empty">
      <p>{state.kind === "unchecked" ? "방송 확인 전입니다." : "지금 방송 중인 카메라가 없습니다."}</p>
      {card.fallback && (
        <a href={card.fallback.url} target="_blank" rel="noopener noreferrer">
          {card.fallback.label} <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}
