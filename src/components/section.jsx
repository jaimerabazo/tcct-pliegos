// Piezas compartidas de las tarjetas de análisis: la tarjeta, su título con acciones,
// los botones de editar/guardar/cancelar y el badge de confianza.
import { Pencil } from 'lucide-react';
import { theme } from '../theme.js';

export const ConfidenceBadge = ({ value }) => {
  const color = value >= 95 ? theme.confidence.high : value >= 90 ? theme.confidence.mid : theme.confidence.low;
  return (
    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: theme.textMuted }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {value}%
    </span>
  );
};

export const SectionCard = ({ children, className = '' }) => (
  <div className={`rounded-lg border p-6 ${className}`} style={{ borderColor: theme.border, background: theme.card }}>
    {children}
  </div>
);

export const SectionTitle = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex items-start justify-between mb-5">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} color={theme.link} strokeWidth={2} />
        <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '16px', color: theme.text, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
      </div>
      {subtitle && <p className="text-[12px]" style={{ color: theme.textMuted }}>{subtitle}</p>}
    </div>
    {actions}
  </div>
);

export const EditButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12px] transition shrink-0"
    style={{ borderColor: theme.border, color: theme.textMuted }}
    onMouseEnter={e => { e.currentTarget.style.color = theme.link; e.currentTarget.style.borderColor = theme.link; }}
    onMouseLeave={e => { e.currentTarget.style.color = theme.textMuted; e.currentTarget.style.borderColor = theme.border; }}
  >
    <Pencil size={12} strokeWidth={1.8} />
    Editar
  </button>
);

export const SaveCancelButtons = ({ onSave, onCancel, saving = false }) => (
  <div className="flex items-center gap-2 shrink-0">
    <button
      onClick={onCancel}
      disabled={saving}
      className="px-2.5 py-1.5 rounded-md text-[12px] transition disabled:opacity-60"
      style={{ color: theme.textMuted }}
      onMouseEnter={e => { if (!saving) e.currentTarget.style.background = theme.muted; }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      Cancelar
    </button>
    <button
      onClick={onSave}
      disabled={saving}
      className="px-2.5 py-1.5 rounded-md text-[12px] transition disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
      onMouseEnter={e => { if (!saving) e.currentTarget.style.background = theme.primaryHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = theme.primary; }}
    >
      {saving ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
);
