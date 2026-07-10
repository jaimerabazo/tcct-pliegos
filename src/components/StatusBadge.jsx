export const StatusBadge = ({ estado }) => {
  const config = {
    analizado: { label: 'Analizado', bg: '#E6F4EE', text: '#0A6B4A', dot: '#00A67C' },
    procesando: { label: 'Procesando', bg: '#E6EEFF', text: '#0044CC', dot: '#0066FF' },
    revision: { label: 'En revisión', bg: '#FFF3E0', text: '#8A4A00', dot: '#F5A623' },
    error: { label: 'Error', bg: '#FCEBEB', text: '#8B1F1F', dot: '#E24B4A' },
  }[estado];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs" style={{ background: config.bg, color: config.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot, animation: estado === 'procesando' ? 'pulse 2s infinite' : 'none' }} />
      {config.label}
    </span>
  );
};
