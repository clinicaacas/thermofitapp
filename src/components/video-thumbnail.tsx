import { PlayCircle } from "lucide-react";

export function VideoThumbnailPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative grid h-full w-full place-items-center overflow-hidden rounded-md bg-[#F3E8D2] ${className}`}
    >
      <PlayCircle className="h-8 w-8 text-[#8A6A3D]" />
    </div>
  );
}

export function VideoThumbnail({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  if (!src) return <VideoThumbnailPlaceholder className={className} />;
  return (
    <div className={`relative overflow-hidden rounded-md bg-[#F3E8D2] ${className}`}>
      <img
        src={src}
        alt={alt ?? ""}
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/15">
        <PlayCircle className="h-8 w-8 text-white drop-shadow" />
      </div>
    </div>
  );
}

export function youtubeId(url: string): string | null {
  const m =
    url.match(/youtu\.be\/([^?&/]+)/) ||
    url.match(/youtube\.com\/watch\?v=([^?&]+)/) ||
    url.match(/youtube\.com\/embed\/([^?&]+)/) ||
    url.match(/youtube\.com\/shorts\/([^?&/]+)/);
  return m ? m[1] : null;
}

export function youtubeThumb(url: string): string | null {
  const id = youtubeId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
