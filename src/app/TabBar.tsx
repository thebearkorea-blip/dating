"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabBarLabels = { nav: string; chat: string; him: string; memories: string; settings: string };

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const TABS = [
  {
    href: "/chat",
    key: "chat",
    icon: (
      <svg {...svg}>
        <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
  {
    href: "/him",
    key: "him",
    icon: (
      <svg {...svg}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    href: "/me",
    key: "memories",
    icon: (
      <svg {...svg}>
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    key: "settings",
    icon: (
      <svg {...svg}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
      </svg>
    ),
  },
] as const;

/** 하단 탭바. /him·/me·/settings에만 단다(채팅 화면 제외). 페이지는 pb-24로 가려짐을 막는다. */
export function TabBar({ labels }: { labels: TabBarLabels }) {
  const path = usePathname();
  return (
    <nav
      aria-label={labels.nav}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-[var(--color-header-bg)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const current = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${current ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]"}`}
              >
                {t.icon}
                <span>{labels[t.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
