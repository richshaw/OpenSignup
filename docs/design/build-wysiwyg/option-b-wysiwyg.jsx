/* global React, Icon, TYPE_META, TYPE_KEYS, FieldEditorDialog,
   useReorderable, arrayMove,
   btnPri, btnSec, btnGhost, SEED_FIELDS, SEED_ROWS */

/* OPTION B/3 — WYSIWYG editor.
   No authoring chrome. No schema rail. No data grid. The build surface
   *is* the published signup page, full-bleed. Edit handles overlay on
   hover/focus. Slot rows look exactly like volunteers will see them;
   clicking a row expands it inline to edit its field values. Schema lives
   behind a floating "Fields" chip — surfaced when you need it, invisible
   when you don't.
*/
const { useState: useStateWY, useRef: useRefWY, useEffect: useEffectWY, useMemo: useMemoWY } = React;

function OptionBWysiwyg() {
  const [title, setTitle] = useStateWY('Spring Book Fair Volunteers');
  const [intro, setIntro] = useStateWY('Please sign up for a 2-hour shift to help with our spring book fair.');
  const [fields, setFields] = useStateWY(SEED_FIELDS);
  const [rows, setRows] = useStateWY(SEED_ROWS);
  const [expandedRow, setExpandedRow] = useStateWY(null);
  const [fieldsPanel, setFieldsPanel] = useStateWY(false);
  // 'auto' = first date/enum, '__none__' = flat, otherwise fieldId.
  const [groupByPref, setGroupByPref] = useStateWY('auto');

  const fieldReorder = useReorderable({
    items: fields,
    onReorder: (from, to) => setFields((fs) => arrayMove(fs, from, to))
  });
  const rowReorder = useReorderable({
    items: rows,
    onReorder: (from, to) => setRows((rs) => arrayMove(rs, from, to))
  });

  // Resolve groupBy
  const autoGroupField = fields.find((f) => f.type === 'date') || fields.find((f) => f.type === 'enum') || null;
  const groupField =
  groupByPref === '__none__' ? null :
  groupByPref === 'auto' ? autoGroupField :
  fields.find((f) => f.id === groupByPref) || autoGroupField;

  const timeField = fields.find((f) => f.type === 'time');
  const otherFields = fields.filter((f) => f.id !== groupField?.id && f.id !== timeField?.id);

  const groups = useMemoWY(() => {
    if (!groupField) return [{ key: '__flat__', label: null, rows }];
    const map = new Map();
    rows.forEach((r) => {
      const k = r.values[groupField.id] || '__empty__';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return Array.from(map.entries()).map(([k, rs]) => ({ key: k, label: k, rows: rs }));
  }, [rows, groupField]);

  const updateRow = (id, patch) =>
  setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch, values: { ...r.values, ...(patch.values || {}) } } : r));

  const addSlotInGroup = (dateKey) => {
    const seed = Object.fromEntries(fields.map((f) => [f.id, '']));
    if (groupField && dateKey !== '__empty__') seed[groupField.id] = dateKey;
    const newId = 'r_' + Math.floor(Math.random() * 9999);
    setRows((rs) => [...rs, { id: newId, values: seed, capacity: 2 }]);
    setExpandedRow(newId);
  };

  const addDate = () => {
    if (!groupField) return;
    const dateKey = 'new date';
    const seed = Object.fromEntries(fields.map((f) => [f.id, '']));
    seed[groupField.id] = dateKey;
    setRows((rs) => [...rs, {
      id: 'r_' + Math.floor(Math.random() * 9999),
      values: seed, capacity: 2
    }]);
  };

  // Dynamic sheet width: grow with field count.
  // 1–3 fields → 580; 4 → 720; 5+ → 960. Caps so it doesn't sprawl on huge schemas.
  const sheetMaxWidth =
  fields.length <= 3 ? 580 :
  fields.length === 4 ? 720 :
  960;

  // Side-panel threshold: with 5+ fields, the inline accordion thrashes the
  // layout too much. Slot edits open a right-side panel instead.
  const SIDE_PANEL_THRESHOLD = 5;
  const useSidePanel = fields.length >= SIDE_PANEL_THRESHOLD;
  const expandedRowObj = expandedRow ? rows.find((r) => r.id === expandedRow) : null;

  return (
    <>
      <div style={{
        height: '100%', overflow: 'auto',
        background: 'var(--surface-raised)',
        position: 'relative',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* Page-as-form — centred in a sheet that widens with field count */}
        <div style={{
          maxWidth: sheetMaxWidth, width: '100%',
          margin: '24px auto 120px',
          background: 'white',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--surface-sunk)',
          borderTop: '3px solid var(--brand)',
          position: 'relative',
          transition: 'max-width var(--duration-base) ease',
          fontFamily: 'var(--font-sans)'
        }}>

          {/* Sticky editing rail — anchored at the top of the sheet, always visible */}
          <EditingRail
            fieldCount={fields.length}
            onOpenFields={() => setFieldsPanel((o) => !o)}
            fieldsOpen={fieldsPanel} />

          {/* Anchored fields modal — schema is global, so it lives in its own layer */}
          {fieldsPanel &&
          <FieldsPopover
            fields={fields}
            reorder={fieldReorder}
            groupByPref={groupByPref}
            resolvedGroupField={groupField}
            onGroupByChange={setGroupByPref}
            onClose={() => setFieldsPanel(false)}
            onSaveField={(field) => {
              if (field.id && fields.some((f) => f.id === field.id)) {
                setFields((fs) => fs.map((x) => x.id === field.id ? { ...x, ...field } : x));
              } else {
                setFields((fs) => [...fs, { ...field, id: 'f' + (fs.length + 1) + '_' + Math.floor(Math.random() * 999) }]);
              }
            }}
            onChangeType={(id, t) => setFields((fs) => fs.map((x) => x.id === id ? { ...x, type: t } : x))}
            onDelete={(id) => setFields((fs) => fs.filter((x) => x.id !== id))} />
          }

          {/* Sheet body */}
          <div style={{ padding: '20px 28px 24px' }}>

          {/* Title */}
          <Editable
            value={title}
            onChange={setTitle}
            placeholder="Untitled sign-up"
            withEdit
            style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--ink)', display: 'block',
              padding: '2px 4px', margin: '-2px -4px'
            }} />
          

          {/* Intro */}
          <Editable
            value={intro}
            onChange={setIntro}
            placeholder="Add a short description for volunteers"
            multiline
            withEdit
            style={{
              marginTop: 8,
              fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55,
              display: 'block', padding: '2px 4px', margin: '8px -4px 0'
            }} />
          

          {/* Slot groups */}
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {groups.map((g) =>
            <WysiwygGroup
              key={g.key}
              group={g}
              groupField={groupField}
              timeField={timeField}
              otherFields={otherFields}
              fields={fields}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              useSidePanel={useSidePanel}
              onCellChange={(rid, fid, v) => updateRow(rid, { values: { [fid]: v } })}
              onCapacity={(rid, c) => updateRow(rid, { capacity: c })}
              onAddOption={(fid, value) => setFields((fs) => fs.map((x) =>
                x.id === fid ?
                { ...x, options: x.options?.includes(value) ? x.options : [...x.options || [], value] } :
                x
              ))}
              onDelete={(rid) => setRows((rs) => rs.filter((r) => r.id !== rid))}
              onDuplicate={(rid) => setRows((rs) => {
                const idx = rs.findIndex((r) => r.id === rid);
                if (idx < 0) return rs;
                const r = rs[idx];
                const copy = { ...r, id: 'r_' + Math.floor(Math.random() * 9999), values: { ...r.values } };
                return [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)];
              })}
              rowReorder={rowReorder}
              onRenameGroup={(newDate) => {
                if (!groupField) return;
                setRows((rs) => rs.map((r) => r.values[groupField.id] === g.key ?
                { ...r, values: { ...r.values, [groupField.id]: newDate } } : r));
              }}
              onAddSlot={() => addSlotInGroup(g.key)} />

            )}
          </div>

          {/* Add date — bottom of sheet, ghost button */}
          {groupField &&
          <button onClick={addDate} style={{
            marginTop: 18,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1.5px dashed var(--surface-sunk)',
            borderRadius: 9999, padding: '6px 14px',
            cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)',
            transition: 'all var(--duration-fast)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand)';
            e.currentTarget.style.color = 'var(--brand)';
            e.currentTarget.style.background = 'var(--brand-tint)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--surface-sunk)';
            e.currentTarget.style.color = 'var(--ink-muted)';
            e.currentTarget.style.background = 'transparent';
          }}>
              <Icon.Plus size={12} /> Add date
            </button>
          }
          </div>{/* /sheet body */}
        </div>

        {/* Side panel — shown when useSidePanel + expandedRow */}
        {useSidePanel && expandedRowObj &&
        <SlotSidePanel
          row={expandedRowObj}
          fields={fields}
          onCellChange={(fid, v) => updateRow(expandedRow, { values: { [fid]: v } })}
          onCapacity={(c) => updateRow(expandedRow, { capacity: c })}
          onAddOption={(fid, value) => setFields((fs) => fs.map((x) =>
            x.id === fid ?
            { ...x, options: x.options?.includes(value) ? x.options : [...x.options || [], value] } :
            x
          ))}
          onDelete={() => {setRows((rs) => rs.filter((r) => r.id !== expandedRow));setExpandedRow(null);}}
          onDuplicate={() => setRows((rs) => {
            const idx = rs.findIndex((r) => r.id === expandedRow);
            if (idx < 0) return rs;
            const r = rs[idx];
            const copy = { ...r, id: 'r_' + Math.floor(Math.random() * 9999), values: { ...r.values } };
            return [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)];
          })}
          onClose={() => setExpandedRow(null)} />
        }
      </div>
    </>);

}

