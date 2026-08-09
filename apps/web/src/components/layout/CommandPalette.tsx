// ⌘K / Ctrl+K / "/" — a combobox-in-dialog over the whole app. The ARIA shape is the
// simple one on purpose: DOM focus NEVER leaves the input (options are reached via
// aria-activedescendant), so the focus trap is trivial and screen readers get a plain
// combobox instead of a roving-focus contraption.
//
// Data cost: pages are static; matches are free (the shared UpcomingContext fetch);
// recent graded matches arrive via ONE lazy completed(10) on first open (the endpoint is
// max-age 300, so this is usually a cache hit) — the palette costs nothing until used.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type CompletedItem } from "../../api";
import {
  actionItems,
  isEditableTarget,
  matchItems,
  PAGE_ITEMS,
  rankPalette,
  type PaletteItem,
} from "../../lib/palette";
import { onOpenPalette } from "./paletteBus";
import { useUpcoming, useUpcomingNow } from "./UpcomingContext";

const GROUP_LABEL: Record<PaletteItem["group"], string> = {
  pages: "pages",
  matches: "matches",
  actions: "actions",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<CompletedItem[] | null>(null);
  const fetchedRecent = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { inPlay } = useUpcoming();
  const upcoming = useUpcomingNow();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // ---- open/close plumbing ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e.target as HTMLElement | null)
      ) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        // WINDOW-level, not input-level: if focus ever escapes the dialog (a click on its
        // chrome, a programmatic move), Escape must still work — a modal with a dead
        // Escape key is a trap. A no-op when already closed.
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    // the keycap TOGGLES: clicking it while open must close, not silently no-op with
    // focus stranded on the button
    const off = onOpenPalette(() => setOpen((o) => !o));
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, []);

  // navigating (via the palette or otherwise) closes it
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // focus in, focus back out, scroll lock with scrollbar compensation
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    if (!fetchedRecent.current) {
      fetchedRecent.current = true;
      api
        .completed(10)
        .then((r) => setRecent(r.items))
        .catch(() => {
          fetchedRecent.current = false; // a failed lazy fetch may retry on next open
        });
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      restoreFocus.current?.focus?.();
    };
  }, [open]);

  const items = useMemo(() => {
    const latestHash = recent?.[0]?.forecast_hash ?? null;
    const verifyId = recent?.[0]?.match_id ?? null;
    return [
      ...PAGE_ITEMS,
      ...matchItems(upcoming, inPlay, recent),
      ...actionItems(latestHash, verifyId),
    ];
  }, [upcoming, inPlay, recent]);

  const ranked = useMemo(() => rankPalette(items, query), [items, query]);

  // keep the active row inside the ranked range as the query narrows
  const activeIdx = Math.min(active, Math.max(ranked.length - 1, 0));
  const activeItem = ranked[activeIdx];
  // option ids are keyed by ITEM, not index: aria-activedescendant only announces on
  // CHANGE, and with index ids "pal-opt-0" stays literally identical while the item it
  // names swaps under the reader's cursor as the query narrows
  const optId = (item: PaletteItem) => `pal-opt-${item.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  useEffect(() => {
    if (!activeItem) return;
    listRef.current
      ?.querySelector(`#${optId(activeItem)}`)
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.id]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!open) return null;

  const activate = (item: PaletteItem) => {
    if (item.copyText) {
      void navigator.clipboard?.writeText(item.copyText).then(() => {
        setCopiedId(item.id);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        // one-shot, event-bounded (motion rule-7 exemption class)
        copyTimer.current = setTimeout(() => setCopiedId(null), 1200);
      });
      return; // stays open — the feedback is the point
    }
    if (item.href) {
      window.open(item.href, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }
    if (item.to) {
      setOpen(false);
      void navigate(item.to);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      // Tab must not move focus behind the scrim while aria-modal claims the background
      // is inert — the dialog has one focusable, so Tab means "I'm done": close, restore
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(ranked.length === 0 ? 0 : (activeIdx + 1) % ranked.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(ranked.length === 0 ? 0 : (activeIdx - 1 + ranked.length) % ranked.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(ranked.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeItem) activate(activeItem);
    }
  };

  // grouped render, flat option indices (activedescendant needs one sequence)
  const groups: { group: PaletteItem["group"]; rows: { item: PaletteItem; idx: number }[] }[] = [];
  ranked.forEach((item, idx) => {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.rows.push({ item, idx });
    else groups.push({ group: item.group, rows: [{ item, idx }] });
  });

  return (
    <div
      className="pal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        // keep DOM focus in the input on ANY palette-chrome press (group headers, the
        // empty message, list padding) — only the input itself may take focus. Known
        // trade: Firefox also cancels scrollbar drags inside the list; wheel and arrows
        // still scroll, and focus integrity beats a drag affordance here.
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <input
          ref={inputRef}
          className="pal-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={activeItem ? optId(activeItem) : undefined}
          aria-label="Search pages, matches and actions"
          placeholder="Search pages, matches, actions…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="pal-list" id="pal-list" role="listbox" ref={listRef}>
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={GROUP_LABEL[g.group]}>
              <div className="pal-group" aria-hidden>
                <span>{GROUP_LABEL[g.group]}</span>
                <span className="pal-rule" />
              </div>
              {g.rows.map(({ item, idx }) => (
                <div
                  key={item.id}
                  id={optId(item)}
                  role="option"
                  aria-selected={idx === activeIdx}
                  className={`pal-row${idx === activeIdx ? " active" : ""}`}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => activate(item)}
                >
                  <span className="pal-label">{item.label}</span>
                  {(copiedId === item.id || item.hint) && (
                    <span className="pal-hint">
                      {copiedId === item.id ? "copied ✓" : item.hint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* outside the listbox — a non-option child of role="listbox" is invalid ARIA */}
        {ranked.length === 0 && (
          <div className="pal-empty">nothing matches “{query}” · try a team code or a page name</div>
        )}
        <div className="sr-only" aria-live="polite">
          {ranked.length} result{ranked.length === 1 ? "" : "s"}
          {copiedId ? " · hash copied to clipboard" : ""}
        </div>
      </div>
    </div>
  );
}
