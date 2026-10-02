import { ExternalLink } from "lucide-react";
import type { CameraCard } from "@/lib/lakes";
import type { CameraPart } from "@/lib/snapshot/schema";
import { cameraStateOf } from "@/lib/view";
import { CameraSwitcher } from "./camera-switcher";

type Props = { card: CameraCard; part: CameraPart | null };

const EMPTY_MESSAGE = {
  none: "이곳에는 YouTube 라이브 카메라가 없습니다. 지금 모습은 정지 이미지 카메라로 확인하세요.",
  unchecked: "방송 확인 전입니다.",
  offline: "지금 방송 중인 카메라가 없습니다.",
} as const;

export function CameraSlot({ card, part }: Props) {
  const state = cameraStateOf(card, part);

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
      {state.kind === "none" && card.photo && (
        <figure className="camera-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- 960px로 줄여 둔 정적 파일이다. vinext가 Workers에서 next/image 최적화를 하는지는 확인하지 않았다. */}
          <img src={card.photo.src} width={card.photo.width} height={card.photo.height} alt={card.photo.alt} loading="lazy" />
          <span className="camera-photo-badge">참고 사진 · 실시간 아님</span>
          <figcaption>
            {card.photo.takenOn} 촬영 ·{" "}
            <a href={card.photo.sourceUrl} target="_blank" rel="noopener noreferrer">{card.photo.credit}</a>
          </figcaption>
        </figure>
      )}
      <p>{EMPTY_MESSAGE[state.kind]}</p>
      {card.fallback && (
        <a href={card.fallback.url} target="_blank" rel="noopener noreferrer">
          {card.fallback.label} <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}
