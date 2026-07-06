import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, FileSearch, Settings, Search, Plus, ArrowLeft,
  Download, Wand2, ChevronRight, TrendingUp, Clock, Euro, CheckCircle2,
  Package, Users, Shield, Scale, AlertTriangle, Calendar, FileText,
  Zap, ArrowUpRight, Filter, MoreHorizontal, Sparkles, Building2,
  UploadCloud, X, Loader2
} from 'lucide-react';

// ---------- MOCK DATA ----------

const MOCK_PLIEGOS = [
  {
    id: '2026-7008',
    expediente: '2026/7008',
    titulo: 'Soporte Técnico de Sistemas',
    organismo: 'GISS · Seguridad Social',
    fechaAnalisis: '04 jul 2026',
    fechaLimite: '15 jul 2026',
    importe: 18500000,
    lotes: 3,
    estado: 'analizado',
    procedimiento: 'Abierto SARA',
    ens: 'Alto'
  },
  {
    id: '2026-4521',
    expediente: '2026/4521',
    titulo: 'Modernización de la plataforma EDR/XDR',
    organismo: 'AGE · Ministerio Interior',
    fechaAnalisis: '02 jul 2026',
    fechaLimite: '22 jul 2026',
    importe: 4520000,
    lotes: 1,
    estado: 'analizado',
    procedimiento: 'Abierto',
    ens: 'Alto'
  },
  {
    id: '2026-2145',
    expediente: '2026/2145',
    titulo: 'Renovación firewalls perimetrales Fortinet',
    organismo: 'Ministerio de Justicia',
    fechaAnalisis: '01 jul 2026',
    fechaLimite: '18 jul 2026',
    importe: 3120000,
    lotes: 1,
    estado: 'procesando',
    procedimiento: 'Abierto',
    ens: 'Alto'
  },
  {
    id: '2026-5210',
    expediente: '2026/5210',
    titulo: 'Servicios de ciberseguridad municipales',
    organismo: 'Ajuntament de Barcelona',
    fechaAnalisis: '28 jun 2026',
    fechaLimite: '10 jul 2026',
    importe: 6200000,
    lotes: 1,
    estado: 'revision',
    procedimiento: 'Abierto SARA',
    ens: 'Medio'
  },
  {
    id: '2026-3892',
    expediente: '2026/3892',
    titulo: 'Plataforma SOAR y automatización SOC',
    organismo: 'INAP',
    fechaAnalisis: '25 jun 2026',
    fechaLimite: '05 jul 2026',
    importe: 2820000,
    lotes: 2,
    estado: 'analizado',
    procedimiento: 'Abierto',
    ens: 'Alto'
  },
  {
    id: '2026-6034',
    expediente: '2026/6034',
    titulo: 'Auditoría ENS Nivel Alto',
    organismo: 'Junta de Andalucía',
    fechaAnalisis: '22 jun 2026',
    fechaLimite: '30 jun 2026',
    importe: 1810000,
    lotes: 1,
    estado: 'analizado',
    procedimiento: 'Simplificado',
    ens: 'Alto'
  }
];

