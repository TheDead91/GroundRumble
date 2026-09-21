import { useState, useEffect, useRef } from 'react';
import { Info } from 'lucide-react';

// Lightweight spotlight walkthrough that highlights real interface elements.
// Each step targets a CSS selector (e.g. '[data-tour="nav-runner"]'); once the
// element is found it is scrolled into view, everything else is dimmed, and a
// tooltip explains it. Steps can declare `waitFor()` to pause until some app
// state is reached, and `autoAdvance: true` to proceed automatically once the
// condition flips from false to true.

const FIND_INTERVAL = 250;
const MAX_ATTEMPTS = 50; // ~12s total before giving up on a missing target
const WAIT_POLL_INTERVAL = 50; // how often the auto-advance condition is re-checked
const AUTO_ADVANCE_DELAY = 50; // tiny beat so the state change visibly lands before advancing
const TOOLTIP_W = 340;

export default function Tour({ steps, active, onFinish }) {
  const [index, setIndex] = useState(0);
  const [anchors, setAnchors] = useState([]);
  const [found, setFound] = useState(false);
  const [canContinue, setCanContinue] = useState(true);
  const [tipPos, setTipPos] = useState({ left: 16, top: 16 });
  const tipRef = useRef(null);

  // Keep the latest step/steps available to effects without putting the
  // (recreated-every-render) step object in a dependency array.
  const stepRef = useRef(steps[index]);
  stepRef.current = steps[index];
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const step = steps[index];

  // A step may target one element or several (for highlighting a primary
  // element plus related sections). Returns the list of visible rects.
  const measureAll = () => {
    if (!active || !stepRef.current) return [];
    const list = Array.isArray(stepRef.current.target) ? stepRef.current.target : [stepRef.current.target];
    const rects = [];
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        rects.push({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right });
      }
    }
    return rects;
  };

  // Reset when the tour opens.
  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  // Fire optional per-step side effects (e.g. switching tabs).
  useEffect(() => {
    const s = stepRef.current;
    if (active && s && s.onEnter) s.onEnter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Move focus into the tooltip once when a step becomes active. This must NOT
  // run repeatedly on anchor updates, otherwise it steals focus from controls
  // the user is interacting with (e.g. a select dropdown) and closes them.
  useEffect(() => {
    if (active && tipRef.current) {
      tipRef.current.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Escape closes the tour.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') onFinish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onFinish]);

  // Wait for an optional per-step condition before enabling "Next". If the
  // condition was NOT already true on entry and the step opts in via
  // `autoAdvance`, the tour automatically proceeds once the condition is met.
  useEffect(() => {
    if (!active || !stepRef.current) return;
    const s = stepRef.current;
    if (!s.waitFor) { setCanContinue(true); return; }
    let okNow = false;
    try { okNow = s.waitFor(); } catch { okNow = false; }
    if (okNow) { setCanContinue(true); return; }
    let timer;
    let advanceTimer;
    setCanContinue(false);
    const poll = () => {
      const cur = stepRef.current;
      let ok = false;
      try { ok = cur.waitFor(); } catch { ok = false; }
      if (ok) {
        setCanContinue(true);
        if (cur.autoAdvance) {
          advanceTimer = setTimeout(() => {
            setIndex(i => Math.min(i + 1, stepsRef.current.length - 1));
          }, AUTO_ADVANCE_DELAY);
        }
        return;
      }
      timer = setTimeout(poll, WAIT_POLL_INTERVAL);
    };
    poll();
    return () => {
      clearTimeout(timer);
      clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Locate the target(s), bring them into view, and glue the spotlight to them.
  // Re-measures periodically so highlights follow elements that change size or
  // position when the user interacts (e.g. toggling the console).
  useEffect(() => {
    if (!active || !stepRef.current) return;
    const list = Array.isArray(stepRef.current.target) ? stepRef.current.target : [stepRef.current.target];
    let attempts = 0;
    let timer;
    let scrolled = false;
    const poll = () => {
      const rects = measureAll();
      if (rects.length > 0) {
        setFound(true);
        setAnchors(rects);
        if (!scrolled) {
          scrolled = true;
          // Scroll to the topmost target so all highlighted sections are in view.
          let minIdx = 0;
          for (let i = 1; i < rects.length; i++) {
            if (rects[i].top < rects[minIdx].top) minIdx = i;
          }
          const el = document.querySelector(list[minIdx]);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) { setFound(false); setAnchors([]); return; }
      timer = setTimeout(poll, FIND_INTERVAL);
    };
    poll();
    const refresh = () => {
      const rects = measureAll();
      if (rects.length > 0) setAnchors(rects);
    };
    const interval = setInterval(refresh, 500);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Position the tooltip against the primary (first) anchor, preferring
  // placements that keep it fully inside the viewport AND clear of the
  // highlighted element (below, above, then the sides). When no placement
  // fits cleanly (e.g. a tall tooltip next to a tall anchor), fall back to
  // whichever placement overlaps the highlighted element the least, so the
  // tooltip never dumps on top of an interactive control inside the anchor.
  useEffect(() => {
    if (!active || !step || !found || anchors.length === 0) return;
    const anchor = anchors[0];
    const h = tipRef.current ? tipRef.current.offsetHeight : 150;
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1200;
    const gap = 14;
    const pad = 12;

    // Candidate placements in priority order: below, above, right, left.
    const candidates = [
      { top: anchor.bottom + gap, left: Math.min(anchor.left, vw - TOOLTIP_W - pad) },
      { top: anchor.top - gap - h, left: Math.min(anchor.left, vw - TOOLTIP_W - pad) },
      { top: Math.min(anchor.top, vh - h - pad), left: anchor.right + gap },
      { top: Math.min(anchor.top, vh - h - pad), left: anchor.left - gap - TOOLTIP_W },
    ];

    const fits = (c) => (
      c.top >= pad && c.top + h <= vh - pad &&
      c.left >= pad && c.left + TOOLTIP_W <= vw - pad
    );
    const overlapArea = (c) => {
      const w = Math.max(0, Math.min(c.left + TOOLTIP_W, anchor.right) - Math.max(c.left, anchor.left));
      const oh = Math.max(0, Math.min(c.top + h, anchor.bottom) - Math.max(c.top, anchor.top));
      return w * oh;
    };

    // Prefer a cleanly fitting placement; among those, the least overlap
    // (ties resolve to the earlier/higher-priority candidate).
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!fits(c)) continue;
      const o = overlapArea(c);
      if (!best || o < best.o) best = { c, o };
    }

    let pos;
    if (best) {
      pos = { left: best.c.left, top: best.c.top };
    } else {
      // Nothing fits cleanly — clamp each candidate into the viewport, then
      // pick the one that overlaps the highlighted element the least.
      let fb = null;
      let fbO = Infinity;
      for (const c of candidates) {
        const clamped = {
          left: Math.max(pad, Math.min(c.left, vw - TOOLTIP_W - pad)),
          top: Math.max(pad, Math.min(c.top, vh - h - pad)),
        };
        const o = overlapArea(clamped);
        if (o < fbO) { fb = clamped; fbO = o; }
      }
      pos = fb;
    }
    const next = { left: Math.max(pad, pos.left), top: Math.max(pad, pos.top) };
    setTipPos(prev => (prev.left === next.left && prev.top === next.top ? prev : next));
  }, [active, index, anchors, found, step]);

  if (!active || !step) return null;

  // A step may highlight one element or several. Multiple targets are joined
  // into a single union spotlight so adjacent sections read as one region.
  let spotlights = null;
  if (found && anchors.length > 0) {
    let box = anchors[0];
    if (anchors.length > 1) {
      const union = anchors.reduce((acc, a) => ({
        top: Math.min(acc.top, a.top),
        left: Math.min(acc.left, a.left),
        right: Math.max(acc.right, a.right),
        bottom: Math.max(acc.bottom, a.bottom)
      }), { top: Infinity, left: Infinity, right: -Infinity, bottom: -Infinity });
      box = { top: union.top, left: union.left, width: union.right - union.left, height: union.bottom - union.top };
    }
    spotlights = (
      <div style={{
        position: 'fixed',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        borderRadius: 10,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        border: '2px solid var(--color-primary)',
        pointerEvents: 'none',
        zIndex: 130
      }} />
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 125, pointerEvents: 'none' }}>
      {spotlights}
      <div
        ref={tipRef}
        tabIndex={-1}
        style={{
          pointerEvents: 'auto',
          outline: 'none',
          position: 'fixed',
          left: tipPos.left,
          top: tipPos.top,
          width: TOOLTIP_W,
          maxWidth: 'calc(100vw - 24px)',
          background: 'var(--color-bg-elevated, #0d1524)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
          padding: '16px',
          zIndex: 131
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-primary)', textTransform: 'uppercase' }}>
            Tutorial {index + 1} / {steps.length}
          </span>
          <button
            onClick={onFinish}
            className="btn-secondary"
            style={{ padding: '3px', lineHeight: 1 }}
            title="Close tutorial"
          >
            ✕
          </button>
        </div>

        <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '6px' }}>{step.title}</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>{step.body}</p>

        {!found && (
          <div style={{ fontSize: '0.7rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Info size={12} /> Couldn&apos;t highlight this element — you can still continue.
          </div>
        )}

        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ height: '100%', width: `${((index + 1) / steps.length) * 100}%`, background: 'var(--color-primary)', transition: 'width 0.25s' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            className="btn-secondary"
            disabled={index === 0}
            style={{ justifyContent: 'center', padding: '8px 14px' }}
          >
            Back
          </button>
          {index < steps.length - 1 ? (
            <button
              data-tour-next
              onClick={() => setIndex(i => i + 1)}
              className="btn-primary"
              disabled={!!step.waitFor && !canContinue}
              style={{ justifyContent: 'center', padding: '8px 18px' }}
            >
              Next
            </button>
          ) : (
            <button onClick={onFinish} className="btn-primary" style={{ justifyContent: 'center', padding: '8px 18px' }}>
              Finish
            </button>
          )}
        </div>
        {step.waitFor && !canContinue && (
          <button
            onClick={() => setIndex(i => i + 1)}
            className="btn-secondary"
            style={{ justifyContent: 'center', padding: '4px 8px', marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}
          >
            Skip this step
          </button>
        )}
      </div>
    </div>
  );
}