import {
  Search, Plus, TrendingUp, Euro, CheckCircle2, ChevronRight, Filter, FileText,
} from 'lucide-react';
import { formatEuro, formatEuroFull, computeDashboardKpis } from '../logic.js';
import { StatusBadge } from '../components/StatusBadge.jsx';

const KpiCard = ({ label, value, delta, icon: Icon, mono }) => (
  <div className="p-5 rounded-lg border" style={{ borderColor: '#E5E9F0', background: 'white' }}>
    <div className="flex items-start justify-between mb-3">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>{label}</div>
      <Icon size={14} color="#5B6478" strokeWidth={1.8} />
    </div>
    <div style={{ fontFamily: mono ? '"JetBrains Mono", monospace' : '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '26px', color: '#001B4B', letterSpacing: '-0.02em', lineHeight: 1 }}>
      {value}
    </div>
    {delta && (
      <div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: delta.startsWith('+') ? '#00A67C' : '#E24B4A' }}>
        <TrendingUp size={11} strokeWidth={2} />
        {delta} vs mes anterior
      </div>
    )}
  </div>
);

const OrganismoBar = ({ organismo, importe, pct }) => (
  <div>
    <div className="flex items-center justify-between gap-3 mb-1.5">
      <span className="text-[12.5px] truncate" style={{ color: '#001B4B' }}>{organismo}</span>
      <span className="text-[12.5px] shrink-0" style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, color: '#001B4B' }}>
        {formatEuro(importe)}
      </span>
    </div>
    <div
      className="h-2 rounded-full overflow-hidden"
      style={{ background: '#F0F2F5' }}
      title={formatEuroFull(importe)}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#0066FF' }} />
    </div>
  </div>
);

export const Dashboard = ({ pliegos, onSelect, onNewAnalysis }) => {
  const kpis = computeDashboardKpis(pliegos);
  const importePorOrganismo = Object.values(
    pliegos.reduce((acc, p) => {
      if (!acc[p.organismo]) acc[p.organismo] = { organismo: p.organismo, importe: 0 };
      acc[p.organismo].importe += p.importe;
      return acc;
    }, {})
  ).sort((a, b) => b.importe - a.importe);
  const maxImporte = importePorOrganismo[0]?.importe || 1;

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: '#0066FF', letterSpacing: '0.1em', fontWeight: 500 }}>Sector público · Cybersecurity & Cloud</div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '32px', color: '#001B4B', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Analizador de pliegos
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: '#5B6478', maxWidth: '600px' }}>
            Extracción automática de datos estructurados de expedientes de licitación pública. Lotes, perfiles, criterios de adjudicación y penalizaciones en menos de un minuto.
          </p>
        </div>
        <button onClick={onNewAnalysis} className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] transition" style={{ background: '#0066FF', color: 'white', fontWeight: 500 }}
          onMouseEnter={e => e.currentTarget.style.background = '#0044CC'}
          onMouseLeave={e => e.currentTarget.style.background = '#0066FF'}>
          <Plus size={15} strokeWidth={2.2} />
          Nuevo análisis
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard label="Pliegos analizados (mes)" value={kpis.count} delta="+37%" icon={FileText} />
        <KpiCard label="Importe agregado" value={formatEuro(kpis.totalImporte)} delta="+22%" icon={Euro} mono />
        <KpiCard label="Importe medio" value={formatEuro(kpis.avgImporte)} delta="+8%" icon={Euro} mono />
        <KpiCard label="Confianza media" value={`${Math.round(kpis.avgConfianza)}%`} delta="+2%" icon={CheckCircle2} />
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#E5E9F0', background: 'white' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E9F0' }}>
          <div className="flex items-center gap-3">
            <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '15px', color: '#001B4B' }}>
              Expedientes recientes
            </h2>
            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F5F7FA', color: '#5B6478' }}>{pliegos.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-[12px]" style={{ borderColor: '#E5E9F0', color: '#5B6478', width: '240px' }}>
              <Search size={13} strokeWidth={1.8} />
              <span>Buscar por expediente u organismo…</span>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px]" style={{ borderColor: '#E5E9F0', color: '#001B4B' }}>
              <Filter size={12} strokeWidth={1.8} />
              Filtros
            </button>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ background: '#FAFBFC' }}>
              <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Expediente</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Objeto</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Importe</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Lotes</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Cierre</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500, letterSpacing: '0.08em' }}>Estado</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {pliegos.map((p, idx) => (
              <tr key={p.id}
                onClick={() => onSelect(p)}
                className="cursor-pointer transition"
                style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0F2F5' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td className="px-5 py-3.5">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontWeight: 500, color: '#0066FF' }}>
                    {p.expediente}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="text-[13px]" style={{ color: '#001B4B', fontWeight: 500 }}>{p.titulo}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#5B6478' }}>{p.organismo}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="text-[13px]" style={{ color: '#001B4B', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuro(p.importe)}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="text-[13px]" style={{ color: '#001B4B' }}>{p.lotes}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="text-[12px]" style={{ color: '#001B4B' }}>{p.fechaLimite ?? '—'}</div>
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge estado={p.estado} />
                </td>
                <td className="px-3 py-3.5">
                  <ChevronRight size={14} color="#5B6478" strokeWidth={1.8} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border overflow-hidden mt-6" style={{ borderColor: '#E5E9F0', background: 'white' }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#E5E9F0' }}>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '15px', color: '#001B4B' }}>
            Importe por organismo
          </h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F5F7FA', color: '#5B6478' }}>{importePorOrganismo.length}</span>
        </div>
        <div className="p-5 space-y-4">
          {importePorOrganismo.map(o => (
            <OrganismoBar key={o.organismo} organismo={o.organismo} importe={o.importe} pct={(o.importe / maxImporte) * 100} />
          ))}
        </div>
      </div>
    </div>
  );
};
