"use client";

import { ExternalLink, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = { videoId: string; lakeName: string; channelTitle: string };

export function LakePlayer({ videoId, lakeName, channelTitle }: Props) {
  const [open, setOpen] = useState(false);
  const toggled = useRef(false);
  const facadeRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = encodeURIComponent(videoId);

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
      {open ? (
        <div className="player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`}
            title={`${lakeName} 라이브 카메라`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          ref={facadeRef}
          type="button"
          className="player-facade"
          aria-label={`${lakeName} 라이브 보기 (${channelTitle})`}
          onClick={() => toggle(true)}
        >
          <Play size={28} aria-hidden />
          <strong>라이브 보기</strong>
          <span>{channelTitle}</span>
        </button>
      )}
      <div className="player-actions">
        {open && (
          <button ref={closeRef} type="button" aria-label={`${lakeName} 플레이어 닫기`} onClick={() => toggle(false)}>
            <X size={14} aria-hidden /> 닫기
          </button>
        )}
        <a
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${lakeName} 라이브를 YouTube에서 보기 (새 창)`}
        >
          YouTube에서 보기 <ExternalLink size={14} aria-hidden />
        </a>
      </div>
    </div>
  );
}
