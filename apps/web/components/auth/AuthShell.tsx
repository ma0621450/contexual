import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const AUTH_IMAGES = {
  signin: { src: '/brand/signin-clouds.png', alt: 'Figure standing before towering clouds' },
  signup: { src: '/brand/signup-portrait.png', alt: 'Portrait in warm light against a teal sky' },
} as const;

export type AuthImage = keyof typeof AUTH_IMAGES;

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Promplex home" className={cn('block', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.svg" alt="" width={40.3921} height={48} />
    </Link>
  );
}

function CornerGlow() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/corner-glow.svg"
      alt=""
      aria-hidden
      width={636.6}
      height={633.6}
      className="pointer-events-none absolute top-[-283.3px] left-[-265.3px] max-w-none select-none"
    />
  );
}

/** Light beam and star field used on onboarding and transition screens. */
export function Spotlight({ stars = 'workspace' }: { stars?: 'workspace' | 'transition' }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/spotlight.png"
        alt=""
        width={1152}
        height={462}
        className="absolute top-0 left-1/2 max-w-none -translate-x-1/2"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/stars-${stars}.svg`}
        alt=""
        width={1616.27}
        height={545.863}
        className="absolute top-[-133.49px] left-[calc(50%+0.5px)] max-w-none -translate-x-1/2"
      />
    </div>
  );
}

function InviteBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {[
        { left: 'calc(50% + 43px)', top: -80 },
        { left: 'calc(50% + 68px)', top: 20 },
        { left: 'calc(50% + 22px)', top: 104 },
      ].map((position) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={position.top}
          src="/brand/stars-invite.svg"
          alt=""
          width={1266}
          height={427.566}
          className="absolute max-w-none -translate-x-1/2"
          style={position}
        />
      ))}
      <div
        className="absolute h-[1401.859px] w-[1693.859px] rotate-[-5.89deg] mix-blend-plus-lighter"
        style={{ left: 'calc(50% - 369.5px)', top: -1106.8 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/lights-invite.svg"
          alt=""
          width={1905.41}
          height={1630}
          className="absolute top-[-120px] left-[-91.6px] max-w-none"
        />
      </div>
    </div>
  );
}

/** Form on the left, Figma photography on the right (sign in, sign up, recovery). */
export function AuthSplitLayout({
  image,
  children,
}: {
  image: AuthImage;
  children: ReactNode;
}) {
  const picture = AUTH_IMAGES[image];

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-base p-[13px] text-white">
      <CornerGlow />
      <main className="relative flex flex-1 items-center justify-center px-6 py-16 lg:justify-start lg:px-0 lg:pl-[clamp(24px,8.4vw,108px)]">
        <div className="w-full max-w-[438px]">{children}</div>
      </main>
      <div className="relative hidden w-[min(706px,49vw)] shrink-0 overflow-hidden rounded-[10px] lg:block">
        <Image
          src={picture.src}
          alt={picture.alt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 0px"
          className="object-cover"
        />
        <BrandMark className="absolute top-[20.5px] right-[31px]" />
      </div>
      <BrandMark className="absolute top-[34px] right-[44px] lg:hidden" />
    </div>
  );
}

type CenteredBackdrop = 'glow' | 'spotlight' | 'invite';

/** Full-width centered screens (email code, onboarding, invitations). */
export function AuthCenteredLayout({
  backdrop = 'glow',
  width = 438,
  children,
  className,
}: {
  backdrop?: CenteredBackdrop;
  width?: 438 | 468;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-base text-white">
      {backdrop === 'glow' ? <CornerGlow /> : null}
      {backdrop === 'spotlight' ? <Spotlight /> : null}
      {backdrop === 'invite' ? <InviteBackdrop /> : null}
      {backdrop === 'glow' ? (
        <BrandMark className="absolute top-[34px] right-[44px]" />
      ) : null}
      <main
        className={cn(
          'relative flex flex-1 items-center justify-center px-6 py-24',
          className,
        )}
      >
        <div className={cn('w-full', width === 468 ? 'max-w-[468px]' : 'max-w-[438px]')}>
          {children}
        </div>
      </main>
    </div>
  );
}
