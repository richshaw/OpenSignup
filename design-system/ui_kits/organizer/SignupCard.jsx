/* global React */

function SignupCard({ row, onOpen }) {
  return (
    <li style={{ borderBottom: '1px solid #eef1f5' }}>
      <a href="#" onClick={(e) => { e.preventDefault(); onOpen?.(row); }}
         style={{ display: 'block', padding: '16px 20px', textDecoration: 'none', color: 'inherit', transition: 'background 150ms' }}
         onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
         onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
            <div style={{ color: '#5b6474', fontSize: 13, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>/s/{row.slug}</div>
          </div>
          <window.StatusPill status={row.status} />
        </div>
      </a>
    </li>
  );
}

window.SignupCard = SignupCard;
