/* global React */
const { useState } = React;

function Field({ label, children, span }) {
  return (
    <label style={{ display: 'block', gridColumn: span ? `span ${span}` : 'auto' }}>
      <span style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #eef1f5',
  borderRadius: 14, padding: '12px 16px', fontSize: 16, fontFamily: 'inherit',
  background: 'white', boxShadow: '0 1px 2px rgb(11 18 32 / 0.04)',
  outline: 'none',
};

function CommitDialog({ slot, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSuccess({ editUrl: 'https://opensignup.org/s/spring-snacks/c/com_8h2k4n_x9q' });
    }, 600);
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: 'rgba(11,18,32,0.30)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: 0,
      }}>
      <div style={{
        width: '100%', maxWidth: 480, background: 'white',
        borderRadius: 18, padding: 24,
        boxShadow: '0 1px 2px rgb(11 18 32 / 0.04), 0 4px 16px rgb(11 18 32 / 0.06)',
      }}>
        {success ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>You&rsquo;re in.</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#5b6474', lineHeight: 1.5 }}>
              We&rsquo;ve saved your spot for <strong style={{ color: '#0b1220' }}>{slot.title}</strong>.
              Bookmark this link to edit or cancel later:
            </p>
            <a href={success.editUrl} style={{
              display: 'block', wordBreak: 'break-all',
              background: '#f7f8fa', padding: '8px 12px', borderRadius: 14,
              fontSize: 12, fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              color: '#1f6feb', textDecoration: 'none',
            }}>{success.editUrl}</a>
            <button onClick={onClose} style={{
              background: '#1f6feb', color: 'white', border: 'none',
              padding: '12px 16px', borderRadius: 14, fontWeight: 500,
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Sign up for {slot.title}</h2>
            <Field label="Your name">
              <input style={inputStyle} type="text" name="name" required defaultValue="" />
            </Field>
            <Field label="Email">
              <input style={inputStyle} type="email" name="email" required placeholder="you@example.com" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12 }}>
              <Field label="Notes (optional)">
                <input style={inputStyle} type="text" name="notes" placeholder="Allergies, preferences, etc." />
              </Field>
              <Field label="Qty">
                <input style={inputStyle} type="number" name="quantity" min="1" defaultValue="1" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
              <button type="button" onClick={onClose} disabled={submitting} style={{
                flex: 1, background: 'white', border: '1px solid #eef1f5',
                padding: '12px 16px', borderRadius: 14, fontWeight: 500, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: submitting ? 0.5 : 1,
              }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{
                flex: 1, background: '#1f6feb', color: 'white', border: 'none',
                padding: '12px 16px', borderRadius: 14, fontWeight: 500, fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: submitting ? 0.6 : 1, transition: 'filter 150ms',
              }}>{submitting ? 'Signing up…' : 'Confirm'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

window.CommitDialog = CommitDialog;
