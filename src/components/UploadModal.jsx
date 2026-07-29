import { useState, useEffect, useRef } from 'react';
import { UploadCloud, X, FileText, AlertTriangle, Zap } from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import { analyzePdf } from '../api/pliegos.js';
import { theme } from '../theme.js';

const UPLOAD_STEPS = [
  'Extrayendo texto del documento…',
  'Identificando lotes y códigos CPV…',
  'Detectando perfiles profesionales requeridos…',
  'Analizando criterios de adjudicación…',
  'Consolidando resultados…',
];

export const UploadModal = ({ open, onClose, onComplete }) => {
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
      const result = await analyzePdf(file);
      setProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setProcessing(false);
      await onComplete(result);
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
      style={{ background: theme.overlay }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[480px] rounded-lg bg-white"
        style={{ boxShadow: `0 20px 60px ${theme.shadow}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: theme.border }}>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '17px', color: theme.text }}>
            Nuevo análisis
          </h2>
          {!processing && (
            <button
              onClick={handleClose}
              className="p-1 rounded-md transition"
              style={{ color: theme.textMuted }}
              onMouseEnter={e => e.currentTarget.style.background = theme.muted}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>

        <div className="p-6">
          {processing ? (
            <div className="py-6">
              {/* El análisis con Claude tarda decenas de segundos: el orb ocupa el centro
                  de la espera en vez de un spinner de 18px al margen. Es canvas 2D y se
                  degrada solo si no hay contexto (p. ej. jsdom en los tests). */}
              <div className="flex flex-col items-center text-center mb-6">
                <ThinkingOrb
                  state="composing"
                  size={64}
                  speed={2}
                  aria-label="Analizando el pliego"
                />
                <div className="mt-4 text-[13px]" style={{ color: theme.text, fontWeight: 500 }}>
                  {UPLOAD_STEPS[stepIndex]}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: theme.border }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: theme.link }} />
              </div>
              <div className="mt-2 text-[11px] text-right" style={{ color: theme.textMuted, fontFamily: '"JetBrains Mono", monospace' }}>{Math.round(progress)}%</div>
            </div>
          ) : analysisError ? (
            <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: theme.errorBorder, background: theme.errorBg }}>
              <AlertTriangle size={18} color={theme.errorText} strokeWidth={1.8} className="shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] mb-0.5" style={{ color: theme.errorText, fontWeight: 500 }}>No se ha podido analizar el pliego</div>
                <div className="text-[12px]" style={{ color: theme.errorText }}>{analysisError}</div>
              </div>
            </div>
          ) : file ? (
            <div className="flex items-center gap-3 p-4 rounded-md border" style={{ borderColor: theme.border, background: theme.rowHover }}>
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: theme.accentLight }}>
                <FileText size={18} color={theme.link} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate" style={{ color: theme.text, fontWeight: 500 }}>{file.name}</div>
                <div className="text-[11px]" style={{ color: theme.textMuted }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-1.5 rounded-md transition shrink-0"
                style={{ color: theme.textMuted }}
                onMouseEnter={e => e.currentTarget.style.background = theme.borderSubtle}
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
                border: `2px dashed ${dragging ? theme.link : theme.border}`,
                background: dragging ? theme.accentLight : theme.rowHover,
                padding: '40px 24px',
              }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 transition" style={{ background: dragging ? theme.link : theme.accentLight }}>
                <UploadCloud size={20} color={dragging ? theme.white : theme.link} strokeWidth={1.8} />
              </div>
              <div className="text-[13px] mb-1" style={{ color: theme.text, fontWeight: 500 }}>
                Arrastra tu pliego PDF aquí
              </div>
              <div className="text-[12px]" style={{ color: theme.textMuted }}>
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
            <div className="mt-3 text-[12px]" style={{ color: theme.errorText }}>{error}</div>
          )}
        </div>

        {!processing && analysisError && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: theme.border }}>
            <button
              onClick={() => { setAnalysisError(''); setFile(null); }}
              className="px-4 py-2 rounded-md text-[13px] transition"
              style={{ color: theme.textMuted }}
              onMouseEnter={e => e.currentTarget.style.background = theme.muted}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Elegir otro archivo
            </button>
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] transition"
              style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = theme.primaryHover}
              onMouseLeave={e => e.currentTarget.style.background = theme.primary}
            >
              <Zap size={13} strokeWidth={2} />
              Reintentar
            </button>
          </div>
        )}

        {!processing && !analysisError && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: theme.border }}>
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-md text-[13px] transition"
              style={{ color: theme.textMuted }}
              onMouseEnter={e => e.currentTarget.style.background = theme.muted}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Cancelar
            </button>
            <button
              onClick={handleAnalyze}
              disabled={!file}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] transition"
              style={{
                background: file ? theme.primary : theme.border,
                color: file ? theme.white : theme.textMuted,
                fontWeight: 500,
                cursor: file ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => { if (file) e.currentTarget.style.background = theme.primaryHover; }}
              onMouseLeave={e => { if (file) e.currentTarget.style.background = theme.primary; }}
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