/* ---------- EditingRail — sticky top toolbar that anchors the build surface ---------- */
function EditingRail({ fieldCount, onOpenFields, fieldsOpen }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'linear-gradient(180deg, white 0%, white 70%, rgba(255,255,255,0.92) 100%)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--surface-sunk)',
      borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
      padding: '10px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10
    }}>
      {/* Left: mode label — single source of truth for "this is live" */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--brand-tint)', color: 'var(--brand)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '4px 10px', borderRadius: 9999
        }}>
          <Icon.Pencil size={10} />
          Editing
        </span>
      </div>

      {/* Right: schema only (Preview lives in the page header) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onOpenFields}
          aria-expanded={fieldsOpen}
          aria-haspopup="dialog"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: fieldsOpen ? 'var(--brand-tint)' : 'white',
            color: fieldsOpen ? 'var(--brand)' : 'var(--ink)',
            border: '1px solid ' + (fieldsOpen ? 'var(--brand)' : 'var(--surface-sunk)'),
            borderRadius: 8,
            padding: '5px 11px',
            cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 500, fontSize: 12
          }}>
          <Icon.Settings size={12} />
          <span>Fields ({fieldCount})</span>
        </button>
      </div>
    </div>);

}

/* ---------- WysiwygGroup — date header + slot list ---------- */
function WysiwygGroup({
  group, groupField, timeField, otherFields, fields,
  expandedRow, setExpandedRow, useSidePanel,
  onCellChange, onCapacity, onDelete, onDuplicate, onRenameGroup, onAddSlot,
  onAddOption,
  rowReorder
}) {
  return (
    <div>
      {groupField &&
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 8px -6px' }}>
        <Editable
          value={group.label === '__empty__' ? '' : group.label}
          display={prettyHeader(group.label, groupField)}
          onChange={onRenameGroup}
          placeholder="MM/DD/YYYY"
          withEdit
          editSize={9}
          style={{
            fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            display: 'inline-block', padding: '2px 6px',
            borderRadius: 6
          }} />
      </div>
      }
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        borderRadius: 12,
        border: '1px solid var(--surface-sunk)',
        overflow: 'hidden',
        background: 'white'
      }}>
        {group.rows.map((r) =>
        <WysiwygSlot
          key={r.id}
          row={r}
          timeField={timeField}
          otherFields={otherFields}
          fields={fields}
          expanded={expandedRow === r.id}
          useSidePanel={useSidePanel}
          onExpand={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
          onCollapse={() => setExpandedRow(null)}
          onCellChange={(fid, v) => onCellChange(r.id, fid, v)}
          onCapacity={(c) => onCapacity(r.id, c)}
          onAddOption={onAddOption}
          onDelete={() => onDelete(r.id)}
          onDuplicate={() => onDuplicate(r.id)}
          reorder={rowReorder} />

        )}
        <button onClick={onAddSlot} style={{
          width: '100%', textAlign: 'left',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none', borderTop: group.rows.length ? '1px dashed var(--surface-sunk)' : 'none',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12, color: 'var(--ink-muted)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontWeight: 500,
          transition: 'background var(--duration-fast)'
        }}
        onMouseEnter={(e) => {e.currentTarget.style.background = 'var(--brand-tint)';e.currentTarget.style.color = 'var(--brand)';}}
        onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent';e.currentTarget.style.color = 'var(--ink-muted)';}}>
          <Icon.Plus size={12} /> Add a slot
        </button>
      </div>
    </div>);

}

