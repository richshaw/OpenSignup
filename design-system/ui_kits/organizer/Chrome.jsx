/* global React */

function Chrome({ email, crumbs, onNav, children }) {
  return (
    <div style={{ minHeight: '100svh', background: '#ffffff', fontFamily: 'var(--font-sans, Inter, sans-serif)', color: '#0b1220' }}>
      <header style={{ borderBottom: '1px solid #eef1f5', background: 'white' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#5b6474', minWidth: 0 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onNav?.('/app'); }}
               style={{ color: '#0b1220', fontWeight: 600, letterSpacing: '-0.02em', textDecoration: 'none' }}>OpenSignup</a>
            {crumbs?.map((c, i) => (
              <React.Fragment key={i}>
                <span aria-hidden style={{ color: '#8a93a4' }}>›</span>
                {c.href
                  ? <a href="#" onClick={(e) => { e.preventDefault(); onNav?.(c.href); }} style={{ color: 'inherit', textDecoration: 'none' }}>{c.label}</a>
                  : <span aria-current="page" style={{ color: '#0b1220', fontWeight: 500 }}>{c.label}</span>}
              </React.Fragment>
            ))}
          </nav>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <span style={{ color: '#5b6474', fontSize: 14 }}>{email}</span>
            <button style={{ background: 'none', border: 'none', color: '#5b6474', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>{children}</main>
    </div>
  );
}

window.Chrome = Chrome;
