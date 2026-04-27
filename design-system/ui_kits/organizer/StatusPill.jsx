/* global React */

function StatusPill({ status }) {
  const map = {
    open:     { bg: 'rgba(26,127,74,.10)', fg: '#1a7f4a' },
    draft:    { bg: 'rgba(180,83,9,.10)',  fg: '#b45309' },
    closed:   { bg: 'rgba(138,147,164,.10)', fg: '#5b6474' },
    archived: { bg: 'rgba(138,147,164,.10)', fg: '#5b6474' },
  };
  const c = map[status] || map.closed;
  return (
    <span style={{
      background: c.bg, color: c.fg, padding: '3px 10px',
      borderRadius: 9999, fontSize: 12, fontWeight: 500,
    }}>{status}</span>
  );
}

window.StatusPill = StatusPill;