/* ---------- WysiwygSlot — slot row with persistent edit affordances ---------- */
function WysiwygSlot({
  row, timeField, otherFields, fields,
  expanded, useSidePanel, onExpand, onCollapse,
  onCellChange, onCapacity, onAddOption, onDelete, onDuplicate,
  reorder
}) {
  const [hover, setHover] = useStateWY(false);

  const timeVal = timeField ? row.values[timeField.id] : '';
  const otherSummary = otherFields.
  map((f) => row.values[f.id]).
  filter(Boolean).
  join(' · ');

  const isDragging = reorder?.dragId === row.id;
  const isDropTarget = reorder?.overId === row.id && reorder?.dragId && reorder?.dragId !== row.id;

  // In side-panel mode the row never expands inline. Highlight when 'being edited'.
  const inlineExpanded = expanded && !useSidePanel;
  const sidePanelEditing = expanded && useSidePanel;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...reorder?.target(row.id) || {}}
      style={{
        position: 'relative',
        borderTop: inlineExpanded ? '1px solid var(--surface-sunk)' : isDropTarget ? '2px solid var(--brand)' : '1px solid transparent',
        borderBottom: inlineExpanded ? '1px solid var(--surface-sunk)' : 'none',
        borderLeft: sidePanelEditing ? '3px solid var(--brand)' : '3px solid transparent',
        background: isDragging ? 'var(--brand-tint)' :
        inlineExpanded ? 'var(--surface-raised)' :
        sidePanelEditing ? 'var(--brand-tint)' :
        hover ? '#fafbfc' : 'white',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background var(--duration-fast), border-color var(--duration-fast)'
      }}>

      {/* Persistent grip handle — visible at ~35%, full opacity on hover */}
      {!inlineExpanded && reorder &&
      <span
        {...reorder.source(row.id)}
        title="Drag to reorder slot"
        style={{
          position: 'absolute', left: -2, top: '50%', transform: 'translateY(-50%)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 28,
          color: 'var(--ink-soft)', cursor: 'grab',
          opacity: hover ? 0.95 : 0,
          transition: 'opacity var(--duration-fast)',
          zIndex: 2
        }}>
        <Icon.Grip size={11} />
      </span>
      }

      {!inlineExpanded ?
      <button onClick={onExpand} style={{
        width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', padding: '10px 14px 10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
      }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              {timeVal || (timeField ? <span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontStyle: 'italic' }}>Set a time</span> : 'Slot')}
            </span>
            {otherSummary &&
          <span style={{ fontSize: 12, color: 'var(--ink-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {otherSummary}
              </span>
          }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
              0/{row.capacity}
            </span>
            {sidePanelEditing &&
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'var(--brand)',
              fontSize: 11, fontWeight: 600,
              padding: '3px 9px', borderRadius: 9999,
              background: 'var(--brand-tint)',
              border: '1px solid var(--brand)'
            }}>
              <Icon.Pencil size={10} />
              <span>Editing</span>
            </span>
            }
          </div>
        </button> :

      <SlotEditor
        row={row}
        fields={fields}
        onCellChange={onCellChange}
        onCapacity={onCapacity}
        onAddOption={onAddOption}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onClose={onCollapse} />

      }

      {/* Row actions — hidden at rest, revealed on row hover. Hidden while editing. */}
      {!inlineExpanded && !sidePanelEditing && hover &&
      <div style={{
        position: 'absolute', top: 4, right: 6,
        display: 'flex', gap: 1,
        background: 'white',
        border: '1px solid var(--surface-sunk)',
        borderRadius: 8,
        padding: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
      }}>
          <HoverIcon title="Edit" onClick={(e) => {e.stopPropagation();onExpand();}}>
            <Icon.Pencil size={11} />
          </HoverIcon>
          <HoverIcon title="Duplicate" onClick={(e) => {e.stopPropagation();onDuplicate();}}>
            <Icon.Copy size={11} />
          </HoverIcon>
          <HoverIcon title="Delete" danger onClick={(e) => {e.stopPropagation();onDelete();}}>
            <Icon.Trash size={11} />
          </HoverIcon>
        </div>
      }
    </div>);

}

