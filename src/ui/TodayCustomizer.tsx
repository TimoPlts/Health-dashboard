"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { MAX_FAVORITES, TODAY_CARDS, type TodayCardId, type TodayLayout } from "@/lib/today-layout";
import { Sheet } from "./controls";
import { Icon } from "./icons";
import { cx } from "./kit";

const LABEL = Object.fromEntries(TODAY_CARDS.map((c) => [c.id, c])) as Record<TodayCardId, (typeof TODAY_CARDS)[number]>;

/** Customise Today: drag (or use the arrows) to reorder, switch cards on/off, pick favourite metrics, reset. */
export function TodayCustomizer({ layout, metrics }: { layout: TodayLayout; metrics: { id: string; label: string; group: string }[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<TodayCardId[]>(layout.order);
  const [hidden, setHidden] = useState<TodayCardId[]>(layout.hidden);
  const [favs, setFavs] = useState<string[]>(layout.favorites);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"cards" | "favorites">("cards");
  const move = (id: TodayCardId, d: -1 | 1) => {
    const i = order.indexOf(id), j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = [...order]; [n[i], n[j]] = [n[j]!, n[i]!]; setOrder(n);
  };
  const save = async (body: TodayLayout | null, close: () => void) => {
    setBusy(true);
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ todayLayout: body }) });
    setBusy(false); router.refresh(); close();
  };
  const groups = [...new Set(metrics.map((m) => m.group))];
  return (
    <Sheet title="Customise Today" dragToDismiss={false} triggerLabel="Customise Today"
      triggerClassName="glass glass-pill pressable inline-flex items-center gap-1.5 px-4 py-2.5 text-[14px] font-semibold text-ink-2"
      trigger={<><Icon name="grid" size={16} strokeWidth={2.2} />Customise Today</>}>
      {(close) => (
        <div className="flex flex-col gap-3">
          <div role="tablist" className="flex rounded-[12px] bg-[var(--fill-2)] p-[3px]">
            {(["cards", "favorites"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx("flex-1 rounded-[9px] py-1.5 text-[13px] font-semibold", tab === t ? "bg-[var(--bg-elev)] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2")}>
                {t === "cards" ? "Cards" : `Favourite metrics (${favs.length}/${MAX_FAVORITES})`}
              </button>
            ))}
          </div>
          {tab === "cards" ? (
            <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-2">
              {order.map((id, i) => (
                <CardRow key={id} id={id} index={i} count={order.length} visible={!hidden.includes(id)}
                  onToggle={() => setHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id])} onMove={(d) => move(id, d)} />
              ))}
            </Reorder.Group>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-3">Shown in the Favourite metrics card, in this order. Up to {MAX_FAVORITES}.</p>
              {groups.map((g) => (
                <fieldset key={g}>
                  <legend className="mb-1 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{g}</legend>
                  <div className="flex flex-wrap gap-2">
                    {metrics.filter((m) => m.group === g).map((m) => {
                      const on = favs.includes(m.id);
                      return (
                        <button key={m.id} type="button" aria-pressed={on} disabled={!on && favs.length >= MAX_FAVORITES}
                          onClick={() => setFavs(on ? favs.filter((f) => f !== m.id) : [...favs, m.id])}
                          className={cx("pressable rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40", on ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink")}>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <div className="sticky bottom-0 -mx-5 mt-1 flex gap-2 bg-[var(--glass-thick)] px-5 pt-2 pb-1 backdrop-blur-xl">
            <button type="button" disabled={busy} onClick={() => save({ order, hidden, favorites: favs }, close)} className="pressable flex-1 rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">{busy ? "Saving…" : "Done"}</button>
            <button type="button" disabled={busy} onClick={() => { if (confirm("Reset Today to the default layout?")) void save(null, close); }} className="pressable rounded-full bg-[var(--fill-2)] px-4 py-2.5 text-[15px] font-semibold">Reset</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function CardRow({ id, index, count, visible, onToggle, onMove }: { id: TodayCardId; index: number; count: number; visible: boolean; onToggle: () => void; onMove: (d: -1 | 1) => void }) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const c = LABEL[id];
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} transition={reduce ? { duration: 0 } : undefined}
      className="flex items-center gap-2 rounded-2xl bg-[var(--fill)] py-2 pr-2 pl-1" style={{ touchAction: "pan-y" }}>
      <button type="button" aria-label={`Drag to reorder ${c.label}`} onPointerDown={(e) => controls.start(e)} className="grid size-9 shrink-0 cursor-grab touch-none place-items-center text-ink-3 active:cursor-grabbing">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <span className={cx("min-w-0 flex-1", !visible && "opacity-50")}>
        <span className="block truncate text-[15px] font-semibold">{c.label}</span>
        <span className="block truncate text-[12px] text-ink-3">{c.hint}</span>
      </span>
      <button type="button" aria-label={`Move ${c.label} up`} disabled={index === 0} onClick={() => onMove(-1)} className="pressable grid size-8 place-items-center rounded-full text-ink-2 disabled:opacity-25"><Icon name="chevronLeft" size={15} className="rotate-90" /></button>
      <button type="button" aria-label={`Move ${c.label} down`} disabled={index === count - 1} onClick={() => onMove(1)} className="pressable grid size-8 place-items-center rounded-full text-ink-2 disabled:opacity-25"><Icon name="chevronRight" size={15} className="rotate-90" /></button>
      <button type="button" role="switch" aria-checked={visible} aria-label={`Show ${c.label}`} onClick={onToggle}
        className={cx("relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors", visible ? "bg-ok" : "bg-[var(--fill-2)]")}>
        <span className={cx("absolute top-[2px] size-[26px] rounded-full bg-white shadow transition-transform", visible ? "translate-x-[22px]" : "translate-x-[2px]")} />
      </button>
    </Reorder.Item>
  );
}
