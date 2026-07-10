// Piezas compartidas de las tarjetas de análisis: la tarjeta, su título con acciones,
// los botones de editar/guardar/cancelar y el badge de confianza.
import { Pencil } from 'lucide-react';

export const ConfidenceBadge = ({ value }) => {
  const color = value >= 95 ? '#00A67C' : value >= 90 ? '#7FA800' : '#F5A623';
  return (
    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#5B6478' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {value}%
    </span>
  );
};

export const SectionCard = ({ children, className = '' }) => (
  <div className={`rounded-lg border p-6 ${className}`} style={{ borderColor: '#E5E9F0', background: 'white' }}>
    {children}
  </div>
);

export const SectionTitle = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex items-start justify-between mb-5">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} color="#0066FF" strokeWidth={2} />
        <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '16px', color: '#001B4B', letterSpacing: '-0.01em' }}>
          {title}
        </h3>
      </div>
      {subtitle && <p className="text-[12px]" style={{ color: '#5B6478' }}>{subtitle}</p>}
    </div>
    {actions}
  </div>
);

export const EditButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12px] transition shrink-0"
    style={{ borderColor: '#E5E9F0', color: '#5B6478' }}
    onMouseEnter={e => { e.currentTarget.style.color = '#0066FF'; e.currentTarget.style.borderColor = '#0066FF'; }}
    onMouseLeave={e => { e.currentTarget.style.color = '#5B6478'; e.currentTarget.style.borderColor = '#E5E9F0'; }}
  >
    <Pencil size={12} strokeWidth={1.8} />
    Editar
  </button>
);

export const SaveCancelButtons = ({ onSave, onCancel }) => (
  <div className="flex items-center gap-2 shrink-0">
    <button
      onClick={onCancel}
      className="px-2.5 py-1.5 rounded-md text-[12px] transition"
      style={{ color: '#5B6478' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F5F7FA'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      Cancelar
    </button>
    <button
      onClick={onSave}
      className="px-2.5 py-1.5 rounded-md text-[12px] transition"
      style={{ background: '#0066FF', color: 'white', fontWeight: 500 }}
      onMouseEnter={e => e.currentTarget.style.background = '#0044CC'}
      onMouseLeave={e => e.currentTarget.style.background = '#0066FF'}
    >
      Guardar
    </button>
  </div>
);
