'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircleIcon, XIcon } from 'lucide-react';

export type FanImage = {
  key: string;
  src?: string;
  filename: string;
  pending?: boolean;
  onRemove?: () => void;
};

type FanSlot = {
  x: number;
  y: number;
  rotate: number;
  z: number;
  size: number;
};

const PRESETS: Record<number, FanSlot[]> = {
  1: [{ x: 0, y: 0, rotate: 0, z: 1, size: 168 }],
  2: [
    { x: -40, y: 14, rotate: -11, z: 1, size: 148 },
    { x: 32, y: 0, rotate: 8, z: 2, size: 168 },
  ],
  3: [
    { x: -78, y: 18, rotate: -12, z: 1, size: 148 },
    { x: 0, y: 0, rotate: 0, z: 3, size: 176 },
    { x: 78, y: 16, rotate: 12, z: 2, size: 148 },
  ],
};

export function fanLayout(count: number): FanSlot[] {
  if (count <= 0) return [];
  const preset = PRESETS[count];
  if (preset) return preset;

  const mid = (count - 1) / 2;
  const spread = count === 4 ? 58 : 48;
  return Array.from({ length: count }, (_, index) => {
    const offset = index - mid;
    const distance = Math.abs(offset);
    return {
      x: offset * spread,
      y: distance * 12,
      rotate: (offset / mid) * 18,
      z: 12 - Math.round(distance * 2),
      size: distance < 0.51 ? 168 : 136,
    };
  });
}

function fanBounds(slots: FanSlot[]) {
  if (slots.length === 0) {
    return { width: 0, height: 0, originX: 0, originY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const slot of slots) {
    const radians = (Math.abs(slot.rotate) * Math.PI) / 180;
    const width =
      slot.size * Math.abs(Math.cos(radians)) +
      slot.size * Math.abs(Math.sin(radians));
    const height =
      slot.size * Math.abs(Math.sin(radians)) +
      slot.size * Math.abs(Math.cos(radians));
    minX = Math.min(minX, slot.x - width / 2);
    maxX = Math.max(maxX, slot.x + width / 2);
    minY = Math.min(minY, slot.y - height / 2);
    maxY = Math.max(maxY, slot.y + height / 2);
  }
  const pad = 10;
  return {
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    originX: -minX + pad,
    originY: -minY + pad,
  };
}

export function ImageFan({
  images,
  align = 'end',
}: {
  images: FanImage[];
  align?: 'start' | 'end';
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const slots = fanLayout(images.length);
  const bounds = fanBounds(slots);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = frameRef.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const update = () => {
      const available = parent.clientWidth;
      setScale(available > 0 ? Math.min(1, available / bounds.width) : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [bounds.width]);

  if (images.length === 0) return null;

  return (
    <div
      ref={frameRef}
      className={align === 'end' ? 'flex w-full justify-end' : 'flex w-full justify-start'}
    >
      <div style={{ width: bounds.width * scale, height: bounds.height * scale }}>
      <div
        className="relative origin-top-left"
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scale})`,
        }}
        role="group"
        aria-label={
          images.length === 1 ? '1 uploaded image' : `${images.length} uploaded images`
        }
      >
        {images.map((image, index) => {
          const slot = slots[index];
          if (!slot) return null;
          return (
            <div
              key={image.key}
              className="absolute"
              style={{
                width: slot.size,
                height: slot.size,
                left: bounds.originX + slot.x - slot.size / 2,
                top: bounds.originY + slot.y - slot.size / 2,
                zIndex: slot.z,
                transform: `rotate(${slot.rotate}deg)`,
              }}
            >
              <div className="relative size-full overflow-hidden rounded-[22px] border-[3px] border-white bg-[#1a1a1a] shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                {image.src ? (
                  <img
                    src={image.src}
                    alt={image.filename}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-[#a1a1aa]">
                    Image
                  </span>
                )}
                {image.pending ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <LoaderCircleIcon className="size-5 animate-spin text-white" />
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        {images.map((image, index) => {
          const slot = slots[index];
          if (!slot || !image.onRemove) return null;
          return (
            <div
              key={`${image.key}-remove`}
              className="pointer-events-none absolute"
              style={{
                width: slot.size,
                height: slot.size,
                left: bounds.originX + slot.x - slot.size / 2,
                top: bounds.originY + slot.y - slot.size / 2,
                zIndex: 40 + index,
                transform: `rotate(${slot.rotate}deg)`,
              }}
            >
              <button
                type="button"
                onClick={image.onRemove}
                title="Remove image"
                aria-label={`Remove ${image.filename}`}
                className="pointer-events-auto absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/25 bg-[#2a2a2a] text-white shadow-sm hover:bg-[#3a3a3a]"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
