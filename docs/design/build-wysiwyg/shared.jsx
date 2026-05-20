/* global React */
const { useState, useRef, useEffect, useLayoutEffect } = React;

/* ---------- Lucide-ish icons (inline SVG, 2px stroke, rounded joins) ---------- */
const SVG = ({ d, size = 14, fill, strokeWidth = 2, style, children }) =>
<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill={fill ?? 'none'}
  stroke="currentColor"
  strokeWidth={strokeWidth}
  strokeLinecap="round"
  strokeLinejoin="round"
  style={{ display: 'block', flexShrink: 0, ...style, width: "13px", height: "13px" }}>
  
    {d ? <path d={d} /> : children}
  </svg>;


const Icon = {
  Plus: (p) => <SVG {...p}><path d="M12 5v14M5 12h14" /></SVG>,
  ChevronDown: (p) => <SVG {...p}><path d="m6 9 6 6 6-6" /></SVG>,
  ChevronUp: (p) => <SVG {...p}><path d="m18 15-6-6-6 6" /></SVG>,
  Calendar: (p) => <SVG {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></SVG>,
  Clock: (p) => <SVG {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></SVG>,
  Type: (p) => <SVG {...p}><path d="M4 7V4h16v3M9 20h6M12 4v16" /></SVG>,
  Hash: (p) => <SVG {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></SVG>,
  List: (p) => <SVG {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></SVG>,
  Pencil: (p) => <SVG {...p}><path d="M21.2 6.8a2.5 2.5 0 0 0-3.5-3.5L4 17l-1 4 4-1Z" /><path d="m15 5 4 4" /></SVG>,
  Trash: (p) => <SVG {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></SVG>,
  X: (p) => <SVG {...p}><path d="M18 6 6 18M6 6l12 12" /></SVG>,
  Eye: (p) => <SVG {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></SVG>,
  Grip: (p) => <SVG {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></SVG>,
  GripH: (p) => <SVG {...p}><circle cx="6" cy="9" r="1" fill="currentColor" /><circle cx="12" cy="9" r="1" fill="currentColor" /><circle cx="18" cy="9" r="1" fill="currentColor" /><circle cx="6" cy="15" r="1" fill="currentColor" /><circle cx="12" cy="15" r="1" fill="currentColor" /><circle cx="18" cy="15" r="1" fill="currentColor" /></SVG>,
  ArrowLeft: (p) => <SVG {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></SVG>,
  ArrowRight: (p) => <SVG {...p}><path d="M5 12h14M12 5l7 7-7 7" /></SVG>,
  Settings: (p) => <SVG {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></SVG>,
  Sparkles: (p) => <SVG {...p}><path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM5 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /></SVG>,
  Copy: (p) => <SVG {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></SVG>,
  Star: (p) => <SVG {...p}><path d="M12 2l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z" /></SVG>,
  Asterisk: (p) => <SVG {...p}><path d="M12 6v12M7.5 8.25l9 7.5M16.5 8.25l-9 7.5" /></SVG>,
  Smartphone: (p) => <SVG {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></SVG>,
  Save: (p) => <SVG {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></SVG>,
  Check: (p) => <SVG {...p}><path d="M20 6 9 17l-5-5" /></SVG>
};

/* ---------- Field type meta — mirrors fieldTypes.ts ---------- */
const TYPE_META = {
  date: { icon: Icon.Calendar, label: 'Date', hint: 'e.g. 05/21/2026' },
  time: { icon: Icon.Clock, label: 'Time', hint: 'e.g. 09:00 AM' },
  text: { icon: Icon.Type, label: 'Short text', hint: 'e.g. Bring napkins' },
  number: { icon: Icon.Hash, label: 'Number', hint: 'e.g. 12' },
  enum: { icon: Icon.List, label: 'List', hint: 'Pick from a list' }
};

const TYPE_KEYS = ['text', 'date', 'time', 'number', 'enum'];

/* ---------- Seed data ---------- */
const SEED_FIELDS = [
{ id: 'f1', name: 'Date', type: 'date' },
{ id: 'f2', name: 'Shift', type: 'time' }];


const SEED_ROWS = [
{ id: 'r1', values: { f1: '05/21/2026', f2: '09:00 AM' }, capacity: 2 },
{ id: 'r2', values: { f1: '05/21/2026', f2: '11:00 AM' }, capacity: 2 },
{ id: 'r3', values: { f1: '05/21/2026', f2: '01:00 PM' }, capacity: 2 },
{ id: 'r4', values: { f1: '05/22/2026', f2: '09:00 AM' }, capacity: 2 },
{ id: 'r5', values: { f1: '05/22/2026', f2: '11:00 AM' }, capacity: 2 },
{ id: 'r6', values: { f1: '05/22/2026', f2: '01:00 PM' }, capacity: 2 }];


/* ---------- Tiny tooltip primitive ---------- */
function Tooltip({ label, side = 'bottom', children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}>
      
      {children}
      {open && label &&
      <span
        role="tooltip"
        style={{
          position: 'absolute',
          [side === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0b1220',
          color: 'white',
          fontSize: 11,
          padding: '4px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 50,
          fontWeight: 500
        }}>
        
          {label}
        </span>
      }
    </span>);

}

/* ---------- Frame: the entire build tab layout (header + tabs + main) ---------- */
function BuildTabFrame({ children, height = 720, label = 'draft' }) {
  return (
    <div
      style={{
        height,
        width: '100%',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink)',
        overflow: 'hidden'
      }}>
      
      {/* Page header */}
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
                Spring Book Fair Volunteers
              </h1>
              <span style={{
                background: 'var(--warn-tint)', color: 'var(--warn)',
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999
              }}>{label}</span>
            </div>
            <div style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-raised)', padding: '4px 10px', borderRadius: 9999,
              fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)'
            }}>
              <span style={{ color: 'var(--ink-muted)', fontSize: "13px" }}>Public link</span>
              <span style={{ color: 'var(--ink)' }}>https://opensignup.org/s/spring-book-fair-volunteers-6pctv</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSec}><Icon.Eye size={13} /> Preview</button>
            <button style={btnSec}>Export</button>
            <button style={btnPri}>Publish</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, borderBottom: '1px solid var(--surface-sunk)' }}>
          {[['Build', 8, true], ['Responses', 0, false], ['Settings', null, false]].map(([name, count, active]) =>
          <div key={name} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px 12px',
            borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
            marginBottom: -1,
            fontSize: 14, fontWeight: active ? 600 : 500,
            color: active ? 'var(--ink)' : 'var(--ink-muted)'
          }}>
              {name}
              {count !== null &&
            <span style={{
              background: active ? 'var(--brand-tint)' : 'var(--surface-raised)',
              color: active ? 'var(--brand)' : 'var(--ink-soft)',
              fontSize: 11, padding: '1px 7px', borderRadius: 9999, fontWeight: 600
            }}>{count}</span>
            }
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, padding: '20px 32px 24px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>);

}

const btnPri = {
  background: 'var(--brand)', color: 'white', border: 'none',
  padding: '8px 16px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6
};
const btnSec = {
  background: 'white', color: 'var(--ink)', border: '1px solid var(--surface-sunk)',
  padding: '8px 14px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6
};
const btnGhost = {
  background: 'transparent', color: 'var(--ink-muted)', border: 'none',
  padding: '6px 10px', borderRadius: 'var(--radius-lg)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6
};

/* ---------- Notes annotation strip (for callouts above each artboard) ---------- */
function Annotation({ tag, title, blurb }) {
  return (
    <div style={{
      padding: '14px 18px',
      borderBottom: '1px solid var(--surface-sunk)',
      background: 'var(--surface-raised)',
      display: 'flex', alignItems: 'flex-start', gap: 14
    }}>
      <span style={{
        flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--brand)', color: 'white',
        fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)'
      }}>{tag}</span>
      <div style={{ minWidth: 0, fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2, lineHeight: 1.45 }}>{blurb}</div>
      </div>
    </div>);

}

/* ---------- useReorderable: tiny HTML5 drag-and-drop helper ----------
   Returns:
     dragId  — id of the currently-dragged item (or null)
     overId  — id of the item currently being hovered as a drop target
     source(id) — props to spread on the GRIP element (draggable + onDragStart)
     target(id) — props to spread on the ITEM container (onDragOver + onDrop)
   onReorder(fromIndex, toIndex) is called when a valid drop happens.
*/
function useReorderable({ items, onReorder }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  return {
    dragId,
    overId,
    source(id) {
      return {
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.effectAllowed = 'move';
          try {e.dataTransfer.setData('text/plain', id);} catch (_) {}
          setDragId(id);
        },
        onDragEnd: () => {setDragId(null);setOverId(null);}
      };
    },
    target(id) {
      return {
        onDragOver: (e) => {
          if (!dragId) return;
          e.preventDefault();
          if (dragId !== id && overId !== id) setOverId(id);
        },
        onDragLeave: () => {/* let dragOver of next target update overId */},
        onDrop: (e) => {
          e.preventDefault();
          const from = items.findIndex((i) => i.id === dragId);
          const to = items.findIndex((i) => i.id === id);
          if (from >= 0 && to >= 0 && from !== to) onReorder(from, to);
          setDragId(null);setOverId(null);
        }
      };
    }
  };
}

/* ---------- Expose ---------- */
Object.assign(window, {
  Icon, TYPE_META, TYPE_KEYS, SEED_FIELDS, SEED_ROWS,
  Tooltip, BuildTabFrame, Annotation,
  btnPri, btnSec, btnGhost,
  useReorderable
});