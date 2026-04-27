/* global React */

const oInput = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #eef1f5',
  borderRadius: 14, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
  background: 'white', outline: 'none',
};

function AddSlotForm({ onAdd }) {
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onAdd?.({
      title: f.get('title') || 'Untitled slot',
      date: f.get('date') || null,
      capacity: f.get('capacity') ? Number(f.get('capacity')) : null,
    });
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={submit} style={{
      display: 'grid',
      gridTemplateColumns: '1fr 160px 120px auto',
      gap: 12, alignItems: 'end',
      border: '1px solid #eef1f5', borderRadius: 18, background: 'white', padding: 20,
    }}>
      <label><span style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Slot title</span>
        <input style={oInput} type="text" name="title" required placeholder="e.g. Snack — Game 4" /></label>
      <label><span style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Date</span>
        <input style={{ ...oInput, minHeight: 38 }} type="date" name="date" /></label>
      <label><span style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Spots</span>
        <input style={oInput} type="number" name="capacity" min="1" placeholder="4" /></label>
      <button type="submit" style={{
        background: '#1f6feb', color: 'white', border: 'none',
        padding: '9px 16px', borderRadius: 14, fontSize: 14, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>Add slot</button>
    </form>
  );
}

window.AddSlotForm = AddSlotForm;
