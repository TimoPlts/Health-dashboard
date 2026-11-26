import type { SVGProps } from "react";

/** Original line-icon set, 24px grid, 1.75 stroke. No emoji anywhere in the UI. */
const paths = {
  today: <><circle cx="12" cy="12" r="8.25" /><path d="M12 7.5v4.5l3 2" /></>,
  sleep: <path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1Z" />,
  training: <><path d="M6.5 7v10M17.5 7v10M3.75 9.5v5M20.25 9.5v5M6.5 12h11" /></>,
  trends: <><path d="M4 19.25h16" /><path d="m5 15 4.25-4.5 3.5 3 6.25-6.75" /><path d="M15 6.75h4v4" /></>,
  settings: <><circle cx="12" cy="12" r="2.75" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.85-1.45-1.9-3.3-2.2.85a7.6 7.6 0 0 0-2.6-1.5L14.2 2.75h-3.8l-.35 2.35a7.6 7.6 0 0 0-2.6 1.5l-2.2-.85-1.9 3.3L5.2 10.5a7.6 7.6 0 0 0 0 3l-1.85 1.45 1.9 3.3 2.2-.85a7.6 7.6 0 0 0 2.6 1.5l.35 2.35h3.8l.35-2.35a7.6 7.6 0 0 0 2.6-1.5l2.2.85 1.9-3.3Z" /></>,
  heart: <path d="M12 20s-7.25-4.35-7.25-10A4.25 4.25 0 0 1 12 7.1 4.25 4.25 0 0 1 19.25 10c0 5.65-7.25 10-7.25 10Z" />,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  lungs: <><path d="M12 4v7" /><path d="M12 11c-1.5 0-2.5-1.5-4-3-2-2-4 0-4 3v6c0 2 2 3 4 2l2-1c1-.5 2-1.5 2-3Z" /><path d="M12 11c1.5 0 2.5-1.5 4-3 2-2 4 0 4 3v6c0 2-2 3-4 2l-2-1c-1-.5-2-1.5-2-3Z" /></>,
  drop: <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" />,
  thermo: <><path d="M10 14.2V5a2 2 0 1 1 4 0v9.2a3.75 3.75 0 1 1-4 0Z" /><path d="M12 10v6" /></>,
  flame: <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6-4-10.5-3 1.5-4.5 4-4.5 6.5-1-.5-1.5-1.5-1.5-3-2 2-3 4.5-3 7A6.5 6.5 0 0 0 12 21Z" />,
  steps: <><path d="M7.5 3.75c1.8 0 2.75 2 2.75 4.5S9 13 7.5 13 4.75 11 4.75 8.25 5.7 3.75 7.5 3.75Z" /><path d="M5.25 16h4.5M16.5 7.75c1.8 0 2.75 2 2.75 4.5S18 17 16.5 17s-2.75-2-2.75-4.75S14.7 7.75 16.5 7.75Z" /><path d="M14.25 20h4.5" /></>,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  sync: <><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9" /><path d="M19.5 4.5V9H15" /><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15" /><path d="M4.5 19.5V15H9" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4 2.75 19.5h18.5Z" /><path d="M12 10v4M12 17h.01" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  clock: <><circle cx="12" cy="12" r="8.25" /><path d="M12 7.5V12h4" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, strokeWidth = 1.75, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  );
}
