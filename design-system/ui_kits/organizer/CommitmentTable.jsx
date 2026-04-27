/* global React */

function CommitmentTable({ rows, slots }) {
  if (!rows.length) {
    return (
      <p style={{
        color: '#5b6474', borderRadius: 14, padding: 24, textAlign: 'center', fontSize: 14,
        border: '1px dashed #eef1f5',
      }}>No signups yet.</p>
    );
  }
  return (
    <div style={{ borderRadius: 18, border: '1px solid #eef1f5', background: 'white', overflow: 'hidden' }}>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f7f8fa', color: '#5b6474' }}>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Slot</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const slot = slots.find(s => s.id === r.slotId);
            return (
              <tr key={r.id} style={{ borderTop: '1px solid #eef1f5' }}>
                <td style={td}><span style={{ fontWeight: 500 }}>{r.name}</span></td>
                <td style={{ ...td, color: '#5b6474' }}>{r.email}</td>
                <td style={td}>{slot?.title ?? '—'}</td>
                <td style={td}>{r.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const th = { padding: '12px 16px', textAlign: 'left', fontWeight: 500 };
const td = { padding: '12px 16px' };

window.CommitmentTable = CommitmentTable;