function HoverIcon({ title, danger, onClick, children }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: 22, height: 22, padding: 0, borderRadius: 5,
      border: 'none', background: 'transparent',
      color: 'var(--ink-soft)', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = danger ? 'var(--danger-tint)' : 'var(--surface-raised)';
      e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--ink)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--ink-soft)';
    }}>
      
      {children}
    </button>);

}

/* ---------- SlotEditor — expanded inline editor for a slot ---------- */
function SlotEditor({ row, fields, onCellChange, onCapacity, onAddOption, onDelete, onDuplicate, onClose }) {
  return (
    <div style={{ padding: '12px 14px 14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)',
          letterSpacing: '0.08em', textTransform: 'uppercase'
        }}>Editing slot</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onDuplicate} style={tinyBtn} title="Duplicate slot">
            <Icon.Copy size={11} /> Duplicate
          </button>
          <button onClick={onDelete} style={{ ...tinyBtn, color: 'var(--danger)' }} title="Delete slot">
            <Icon.Trash size={11} /> Delete
          </button>
          <button onClick={onClose} style={{ ...tinyBtn, color: 'var(--brand)' }} title="Done">
            <Icon.Check size={11} /> Done
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {fields.map((f) => {
          const TIcon = TYPE_META[f.type].icon;
          return (
            <label key={f.id} style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              fontSize: 11, color: 'var(--ink-muted)'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TIcon size={10} style={{ color: 'var(--ink-soft)' }} />
                {f.name}
              </span>
              {f.type === 'enum' ?
              <EnumPicker
                value={row.values[f.id] ?? ''}
                options={f.options || []}
                onChange={(v) => onCellChange(f.id, v)}
                onAddOption={(v) => {
                  onAddOption && onAddOption(f.id, v);
                  onCellChange(f.id, v);
                }} /> :


              <input
                value={row.values[f.id] ?? ''}
                placeholder={TYPE_META[f.type].hint}
                onChange={(e) => onCellChange(f.id, e.target.value)}
                style={{
                  border: '1px solid var(--surface-sunk)', borderRadius: 8,
                  padding: '6px 10px', fontFamily: 'inherit', fontSize: 13,
                  background: 'white', color: 'var(--ink)', outline: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--surface-sunk)'} />

              }
            </label>);

        })}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--ink-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon.Hash size={10} style={{ color: 'var(--ink-soft)' }} /> Capacity
          </span>
          <input
            type="number" min={1}
            value={row.capacity}
            onChange={(e) => onCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{
              border: '1px solid var(--surface-sunk)', borderRadius: 8,
              padding: '6px 10px', fontFamily: 'inherit', fontSize: 13,
              background: 'white', color: 'var(--ink)', outline: 'none',
              width: 70
            }} />
          
        </label>
      </div>
    </div>);

}

