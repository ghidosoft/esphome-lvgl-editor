import type { IconId } from '../../editor/schema';

/**
 * Tiny inline-SVG glyphs for unambiguous property categories. Kept narrow on
 * purpose — the goal is shorthand for senior users, not a full design system.
 * Anything ambiguous stays as a text label.
 */
export function Icon({
  name,
  className,
}: {
  name: IconId | 'link' | 'unlink';
  className?: string;
}) {
  const cls = `inspector-icon${className ? ' ' + className : ''}`;
  switch (name) {
    case 'pad':
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" />
          <rect
            x="4.5"
            y="4.5"
            width="7"
            height="7"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeDasharray="1.5 1.5"
          />
        </svg>
      );
    case 'radius':
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 14V6 A4 4 0 0 1 6 2 H14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'border-width':
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case 'link':
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6 10 L10 6 M5.5 6 a2.5 2.5 0 0 0 0 4 H7 M9 6 H10.5 a2.5 2.5 0 0 1 0 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'unlink':
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M5.5 6 a2.5 2.5 0 0 0 0 4 H7 M9 6 H10.5 a2.5 2.5 0 0 1 0 4 M3 3 L13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
