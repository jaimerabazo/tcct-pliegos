// Primitivas de formulario usadas en el modo edición de Analysis. Mismo estilo que
// el modo lectura para que la edición no desentone visualmente.
const fieldStyle = { borderColor: '#E5E9F0', color: '#001B4B' };

export const TextField = ({ value, onChange, mono = false, className = '' }) => (
  <input
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`w-full px-2.5 py-1.5 rounded-md border text-[13px] ${className}`}
    style={{ ...fieldStyle, fontFamily: mono ? '"JetBrains Mono", monospace' : undefined }}
  />
);

export const NumberField = ({ value, onChange, mono = true, className = '' }) => (
  <input
    type="number"
    value={value ?? ''}
    onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    className={`w-full px-2.5 py-1.5 rounded-md border text-[13px] ${className}`}
    style={{ ...fieldStyle, fontFamily: mono ? '"JetBrains Mono", monospace' : undefined }}
  />
);

export const TextAreaField = ({ value, onChange, rows = 3, className = '' }) => (
  <textarea
    value={value}
    onChange={e => onChange(e.target.value)}
    rows={rows}
    className={`w-full px-2.5 py-1.5 rounded-md border text-[13px] ${className}`}
    style={{ ...fieldStyle, lineHeight: 1.5 }}
  />
);

export const SelectField = ({ value, onChange, options, className = '' }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`w-full px-2.5 py-1.5 rounded-md border text-[13px] bg-white ${className}`}
    style={fieldStyle}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const FieldLabel = ({ children }) => (
  <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>{children}</div>
);
