"use client";

import { ExternalLink, Play, X } from "lucide-react";
import { useState } from "react";

type Props = { videoId: string; lakeName: string; channelTitle: string };

export function LakePlayer({ videoId, lakeName, channelTitle }: Props) {
  const [open, setOpen] = useState(false);
  const id = encodeURIComponent(videoId);

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
        <button type="button" className="player-facade" onClick={() => setOpen(true)}>
          <Play size={28} aria-hidden />
          <strong>라이브 보기</strong>
          <span>{channelTitle}</span>
        </button>
      )}
      <div className="player-actions">
        {open && (
          <button type="button" onClick={() => setOpen(false)}>
            <X size={14} aria-hidden /> 닫기
          </button>
        )}
        <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">
          YouTube에서 보기 <ExternalLink size={14} aria-hidden />
        </a>
      </div>
    </div>
  );
}
