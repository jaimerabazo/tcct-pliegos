import {
  LayoutDashboard,
  FileSearch,
  Settings,
  Wand2,
  Sparkles,
  LogOut,
  Users,
} from 'lucide-react';
import { theme } from '../theme.js';

// Iniciales para el avatar a partir del email ("jaime.rabazo@x.com" → "JR").
export const emailInitials = (email) => {
  const local = (email || '').split('@')[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const Sidebar = ({ view, setView, user, org, onSignOut }) => (
  <aside className="w-56 shrink-0 border-r flex flex-col" style={{ borderColor: theme.sidebar.border, background: theme.sidebar.bg }}>
    <div className="p-5 border-b" style={{ borderColor: theme.sidebar.border }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: theme.link }}>
          <FileSearch size={16} color={theme.white} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[13px] leading-tight" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, color: theme.white, letterSpacing: '-0.01em' }}>
            TCCT Pliegos
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: theme.sidebar.text, letterSpacing: '0.08em' }}>Presales Suite</div>
        </div>
      </div>
    </div>

    <nav className="p-3 flex-1">
      <div className="text-[10px] uppercase tracking-wider px-2 py-2 mb-1" style={{ color: theme.sidebar.text, letterSpacing: '0.08em' }}>Workspace</div>
      {[
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'analysis', icon: FileSearch, label: 'Análisis' },
        ...(org?.role === 'owner'
          ? [{ id: 'team', icon: Users, label: 'Equipo' }]
          : []),
      ].map(item => {
        const active = view === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition mb-0.5"
            style={{
              background: active ? theme.sidebar.activeBg : 'transparent',
              color: active ? theme.sidebar.textActive : theme.sidebar.text,
              fontWeight: active ? 500 : 400,
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = theme.sidebar.hover; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <item.icon size={15} strokeWidth={active ? 2.2 : 1.8} />
            {item.label}
          </button>
        );
      })}

      <div className="text-[10px] uppercase tracking-wider px-2 py-2 mb-1 mt-4" style={{ color: theme.sidebar.text, letterSpacing: '0.08em' }}>Herramientas</div>
      {[
        { icon: Wand2, label: 'Generador RFP' },
        { icon: Sparkles, label: 'Casos éxito' },
        { icon: Settings, label: 'Configuración' },
      ].map(item => (
        <button key={item.label} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition mb-0.5" style={{ color: theme.sidebar.text }}
          onMouseEnter={e => { e.currentTarget.style.background = theme.sidebar.hover; e.currentTarget.style.color = theme.sidebar.textActive; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.sidebar.text; }}>
          <item.icon size={15} strokeWidth={1.8} />
          {item.label}
        </button>
      ))}
    </nav>

    <div className="p-3 border-t" style={{ borderColor: theme.sidebar.border }}>
      <div className="flex items-center gap-2.5 p-2 rounded-md" style={{ background: theme.sidebar.hover }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] shrink-0" style={{ background: theme.sidebar.activeBg, color: theme.white, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500 }}>
          {emailInitials(user?.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] truncate" style={{ color: theme.white, fontWeight: 500 }} title={user?.email}>
            {user?.email || 'Sesión activa'}
          </div>
          <div className="text-[10px] truncate" style={{ color: theme.sidebar.text }}>Presales Suite</div>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-md transition shrink-0"
            style={{ color: theme.sidebar.text }}
            onMouseEnter={e => { e.currentTarget.style.background = theme.sidebar.activeBg; e.currentTarget.style.color = theme.white; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.sidebar.text; }}
          >
            <LogOut size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </div>
  </aside>
);
