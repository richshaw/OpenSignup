/* global React */

function SlotRow({ slot, onSignup }) {
  const full = slot.capacity != null && slot.committed >= slot.capacity;
  const closed = slot.status !== 'open' || full;
  return (
    <li style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, padding: '16px 20px', borderBottom: '1px solid #eef1f5',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>{slot.title}</div>
        <div style={{ fontSize: 13, color: '#5b6474', marginTop: 2 }}>
          {slot.date}{slot.location ? ` · ${slot.location}` : ''}
        </div>
        {slot.description ? (
          <div style={{ fontSize: 13, color: '#5b6474', marginTop: 4 }}>{slot.description}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: '#5b6474', width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {slot.committed}{slot.capacity ? `/${slot.capacity}` : ''}
        </span>
        <div style={{ width: 96, display: 'flex', justifyContent: 'center' }}>
          {closed ? (
            <span style={{ fontSize: 12, fontWeight: 500, color: '#5b6474', padding: '6px 12px' }}>
              {full ? 'Full' : 'Closed'}
            </span>
          ) : (
            <button onClick={() => onSignup(slot)} style={{
              background: '#1f6feb', color: 'white', border: 'none',
              padding: '8px 16px', borderRadius: 14, fontSize: 13,
              fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'filter 150ms',
            }} onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
               onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
              Sign up
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

window.SlotRow = SlotRow;