/* ---------- EnumPicker — list-field dropdown with inline "+ Add to list" ---------- */
function EnumPicker({ value, options, onChange, onAddOption }) {
  const [open, setOpen] = useStateWY(false);
  const [adding, setAdding] = useStateWY(false);
  const [draft, setDraft] = useStateWY('');
  const inputRef = useRefWY(null);

  useEffectWY(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const close = () => { setOpen(false); setAdding(false); setDraft(''); };
  const commit = () => {
    const v = draft.trim();
    if (v) onAddOption(v);
    close();
  };

  return (
    <div style={{ position: 'relative' }} data-comment-anchor="c3d8e9fc08-select-468-15">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          border: '1px solid ' + (open ? 'var(--brand)' : 'var(--surface-sunk)'),
          borderRadius: 8,
          padding: '6px 8px 6px 10px',
          fontFamily: 'inherit', fontSize: 13,
          background: 'white', color: value ? 'var(--ink)' : 'var(--ink-soft)',
          outline: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, width: '100%', textAlign: 'left'
        }}>
        
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || 'Choose…'}
        </span>
        <Icon.ChevronDown size={11} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
      </button>

      {open &&
      <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: 'white', border: '1px solid var(--surface-sunk)',
          borderRadius: 10, padding: 4, minWidth: 180,
          boxShadow: 'var(--shadow-card)',
          maxHeight: 240, overflowY: 'auto'
        }}>
            {options.length === 0 && !adding &&
          <div style={{
            padding: '8px 10px', fontSize: 11, color: 'var(--ink-soft)',
            fontStyle: 'italic'
          }}>
                No items yet.
              </div>
          }
            {options.map((opt) =>
          <EnumPickItem
            key={opt}
            label={opt}
            active={opt === value}
            onPick={() => { onChange(opt); close(); }} />

          )}
            {options.length > 0 &&
          <div style={{ height: 1, background: 'var(--surface-sunk)', margin: '4px 0' }} />
          }
            {adding ?
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px 4px 10px',
            background: 'var(--brand-tint)', borderRadius: 6
          }}>
                <Icon.Plus size={11} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); close(); }
              }}
              onBlur={commit}
              placeholder="New item name"
              style={{
                flex: 1, minWidth: 0,
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'inherit', fontSize: 12, color: 'var(--ink)',
                padding: '4px 0'
              }} />
              
              </div> :

          <button
            onClick={() => setAdding(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', border: 'none',
              background: 'transparent', color: 'var(--brand)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              borderRadius: 6, fontFamily: 'inherit', textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--brand-tint)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              
                <Icon.Plus size={12} />
                <span>Add to list</span>
              </button>
          }
          </div>
        </>
      }
    </div>);

}

function EnumPickItem({ label, active, onPick }) {
  return (
    <button onClick={onPick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', border: 'none',
      background: active ? 'var(--brand-tint)' : 'transparent',
      color: active ? 'var(--brand)' : 'var(--ink)',
      fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
      borderRadius: 6, fontFamily: 'inherit', textAlign: 'left'
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-raised)'; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ width: 12, display: 'inline-flex', flexShrink: 0 }}>
        {active && <Icon.Check size={11} />}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>);

}

