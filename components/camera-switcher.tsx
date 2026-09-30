"use client";

import { ExternalLink, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CameraView = { videoId: string; label: string; channelTitle: string };

type Props = { placeName: string; cameras: CameraView[] };

export function CameraSwitcher({ placeName, cameras }: Props) {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const toggled = useRef(false);
  const facadeRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // 다음 스냅샷에서 방송 중인 카메라가 줄면 고른 번호가 범위를 벗어난다.
  const camera = cameras[Math.min(selected, cameras.length - 1)];
  const id = encodeURIComponent(camera.videoId);

  // 누른 버튼이 화면에서 사라지면 키보드 포커스가 문서 처음으로 돌아간다. 바뀐 자리의 버튼으로 옮긴다.
  useEffect(() => {
    if (!toggled.current) return;
    (open ? closeRef : facadeRef).current?.focus();
  }, [open]);

  const toggle = (next: boolean) => {
    toggled.current = true;
    setOpen(next);
  };

  return (
    <div>
      {cameras.length > 1 && (
        <div className="camera-tabs" role="group" aria-label={`${placeName} 카메라 선택`}>
          {cameras.map((view, index) => (
            <button
              key={view.videoId}
              type="button"
              aria-pressed={view.videoId === camera.videoId}
              aria-label={`카메라 ${index + 1}: ${view.label}`}
              onClick={() => setSelected(index)}
            >
              {index + 1}
            </button>
          ))}
          <span className="camera-label">{camera.label}</span>
        </div>
      )}
      {open ? (
        <div className="player">
          <iframe
            key={camera.videoId}
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`}
            title={`${placeName} ${camera.label} 라이브 카메라`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          ref={facadeRef}
          type="button"
          className="player-facade"
          aria-label={`${placeName} ${camera.label} 라이브 보기 (${camera.channelTitle})`}
          onClick={() => toggle(true)}
        >
          <Play size={28} aria-hidden />
          <strong>라이브 보기</strong>
          <span>{camera.label} · {camera.channelTitle}</span>
        </button>
      )}
      <div className="player-actions">
        {open && (
          <button ref={closeRef} type="button" aria-label={`${placeName} 플레이어 닫기`} onClick={() => toggle(false)}>
            <X size={14} aria-hidden /> 닫기
          </button>
        )}
        <a
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${placeName} ${camera.label} 라이브를 YouTube에서 보기 (새 창)`}
        >
          YouTube에서 보기 <ExternalLink size={14} aria-hidden />
        </a>
      </div>
    </div>
  );
}
