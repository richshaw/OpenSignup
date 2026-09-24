import Image from 'next/image';

/**
 * Building blocks for help articles. The `data-help-*` attributes are what
 * `articles.test.tsx` reads to check an article against `docs/writing-help.md`,
 * so keep them on the rendered elements.
 */

/**
 * A button, link or box, named exactly as the screen names it. Pass a value
 * from the article's `UI` list, never a literal: the walkthrough test clicks
 * the same names.
 */
export function Ui({ children }: { children: string }) {
  return (
    <strong data-help-ui="" className="font-semibold">
      {children}
    </strong>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-4 pl-6 marker:font-semibold">{children}</ol>;
}

export function Step({ children }: { children: React.ReactNode }) {
  return <li className="space-y-3 pl-1">{children}</li>;
}

/** A side note that doesn't belong in a step, such as a different path on some sites. */
export function Note({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 rounded-lg bg-surface-raised px-4 py-3 text-sm">{children}</div>;
}

/**
 * A screenshot taken by the article's walkthrough test (`pnpm help:screenshots`),
 * served from `public/help/<slug>/`. Files are captured at 2x, so `width` and
 * `height` are half the file's size; the unit checks say so when they aren't.
 */
export function Screenshot({
  src,
  alt,
  width,
  height,
}: {
  src: `/help/${string}.png`;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <figure
      data-help-shot={src}
      className="w-fit max-w-full overflow-hidden rounded-lg border border-surface-sunk"
    >
      {/* Already cropped at the size we want; nothing for the optimizer to do. */}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        unoptimized
        className="block h-auto max-w-full"
      />
    </figure>
  );
}