/* ---------- SlotSidePanel — used when fields.length >= SIDE_PANEL_THRESHOLD ---------- */
function SlotSidePanel({
  row, fields,
  onCellChange, onCapacity, onAddOption,
  onDelete, onDuplicate, onClose
}) {
  useEffectWY(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 0, bottom: 0, right: 0, zIndex: 30,
      width: 380, maxWidth: '92vw',
      background: 'white',
      borderLeft: '3px solid var(--brand)',
      boxShadow: '-12px 0 32px rgba(11,18,32,0.12)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight var(--duration-base) ease'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--surface-sunk)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--brand-tint)', color: 'var(--brand)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 9999
          }}>
            <Icon.Pencil size={9} />
            Editing slot
          </span>
        </div>
        <button onClick={onClose} title="Close (Esc)" aria-label="Close" style={{
          width: 26, height: 26, padding: 0, borderRadius: 6,
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--ink-soft)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--ink)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}>
          <Icon.X size={13} />
        </button>
      </div>

      {/* Body — full-width single column form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((f) => {
            const TIcon = TYPE_META[f.type].icon;
            return (
              <label key={f.id} style={{
                display: 'flex', flexDirection: 'column', gap: 5,
                fontSize: 11, color: 'var(--ink-muted)'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <TIcon size={11} style={{ color: 'var(--ink-soft)' }} />
                  {f.name}
                </span>
                {f.type === 'enum' ?
                <EnumPicker
                  value={row.values[f.id] ?? ''}
                  options={f.options || []}
                  onChange={(v) => onCellChange(f.id, v)}
                  onAddOption={(v) => { onAddOption && onAddOption(f.id, v); onCellChange(f.id, v); }} /> :

                <input
                  value={row.values[f.id] ?? ''}
                  placeholder={TYPE_META[f.type].hint}
                  onChange={(e) => onCellChange(f.id, e.target.value)}
                  style={{
                    border: '1px solid var(--surface-sunk)', borderRadius: 8,
                    padding: '8px 12px', fontFamily: 'inherit', fontSize: 14,
                    background: 'white', color: 'var(--ink)', outline: 'none'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--surface-sunk)'} />

                }
              </label>);

          })}
          <label style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            fontSize: 11, color: 'var(--ink-muted)'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
              <Icon.Hash size={11} style={{ color: 'var(--ink-soft)' }} />
              Capacity
            </span>
            <input
              type="number" min={1}
              value={row.capacity}
              onChange={(e) => onCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{
                border: '1px solid var(--surface-sunk)', borderRadius: 8,
                padding: '8px 12px', fontFamily: 'inherit', fontSize: 14,
                background: 'white', color: 'var(--ink)', outline: 'none',
                width: 100
              }} />
          </label>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--surface-sunk)',
        background: 'var(--surface-raised)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onDuplicate} style={{ ...btnSec, padding: '6px 12px', fontSize: 12 }}>
            <Icon.Copy size={11} /> Duplicate
          </button>
          <button onClick={onDelete} style={{
            ...btnSec, padding: '6px 12px', fontSize: 12, color: 'var(--danger)'
          }}>
            <Icon.Trash size={11} /> Delete
          </button>
        </div>
        <button onClick={onClose} style={{ ...btnPri, padding: '6px 16px', fontSize: 12 }}>
          <Icon.Check size={11} /> Done
        </button>
      </div>
    </div>);

}

const tinyBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
  color: 'var(--ink-muted)',
  padding: '3px 6px', borderRadius: 6
};

/* ---------- FieldsPopover — centered modal for editing the schema ---------- */
function FieldsPopover({
  fields, reorder, groupByPref, resolvedGroupField, onGroupByChange,
  onClose, onSaveField, onChangeType, onDelete
}) {
  // Inline editor state — null = list view; { mode, field? } = inline form view.
  const [editing, setEditing] = useStateWY(null);
  const dialogRef = useRefWY(null);

  // Focus the dialog on open; Esc closes.
  useEffectWY(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = el.querySelector('button, [tabindex="0"], input');
    first?.focus?.();
  }, []);

  useEffectWY(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groupLabel = groupByPref === '__none__' ?
  'Don\u2019t group' :
  groupByPref === 'auto' ?
  resolvedGroupField ? `${resolvedGroupField.name} (auto)` : 'Don\u2019t group' :
  fields.find((f) => f.id === groupByPref)?.name ?? 'Don\u2019t group';

  return (
    <div
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(11,18,32,0.32)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px 16px'
      }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Fields"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          border: '1px solid var(--surface-sunk)',
          borderRadius: 'var(--radius-xl)',
          padding: 16,
          width: 420, maxWidth: '100%',
          maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(11,18,32,0.24)'
        }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)',
            letterSpacing: '0.06em', textTransform: 'uppercase'
          }}>
            {editing ? (editing.mode === 'edit' ? 'Edit field' : 'New field') : `Fields · ${fields.length}`}
          </span>
          <button onClick={onClose} title="Close (Esc)" aria-label="Close" style={{
            width: 26, height: 26, padding: 0, borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ink-soft)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}>
            <Icon.X size={13} />
          </button>
        </div>

        {editing ?
        <InlineFieldForm
          mode={editing.mode}
          field={editing.field}
          onCancel={() => setEditing(null)}
          onSave={(updated) => {
            onSaveField(editing.mode === 'edit' ? { ...editing.field, ...updated } : updated);
            setEditing(null);
          }}
          onDelete={editing.mode === 'edit' ? () => {
            onDelete(editing.field.id);
            setEditing(null);
          } : null} /> :


        <>
            {/* Group by row */}
            <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '4px 4px 12px',
            borderBottom: '1px solid var(--surface-sunk)', marginBottom: 12
          }}>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 500 }}>Group slots by</span>
              <GroupByInlinePicker
              fields={fields}
              value={groupByPref}
              label={groupLabel}
              onChange={onGroupByChange} />
            </div>

            <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8
          }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Drag to reorder
              </span>
              <button onClick={() => setEditing({ mode: 'create' })} style={{
              ...btnSec, padding: '4px 11px', fontSize: 12
            }}>
                <Icon.Plus size={11} /> Add field
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fields.map((f) => {
              const TIcon = TYPE_META[f.type].icon;
              const isDragging = reorder.dragId === f.id;
              const isDropTarget = reorder.overId === f.id && reorder.dragId && reorder.dragId !== f.id;
              return (
                <div key={f.id}
                {...reorder.target(f.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 8px 8px 4px', borderRadius: 8,
                  background: isDragging ? 'var(--brand-tint)' : 'var(--surface-raised)',
                  border: '1px solid ' + (isDropTarget ? 'var(--brand)' : 'transparent'),
                  opacity: isDragging ? 0.5 : 1,
                  transition: 'border-color var(--duration-fast)'
                }}>
                      <span
                    {...reorder.source(f.id)}
                    title="Drag to reorder"
                    style={{
                      cursor: 'grab', color: 'var(--ink-soft)',
                      display: 'inline-flex', padding: 4
                    }}>
                        <Icon.Grip size={11} />
                      </span>
                      <span style={{ color: 'var(--brand)', display: 'inline-flex' }}>
                        <TIcon size={13} />
                      </span>
                      <button onClick={() => setEditing({ mode: 'edit', field: f })} style={{
                    flex: 1, textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
                    padding: 0
                  }}>
                        {f.name}
                      </button>
                      <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        {f.type === 'enum' && f.options?.length ?
                    `${TYPE_META[f.type].label} · ${f.options.length}` :
                    TYPE_META[f.type].label}
                      </span>
                      <button onClick={() => onDelete(f.id)} title="Delete field"
                  style={{
                    width: 22, height: 22, padding: 0, borderRadius: 4,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--ink-soft)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ink-soft)'}>
                        <Icon.X size={11} />
                      </button>
                    </div>);

            })}
            </div>
          </>
        }
      </div>
    </div>);

}

