import { LayoutDashboard, FileSearch, Settings, Wand2, Sparkles } from 'lucide-react';

export const Sidebar = ({ view, setView }) => (
  <aside className="w-56 shrink-0 border-r flex flex-col" style={{ borderColor: '#E5E9F0', background: '#F5F7FA' }}>
    <div className="p-5 border-b" style={{ borderColor: '#E5E9F0' }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: '#0066FF' }}>
          <FileSearch size={16} color="white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[13px] leading-tight" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, color: '#001B4B', letterSpacing: '-0.01em' }}>
            TCCT Pliegos
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Presales Suite</div>
        </div>
      </div>
    </div>

    <nav className="p-3 flex-1">
      <div className="text-[10px] uppercase tracking-wider px-2 py-2 mb-1" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Workspace</div>
      {[
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'analysis-list', icon: FileSearch, label: 'Análisis' },
      ].map(item => {
        const active = view === item.id || (item.id === 'dashboard' && view === 'analysis');
        return (
          <button
            key={item.id}
            onClick={() => setView('dashboard')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition mb-0.5"
            style={{
              background: active ? '#0066FF' : 'transparent',
              color: active ? 'white' : '#001B4B',
              fontWeight: active ? 500 : 400,
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#EDF2F9'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <item.icon size={15} strokeWidth={active ? 2.2 : 1.8} />
            {item.label}
          </button>
        );
      })}

      <div className="text-[10px] uppercase tracking-wider px-2 py-2 mb-1 mt-4" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Herramientas</div>
      {[
        { icon: Wand2, label: 'Generador RFP' },
        { icon: Sparkles, label: 'Casos éxito' },
        { icon: Settings, label: 'Configuración' },
      ].map(item => (
        <button key={item.label} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition mb-0.5" style={{ color: '#5B6478' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#EDF2F9'; e.currentTarget.style.color = '#001B4B'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5B6478'; }}>
          <item.icon size={15} strokeWidth={1.8} />
          {item.label}
        </button>
      ))}
    </nav>

    <div className="p-3 border-t" style={{ borderColor: '#E5E9F0' }}>
      <div className="flex items-center gap-2.5 p-2 rounded-md" style={{ background: 'white' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px]" style={{ background: '#001B4B', color: 'white', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500 }}>
          JC
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] truncate" style={{ color: '#001B4B', fontWeight: 500 }}>Jaime Carrasco</div>
          <div className="text-[10px] truncate" style={{ color: '#5B6478' }}>Presales · TCCT</div>
        </div>
      </div>
    </div>
  </aside>
);
