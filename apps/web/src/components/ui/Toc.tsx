// Sticky "on this page" rail for long info pages (≥1200px). One IntersectionObserver
// drives the scrollspy; below the breakpoint the rail simply doesn't render (CSS).
import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className="toc" aria-label="On this page">
      <span className="toc-title">on this page</span>
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} className={active === it.id ? "active" : ""}>
          {it.label}
        </a>
      ))}
    </nav>
  );
}
