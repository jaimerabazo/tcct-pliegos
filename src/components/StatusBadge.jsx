import { theme } from '../theme.js';

export const StatusBadge = ({ estado }) => {
  const config = {
    analizado: { label: 'Analizado', bg: theme.successBg, text: theme.successText, dot: theme.success },
    procesando: { label: 'Procesando', bg: theme.infoBg, text: theme.infoText, dot: theme.info },
    revision: { label: 'En revisión', bg: theme.warningBg, text: theme.warningText, dot: theme.warning },
    error: { label: 'Error', bg: theme.errorBg, text: theme.errorText, dot: theme.error },
  }[estado];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs" style={{ background: config.bg, color: config.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot, animation: estado === 'procesando' ? 'pulse 2s infinite' : 'none' }} />
      {config.label}
    </span>
  );
};