/* ---------- InlineFieldForm — add/edit a field inside the dock ---------- */
function InlineFieldForm({ mode, field, onSave, onDelete, onCancel }) {
  const [name, setName] = useStateWY(field?.name ?? '');
  const [type, setType] = useStateWY(field?.type ?? 'text');
  const nameRef = useRefWY(null);

  useEffectWY(() => {nameRef.current?.focus();nameRef.current?.select?.();}, []);

  const save = () => {
    const payload = { name: name.trim() || 'Untitled', type };
    // List items live in the slot editor now — just seed an empty array
    // for brand-new enum fields so the picker has something to push into.
    if (type === 'enum' && mode !== 'edit') payload.options = [];
    onSave(payload);
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10
      }}>
        <button onClick={onCancel} title="Back to fields" style={{
          width: 22, height: 22, padding: 0, borderRadius: 6,
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--ink-muted)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}
        onMouseEnter={(e) => {e.currentTarget.style.background = 'var(--surface-raised)';}}
        onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent';}}>
          <Icon.ArrowLeft size={12} />
        </button>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)',
          letterSpacing: '0.06em', textTransform: 'uppercase'
        }}>{mode === 'edit' ? 'Edit field' : 'New field'}</span>
      </div>

      <label style={{ display: 'block', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 500 }}>Name</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {if (e.key === 'Enter') save();if (e.key === 'Escape') onCancel();}}
          placeholder="e.g. Teacher, Subject, Item"
          style={{
            marginTop: 3, width: '100%', boxSizing: 'border-box',
            padding: '5px 8px', borderRadius: 6,
            border: '1px solid var(--surface-sunk)',
            fontFamily: 'inherit', fontSize: 12, outline: 'none',
            background: 'white', color: 'var(--ink)'
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--surface-sunk)'} />
        
      </label>

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 500 }}>Type</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 3 }}>
          {TYPE_KEYS.map((t) => {
            const TIcon = TYPE_META[t].icon;
            const active = type === t;
            return (
              <button key={t} onClick={() => setType(t)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 7px', borderRadius: 6,
                border: '1px solid ' + (active ? 'var(--brand)' : 'var(--surface-sunk)'),
                background: active ? 'var(--brand-tint)' : 'white',
                color: active ? 'var(--brand)' : 'var(--ink)',
                fontSize: 11, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit'
              }}>
                <TIcon size={10} />
                {TYPE_META[t].label}
              </button>);

          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div>
          {onDelete &&
          <button onClick={onDelete} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--danger)', fontSize: 11, fontWeight: 500, padding: 0
          }}>Remove field</button>
          }
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={onCancel} style={{
            ...btnSec, padding: '4px 10px', fontSize: 11
          }}>Cancel</button>
          <button onClick={save} style={{
            ...btnPri, padding: '4px 12px', fontSize: 11
          }}>{mode === 'edit' ? 'Save' : 'Add field'}</button>
        </div>
      </div>
    </div>);

}