const MOCK_ANALYSIS = {
  '2026-7008': {
    resumen: {
      objeto: 'Prestación de servicios de soporte técnico de sistemas para la Gerencia de Informática de la Seguridad Social, incluyendo servicios gestionados y equipos de trabajo STS distribuidos en tres áreas de actuación.',
      cpv: ['72222300-0', '72514300-4', '72220000-3'],
      procedimiento: 'Abierto sujeto a regulación armonizada (SARA)',
      duracion: '48 meses',
      prorrogas: '2 prórrogas de 12 meses cada una'
    },
    lotes: [
      {
        numero: 1,
        descripcion: 'Gestión de la Producción',
        importe: 6200000,
        cpv: '72222300-0',
        confianza: 98
      },
      {
        numero: 2,
        descripcion: 'Gestión de Sistemas',
        importe: 7800000,
        cpv: '72514300-4',
        confianza: 97
      },
      {
        numero: 3,
        descripcion: 'Gestión de Comunicaciones',
        importe: 4500000,
        cpv: '72220000-3',
        confianza: 96
      }
    ],
    perfiles: [
      { codigo: 'TSSX', categoria: 'Técnico Superior Sistemas Expert', headcount: 4, experiencia: 8, certs: ['ITIL Expert', 'CCNP', 'RHCE'], lote: 'Todos', confianza: 95 },
      { codigo: 'TSSA', categoria: 'Técnico Superior Sistemas A', headcount: 8, experiencia: 6, certs: ['ITIL Foundation', 'CCNA'], lote: 'Todos', confianza: 94 },
      { codigo: 'TSSB', categoria: 'Técnico Superior Sistemas B', headcount: 12, experiencia: 4, certs: ['ITIL Foundation'], lote: 'L1, L2', confianza: 92 },
      { codigo: 'TSSC', categoria: 'Técnico Superior Sistemas C', headcount: 6, experiencia: 3, certs: ['ITIL Foundation'], lote: 'L2', confianza: 90 },
      { codigo: 'TMSA', categoria: 'Técnico Medio Sistemas A', headcount: 10, experiencia: 2, certs: [], lote: 'L1, L3', confianza: 88 }
    ],
    solvencia: {
      tecnica: {
        experienciaMinima: '5 proyectos similares en los últimos 5 años',
        volumenNegocio: 20000000,
        clasificacion: 'V-05-d',
        certificaciones: ['ISO 27001', 'ISO 20000-1', 'ENS Alto', 'ISO 9001']
      },
      economica: {
        seguroRC: 3000000,
        capitalMinimo: 5000000
      }
    },
    criterios: [
      { tipo: 'automatico', criterio: 'Precio', peso: 40 },
      { tipo: 'juicio', criterio: 'Metodología y plan de trabajo', peso: 25 },
      { tipo: 'juicio', criterio: 'Composición y experiencia del equipo técnico', peso: 20 },
      { tipo: 'juicio', criterio: 'Plan de transición y transformación', peso: 10 },
      { tipo: 'automatico', criterio: 'Mejoras sobre requisitos mínimos', peso: 5 }
    ],
    penalizaciones: [
      { tipo: 'Retraso en entrega', descripcion: 'Incumplimiento de hito de transición', importe: '2% del importe del hito por semana de retraso' },
      { tipo: 'SLA', descripcion: 'Incumplimiento de nivel de servicio comprometido', importe: 'Hasta 10% de la facturación mensual del lote afectado' },
      { tipo: 'Confidencialidad', descripcion: 'Filtración de información sensible', importe: 'Hasta 20% del importe del contrato + resolución' }
    ],
    plazos: {
      limite: '15 de julio de 2026, 14:00',
      apertura: '17 de julio de 2026',
      formalizacion: '31 de agosto de 2026',
      inicio: '01 de septiembre de 2026',
      hitos: [
        'Kickoff y toma de conocimiento: 1 mes',
        'Fin período de transición: 3 meses',
        'Primera revisión de SLA: 6 meses',
        'Renovación de plantillas críticas: cada 12 meses'
      ]
    },
    marco: {
      ens: 'Nivel Alto',
      ccnStic: ['CCN-STIC 803', 'CCN-STIC 804', 'CCN-STIC 810', 'CCN-STIC 811'],
      normativa: ['RGPD', 'LOPDGDD', 'Real Decreto 311/2022']
    }
  }
};

// ---------- HELPERS ----------

const formatEuro = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M €`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K €`;
  return `${n} €`;
};

const formatEuroFull = (n) => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n);

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const formatShortDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const StatusBadge = ({ estado }) => {
  const config = {
    analizado: { label: 'Analizado', bg: '#E6F4EE', text: '#0A6B4A', dot: '#00A67C' },
    procesando: { label: 'Procesando', bg: '#E6EEFF', text: '#0044CC', dot: '#0066FF' },
    revision: { label: 'En revisión', bg: '#FFF3E0', text: '#8A4A00', dot: '#F5A623' },
    error: { label: 'Error', bg: '#FCEBEB', text: '#8B1F1F', dot: '#E24B4A' }
  }[estado];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs" style={{ background: config.bg, color: config.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot, animation: estado === 'procesando' ? 'pulse 2s infinite' : 'none' }} />
      {config.label}
    </span>
  );
};

// ---------- SIDEBAR ----------

const Sidebar = ({ view, setView }) => (
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
              fontWeight: active ? 500 : 400
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

// ---------- UPLOAD MODAL ----------

const UPLOAD_STEPS = [
  'Extrayendo texto del documento…',
  'Identificando lotes y códigos CPV…',
  'Detectando perfiles profesionales requeridos…',
  'Analizando criterios de adjudicación…',
  'Consolidando resultados…'
];

const UploadModal = ({ open, onClose, onComplete }) => {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setDragging(false);
    setError('');
    setProcessing(false);
    setStepIndex(0);
    setProgress(0);
    setAnalysisError('');
  };

  const handleClose = () => {
    if (processing) return;
    reset();
    onClose();
  };

  const validateAndSetFile = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se admiten archivos PDF.');
      return;
    }
    setError('');
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    validateAndSetFile(e.dataTransfer.files?.[0]);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalysisError('');
    setProcessing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Filename': encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const fallback = `No se ha podido analizar el documento. HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`;
        throw new Error(body?.error || fallback);
      }
      const result = await res.json();
      setProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setProcessing(false);
      onComplete(result);
      reset();
    } catch (err) {
      setProcessing(false);
      setAnalysisError(err.message || 'No se ha podido analizar el documento.');
    }
  };

  useEffect(() => {
    if (!processing) return;
    setStepIndex(0);
    setProgress(0);
    const stepInterval = setInterval(() => {
      setStepIndex(i => (i + 1) % UPLOAD_STEPS.length);
    }, 2500);
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p >= 92) return p;
        const remaining = 92 - p;
        return p + Math.max(0.4, remaining * 0.03);
      });
    }, 200);
    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [processing]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,27,75,0.45)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[480px] rounded-lg bg-white"
        style={{ boxShadow: '0 20px 60px rgba(0,27,75,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: '#E5E9F0' }}>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '17px', color: '#001B4B' }}>
            Nuevo análisis
          </h2>
          {!processing && (
            <button
              onClick={handleClose}
              className="p-1 rounded-md transition"
              style={{ color: '#5B6478' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F7FA'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>

        <div className="p-6">
          {processing ? (
            <div className="py-6">
              <div className="flex items-center gap-3 mb-5">
                <Loader2 size={18} strokeWidth={2} color="#0066FF" className="animate-spin" />
                <div className="text-[13px]" style={{ color: '#001B4B', fontWeight: 500 }}>{UPLOAD_STEPS[stepIndex]}</div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#E5E9F0' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#0066FF' }} />
              </div>
              <div className="mt-2 text-[11px] text-right" style={{ color: '#5B6478', fontFamily: '"JetBrains Mono", monospace' }}>{Math.round(progress)}%</div>
            </div>
          ) : analysisError ? (
            <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: '#F5C6C6', background: '#FCEBEB' }}>
              <AlertTriangle size={18} color="#8B1F1F" strokeWidth={1.8} className="shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] mb-0.5" style={{ color: '#8B1F1F', fontWeight: 500 }}>No se ha podido analizar el pliego</div>
                <div className="text-[12px]" style={{ color: '#8B1F1F' }}>{analysisError}</div>
              </div>
            </div>
          ) : file ? (
            <div className="flex items-center gap-3 p-4 rounded-md border" style={{ borderColor: '#E5E9F0', background: '#FAFBFC' }}>
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: '#F0F5FF' }}>
                <FileText size={18} color="#0066FF" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate" style={{ color: '#001B4B', fontWeight: 500 }}>{file.name}</div>
                <div className="text-[11px]" style={{ color: '#5B6478' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-1.5 rounded-md transition shrink-0"
                style={{ color: '#5B6478' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center text-center rounded-lg cursor-pointer transition"
              style={{
                border: `2px dashed ${dragging ? '#0066FF' : '#E5E9F0'}`,
                background: dragging ? '#F0F5FF' : '#FAFBFC',
                padding: '40px 24px'
              }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 transition" style={{ background: dragging ? '#0066FF' : '#F0F5FF' }}>
                <UploadCloud size={20} color={dragging ? 'white' : '#0066FF'} strokeWidth={1.8} />
              </div>
              <div className="text-[13px] mb-1" style={{ color: '#001B4B', fontWeight: 500 }}>
                Arrastra tu pliego PDF aquí
              </div>
              <div className="text-[12px]" style={{ color: '#5B6478' }}>
                o haz clic para buscar en tu equipo
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={e => validateAndSetFile(e.target.files?.[0])}
              />
            </div>
          )}
          {error && (
            <div className="mt-3 text-[12px]" style={{ color: '#8B1F1F' }}>{error}</div>
          )}
        </div>

        {!processing && analysisError && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: '#E5E9F0' }}>
            <button
              onClick={() => { setAnalysisError(''); setFile(null); }}
              className="px-4 py-2 rounded-md text-[13px] transition"
              style={{ color: '#5B6478' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F7FA'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Elegir otro archivo
            </button>
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] transition"
              style={{ background: '#0066FF', color: 'white', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = '#0044CC'}
              onMouseLeave={e => e.currentTarget.style.background = '#0066FF'}
            >
              <Zap size={13} strokeWidth={2} />
              Reintentar
            </button>
          </div>
        )}

        {!processing && !analysisError && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: '#E5E9F0' }}>
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-md text-[13px] transition"
              style={{ color: '#5B6478' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F7FA'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Cancelar
            </button>
            <button
              onClick={handleAnalyze}
              disabled={!file}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] transition"
              style={{
                background: file ? '#0066FF' : '#E5E9F0',
                color: file ? 'white' : '#5B6478',
                fontWeight: 500,
                cursor: file ? 'pointer' : 'not-allowed'
              }}
              onMouseEnter={e => { if (file) e.currentTarget.style.background = '#0044CC'; }}
              onMouseLeave={e => { if (file) e.currentTarget.style.background = '#0066FF'; }}
            >
              <Zap size={13} strokeWidth={2} />
              Analizar pliego
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- DASHBOARD ----------

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

const Dashboard = ({ pliegos, onSelect, onNewAnalysis }) => (
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
      <KpiCard label="Pliegos analizados (mes)" value="24" delta="+37%" icon={FileText} />
      <KpiCard label="Tiempo medio de extracción" value="52s" delta="-14s" icon={Clock} />
      <KpiCard label="Importe agregado" value="86.2M €" delta="+22%" icon={Euro} mono />
      <KpiCard label="Confianza media" value="94%" delta="+2%" icon={CheckCircle2} />
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
                <div className="text-[12px]" style={{ color: '#001B4B' }}>{p.fechaLimite}</div>
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
  </div>
);

// ---------- ANALYSIS ----------

const ConfidenceBadge = ({ value }) => {
  const color = value >= 95 ? '#00A67C' : value >= 90 ? '#7FA800' : '#F5A623';
  return (
    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#5B6478' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {value}%
    </span>
  );
};

const SectionCard = ({ children, className = '' }) => (
  <div className={`rounded-lg border p-6 ${className}`} style={{ borderColor: '#E5E9F0', background: 'white' }}>
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }) => (
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
  </div>
);

const SECTIONS = [
  { id: 'resumen', label: 'Resumen ejecutivo', icon: FileText },
  { id: 'lotes', label: 'Lotes', icon: Package },
  { id: 'perfiles', label: 'Perfiles requeridos', icon: Users },
  { id: 'solvencia', label: 'Solvencia', icon: Shield },
  { id: 'criterios', label: 'Criterios de adjudicación', icon: Scale },
  { id: 'penalizaciones', label: 'Penalizaciones', icon: AlertTriangle },
  { id: 'plazos', label: 'Plazos e hitos', icon: Calendar },
];

const Analysis = ({ pliego, onBack }) => {
  const [section, setSection] = useState('resumen');
  const data = pliego.analysisData || MOCK_ANALYSIS[pliego.id] || MOCK_ANALYSIS['2026-7008']; // fallback a demo

  return (
    <div className="max-w-[1200px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b" style={{ borderColor: '#E5E9F0', background: 'white' }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px]" style={{ color: '#5B6478' }}
          onMouseEnter={e => e.currentTarget.style.color = '#001B4B'}
          onMouseLeave={e => e.currentTarget.style.color = '#5B6478'}>
          <ArrowLeft size={14} strokeWidth={1.8} />
          Dashboard
        </button>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px]" style={{ borderColor: '#E5E9F0', color: '#001B4B' }}>
            <Wand2 size={12} strokeWidth={1.8} />
            Generar borrador RFP
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px]" style={{ background: '#001B4B', color: 'white' }}>
            <Download size={12} strokeWidth={2} />
            Exportar a Excel
          </button>
        </div>
      </div>

      {/* Header con nº expediente */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#0066FF', letterSpacing: '0.02em' }}>
            EXP {pliego.expediente}
          </div>
          <div className="text-[11px]" style={{ color: '#5B6478' }}>·</div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>{pliego.procedimiento}</div>
          <div className="text-[11px]" style={{ color: '#5B6478' }}>·</div>
          <div className="flex items-center gap-1 text-[11px]" style={{ color: '#5B6478' }}>
            <Shield size={10} strokeWidth={2} /> ENS {pliego.ens}
          </div>
        </div>

        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '36px', color: '#001B4B', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {pliego.titulo}
        </h1>

        <div className="flex items-center gap-2 mt-3 text-[14px]" style={{ color: '#5B6478' }}>
          <Building2 size={14} strokeWidth={1.8} />
          {pliego.organismo}
        </div>

        {/* Ribbon de datos clave */}
        <div className="grid grid-cols-4 gap-0 mt-6 rounded-lg border overflow-hidden" style={{ borderColor: '#E5E9F0', background: 'white' }}>
          {[
            { label: 'Importe total', value: formatEuroFull(pliego.importe), mono: true },
            { label: 'Lotes', value: pliego.lotes.toString() },
            { label: 'Duración', value: `${data.resumen.duracion} + ${data.resumen.prorrogas}` },
            { label: 'Cierre de ofertas', value: data.plazos.limite, highlight: true },
          ].map((item, idx) => (
            <div key={idx} className="p-4" style={{ borderLeft: idx > 0 ? '1px solid #E5E9F0' : 'none' }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>{item.label}</div>
              <div style={{
                fontFamily: item.mono ? '"JetBrains Mono", monospace' : '"Space Grotesk", sans-serif',
                fontWeight: 500,
                fontSize: '16px',
                color: item.highlight ? '#0066FF' : '#001B4B',
                letterSpacing: '-0.01em'
              }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Índice + Contenido */}
      <div className="px-8 pb-12 grid gap-6" style={{ gridTemplateColumns: '200px 1fr' }}>
        {/* Índice */}
        <nav className="sticky top-4 h-fit">
          <div className="text-[10px] uppercase tracking-wider mb-3 px-3" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Índice</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left rounded-md transition mb-0.5"
              style={{
                color: section === s.id ? '#0066FF' : '#5B6478',
                background: section === s.id ? '#F0F5FF' : 'transparent',
                fontWeight: section === s.id ? 500 : 400,
                borderLeft: section === s.id ? '2px solid #0066FF' : '2px solid transparent',
                paddingLeft: '10px'
              }}
              onMouseEnter={e => { if (section !== s.id) e.currentTarget.style.color = '#001B4B'; }}
              onMouseLeave={e => { if (section !== s.id) e.currentTarget.style.color = '#5B6478'; }}
            >
              <s.icon size={13} strokeWidth={section === s.id ? 2 : 1.8} />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Contenido */}
        <div className="min-w-0">
          {section === 'resumen' && (
            <SectionCard>
              <SectionTitle icon={FileText} title="Resumen ejecutivo" />
              <p className="text-[14px] mb-6" style={{ color: '#001B4B', lineHeight: 1.6 }}>
                {data.resumen.objeto}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Procedimiento</div>
                  <div className="text-[13px]" style={{ color: '#001B4B' }}>{data.resumen.procedimiento}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Duración</div>
                  <div className="text-[13px]" style={{ color: '#001B4B' }}>{data.resumen.duracion} + {data.resumen.prorrogas}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Códigos CPV</div>
                  <div className="flex gap-2 flex-wrap">
                    {data.resumen.cpv.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded text-[11px]" style={{ background: '#F0F5FF', color: '#0044CC', fontFamily: '"JetBrains Mono", monospace' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478', letterSpacing: '0.08em' }}>Marco normativo</div>
                  <div className="flex gap-2 flex-wrap">
                    {[...data.marco.ccnStic, ...data.marco.normativa].map(n => (
                      <span key={n} className="px-2 py-0.5 rounded text-[11px]" style={{ background: '#F5F7FA', color: '#001B4B' }}>{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {section === 'lotes' && (
            <SectionCard>
              <SectionTitle icon={Package} title="Lotes" subtitle={`${data.lotes.length} lotes por un importe agregado de ${formatEuroFull(data.lotes.reduce((a, l) => a + l.importe, 0))}`} />
              <div className="space-y-2">
                {data.lotes.map(lote => (
                  <div key={lote.numero} className="flex items-start gap-4 p-4 rounded-md border" style={{ borderColor: '#E5E9F0' }}>
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: '#F0F5FF' }}>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '15px', color: '#0066FF' }}>{lote.numero}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px]" style={{ color: '#001B4B', fontWeight: 500 }}>{lote.descripcion}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px]" style={{ color: '#5B6478', fontFamily: '"JetBrains Mono", monospace' }}>CPV {lote.cpv}</span>
                        <ConfidenceBadge value={lote.confianza} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '15px', fontWeight: 500, color: '#001B4B' }}>
                        {formatEuroFull(lote.importe)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'perfiles' && (
            <SectionCard>
              <SectionTitle icon={Users} title="Perfiles requeridos (STS)" subtitle={`${data.perfiles.reduce((a, p) => a + p.headcount, 0)} recursos totales distribuidos en ${data.perfiles.length} categorías`} />
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E9F0' }}>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500 }}>Código</th>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500 }}>Categoría</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500 }}>HC</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500 }}>Exp.</th>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider pl-4" style={{ color: '#5B6478', fontWeight: 500 }}>Certificaciones</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: '#5B6478', fontWeight: 500 }}>Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perfiles.map(p => (
                    <tr key={p.codigo} style={{ borderBottom: '1px solid #F0F2F5' }}>
                      <td className="py-3">
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontWeight: 500, color: '#0066FF' }}>{p.codigo}</span>
                      </td>
                      <td className="py-3 text-[12.5px]" style={{ color: '#001B4B' }}>{p.categoria}</td>
                      <td className="py-3 text-right text-[13px]" style={{ color: '#001B4B', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{p.headcount}</td>
                      <td className="py-3 text-right text-[12px]" style={{ color: '#5B6478' }}>{p.experiencia}a</td>
                      <td className="py-3 pl-4">
                        <div className="flex gap-1 flex-wrap">
                          {p.certs.length > 0 ? p.certs.map(c => (
                            <span key={c} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#F5F7FA', color: '#5B6478' }}>{c}</span>
                          )) : <span className="text-[11px]" style={{ color: '#5B6478' }}>—</span>}
                        </div>
                      </td>
                      <td className="py-3 text-right"><ConfidenceBadge value={p.confianza} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          )}

          {section === 'solvencia' && (
            <SectionCard>
              <SectionTitle icon={Shield} title="Requisitos de solvencia" />
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: '#0066FF', letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia técnica</div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>Experiencia mínima</div>
                      <div className="text-[13px]" style={{ color: '#001B4B' }}>{data.solvencia.tecnica.experienciaMinima}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>Volumen negocio anual</div>
                      <div className="text-[14px]" style={{ color: '#001B4B', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.tecnica.volumenNegocio)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>Clasificación</div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#001B4B' }}>{data.solvencia.tecnica.clasificacion}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#5B6478' }}>Certificaciones</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {data.solvencia.tecnica.certificaciones.map(c => (
                          <span key={c} className="px-2 py-0.5 rounded text-[11px]" style={{ background: '#F0F5FF', color: '#0044CC' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: '#0066FF', letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia económica</div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>Seguro RC mínimo</div>
                      <div className="text-[14px]" style={{ color: '#001B4B', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.economica.seguroRC)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>Capital social mínimo</div>
                      <div className="text-[14px]" style={{ color: '#001B4B', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.economica.capitalMinimo)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {section === 'criterios' && (
            <SectionCard>
              <SectionTitle icon={Scale} title="Criterios de adjudicación" subtitle="Pesos porcentuales por criterio, distinguiendo evaluación automática (fórmula) y de juicio de valor" />
              <div className="space-y-2">
                {data.criterios.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-md" style={{ background: '#FAFBFC' }}>
                    <div className="w-14 text-right" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '18px', fontWeight: 500, color: '#0066FF' }}>
                      {c.peso}<span className="text-[12px]" style={{ color: '#5B6478' }}>%</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px]" style={{ color: '#001B4B', fontWeight: 500 }}>{c.criterio}</div>
                      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: c.tipo === 'automatico' ? '#0066FF' : '#5B6478', letterSpacing: '0.08em' }}>
                        {c.tipo === 'automatico' ? 'Evaluación automática' : 'Juicio de valor'}
                      </div>
                    </div>
                    <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: '#E5E9F0' }}>
                      <div className="h-full rounded-full" style={{ width: `${c.peso}%`, background: c.tipo === 'automatico' ? '#0066FF' : '#5B6478' }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'penalizaciones' && (
            <SectionCard>
              <SectionTitle icon={AlertTriangle} title="Penalizaciones" subtitle="Cláusulas de penalización identificadas en el PCAP" />
              <div className="space-y-3">
                {data.penalizaciones.map((p, idx) => (
                  <div key={idx} className="p-4 rounded-md border" style={{ borderColor: '#E5E9F0' }}>
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <div className="text-[13px]" style={{ color: '#001B4B', fontWeight: 500 }}>{p.tipo}</div>
                      <div className="text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: '#FCEBEB', color: '#8B1F1F' }}>{p.importe}</div>
                    </div>
                    <div className="text-[12px]" style={{ color: '#5B6478' }}>{p.descripcion}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'plazos' && (
            <SectionCard>
              <SectionTitle icon={Calendar} title="Plazos e hitos" />
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: 'Cierre de ofertas', value: data.plazos.limite, highlight: true },
                  { label: 'Apertura', value: data.plazos.apertura },
                  { label: 'Formalización', value: data.plazos.formalizacion },
                  { label: 'Inicio del servicio', value: data.plazos.inicio },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-md" style={{ background: item.highlight ? '#F0F5FF' : '#FAFBFC' }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#5B6478' }}>{item.label}</div>
                    <div className="text-[13px]" style={{ color: item.highlight ? '#0066FF' : '#001B4B', fontWeight: 500 }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: '#0066FF', letterSpacing: '0.08em', fontWeight: 500 }}>Hitos del contrato</div>
              <div className="space-y-2">
                {data.plazos.hitos.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-[13px]" style={{ color: '#001B4B' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: '#F0F5FF', color: '#0066FF', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>
                      {idx + 1}
                    </div>
                    {h}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- APP ----------

export default function App() {
  const [view, setView] = useState('dashboard');
  const [pliegos, setPliegos] = useState(MOCK_PLIEGOS);
  const [selectedPliego, setSelectedPliego] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleSelect = (p) => {
    setSelectedPliego(p);
    setView('analysis');
  };

  const handleUploadComplete = ({ pliego, analysis }) => {
    const newPliego = {
      ...pliego,
      id: slugify(pliego.expediente),
      fechaAnalisis: formatShortDate(new Date()),
      estado: 'analizado',
      analysisData: analysis,
    };
    setPliegos(prev => [newPliego, ...prev]);
    setShowUploadModal(false);
    handleSelect(newPliego);
  };

  return (
    <>
      <div className="min-h-screen flex" style={{ background: '#FAFBFC', fontFamily: '"Inter", -apple-system, sans-serif', color: '#001B4B' }}>
        <Sidebar view={view} setView={setView} />
        <main className="flex-1 overflow-auto">
          {view === 'dashboard' && <Dashboard pliegos={pliegos} onSelect={handleSelect} onNewAnalysis={() => setShowUploadModal(true)} />}
          {view === 'analysis' && selectedPliego && <Analysis pliego={selectedPliego} onBack={() => setView('dashboard')} />}
        </main>
      </div>
      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onComplete={handleUploadComplete}
      />
    </>
  );
}