/* ---------- GroupByInlinePicker — small dropdown inside the Fields dock ---------- */
function GroupByInlinePicker({ fields, value, label, onChange }) {
  const [open, setOpen] = useStateWY(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px',
        background: 'white', border: '1px solid var(--surface-sunk)',
        borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, color: 'var(--ink)', fontWeight: 500
      }}>
        {label}
        <Icon.ChevronDown size={11} />
      </button>
      {open &&
      <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40,
          background: 'white', border: '1px solid var(--surface-sunk)',
          borderRadius: 10, padding: 4, minWidth: 200,
          boxShadow: 'var(--shadow-card)'
        }}>
            <DockPickItem active={value === 'auto'} icon={<Icon.Sparkles size={12} />} label="Auto"
          onClick={() => {onChange('auto');setOpen(false);}} />
            <div style={{ height: 1, background: 'var(--surface-sunk)', margin: '4px 0' }} />
            {fields.filter((f) => f.type === 'date' || f.type === 'enum' || f.type === 'text').map((f) => {
            const TIcon = TYPE_META[f.type].icon;
            return (
              <DockPickItem key={f.id} active={value === f.id}
              icon={<TIcon size={12} />}
              label={f.name}
              onClick={() => {onChange(f.id);setOpen(false);}} />);


          })}
            <div style={{ height: 1, background: 'var(--surface-sunk)', margin: '4px 0' }} />
            <DockPickItem active={value === '__none__'} icon={<Icon.List size={12} />} label="Don\u2019t group"
          onClick={() => {onChange('__none__');setOpen(false);}} />
          </div>
        </>
      }
    </div>);

}

function DockPickItem({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', border: 'none',
      background: active ? 'var(--brand-tint)' : 'transparent',
      color: active ? 'var(--brand)' : 'var(--ink)',
      fontSize: 12, fontWeight: 500, cursor: 'pointer',
      borderRadius: 6, fontFamily: 'inherit', textAlign: 'left'
    }}>
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>);

}

/* ---------- Editable — clean inline-edit primitive ---------- */
function Editable({ value, display, onChange, placeholder, multiline, withEdit, editSize = 11, style }) {
  const [editing, setEditing] = useStateWY(false);
  const [draft, setDraft] = useStateWY(value);
  const ref = useRefWY(null);

  useEffectWY(() => {if (!editing) setDraft(value);}, [value, editing]);
  useEffectWY(() => {if (editing && ref.current) {ref.current.focus();ref.current.select?.();}}, [editing]);

  const commit = () => {onChange(draft);setEditing(false);};
  const cancel = () => {setDraft(value);setEditing(false);};

  const baseStyle = {
    fontFamily: 'inherit',
    border: 'none', outline: 'none',
    background: 'transparent',
    width: '100%', resize: 'none',
    ...style
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {if (e.key === 'Escape') cancel();}}
          rows={Math.max(2, draft.split('\n').length)}
          style={{ ...baseStyle, background: 'var(--brand-tint)', borderRadius: 4, padding: style?.padding || '4px 6px' }}
          placeholder={placeholder} />);


    }
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {e.preventDefault();commit();}
          if (e.key === 'Escape') cancel();
        }}
        style={{ ...baseStyle, background: 'var(--brand-tint)', borderRadius: 4, padding: style?.padding || '4px 6px' }}
        placeholder={placeholder} />);


  }
  return (
    <span
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();setEditing(true);}}}
      style={{
        ...style,
        cursor: 'text',
        borderRadius: 4,
        transition: 'background var(--duration-fast)'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--brand-tint)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      onFocus={(e) => e.currentTarget.style.background = 'var(--brand-tint)'}
      onBlur={(e) => e.currentTarget.style.background = 'transparent'}>

      {display ?? (value || <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontWeight: 400 }}>{placeholder}</span>)}
    </span>);

}

function prettyHeader(raw, field) {
  if (!raw || raw === '__empty__') return 'Set a date';
  if (!field || field.type !== 'date') return raw;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return raw;
  const [_, mo, d, y] = m;
  const dt = new Date(+y, +mo - 1, +d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

window.OptionBWysiwyg = OptionBWysiwyg;