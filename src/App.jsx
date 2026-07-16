import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { listPliegos, updatePliego, updateAnalysis } from './api/pliegos.js';
import { resolveSelectedPliegoId } from './logic.js';
import { Sidebar } from './components/Sidebar.jsx';
import { UploadModal } from './components/UploadModal.jsx';
import { Dashboard } from './views/Dashboard.jsx';
import { Analysis } from './views/Analysis.jsx';
import { theme } from './theme.js';

// Shell de la app: navegación (dashboard ↔ análisis), estado de servidor vía TanStack
// Query (la lista de pliegos es la única fuente de verdad) y el modal de subida. Los
// datos y callbacks bajan a las vistas presentacionales (Dashboard/Analysis) por props.
export default function App({ user, onSignOut }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: pliegos = [], isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['pliegos'],
    queryFn: listPliegos,
  });

  const invalidatePliegos = () => queryClient.invalidateQueries({ queryKey: ['pliegos'] });

  const updatePliegoMutation = useMutation({
    mutationFn: ({ id, patch }) => updatePliego(id, patch),
    onSuccess: invalidatePliegos,
  });
  const updateAnalysisMutation = useMutation({
    mutationFn: ({ id, analysisData }) => updateAnalysis(id, analysisData),
    onSuccess: invalidatePliegos,
  });

  const selectedPliego = pliegos.find(p => p.id === selectedId) ?? null;

  // Si el usuario abre Análisis antes de que cargue la lista, selectedId queda null
  // y hay que re-resolverlo cuando lleguen los pliegos. También re-resuelve si el id
  // guardado ya no existe (p. ej. borrado en BD).
  useEffect(() => {
    if (view !== 'analysis' || isLoading) return;
    setSelectedId(prev => resolveSelectedPliegoId(pliegos, prev));
  }, [view, isLoading, pliegos]);

  const handleNavigate = (nextView) => {
    if (nextView === 'analysis' && !isLoading) {
      setSelectedId(prev => resolveSelectedPliegoId(pliegos, prev));
    }
    setView(nextView);
  };

  const handleSelect = (p) => {
    setSelectedId(p.id);
    setView('analysis');
  };

  const handleUploadComplete = async ({ pliego }) => {
    setShowUploadModal(false);
    await invalidatePliegos(); // espera al refetch para que el pliego nuevo esté en caché
    setSelectedId(pliego.id);
    setView('analysis');
  };

  // mutateAsync (no mutate) para que la vista pueda await-ear el guardado y solo salir
  // del modo edición si la persistencia tuvo éxito; si falla, la promesa rechaza y la
  // vista mantiene el borrador y muestra el error (evita pérdida silenciosa de datos).
  const handleUpdateAnalysis = (id, analysisData) => updateAnalysisMutation.mutateAsync({ id, analysisData });
  const handleUpdatePliego = (id, patch) => updatePliegoMutation.mutateAsync({ id, patch });

  return (
    <>
      <div className="min-h-screen flex" style={{ background: theme.page, fontFamily: '"Inter", -apple-system, sans-serif', color: theme.text }}>
        <Sidebar view={view} setView={handleNavigate} user={user} onSignOut={onSignOut} />
        <main className="flex-1 overflow-auto">
          {view === 'dashboard' && (
            isLoading ? (
              <LoadingState />
            ) : isError ? (
              <ErrorState message={error?.message} onRetry={invalidatePliegos} />
            ) : (
              <Dashboard pliegos={pliegos} onSelect={handleSelect} onNewAnalysis={() => setShowUploadModal(true)} />
            )
          )}
          {view === 'analysis' && (
            selectedPliego ? (
              <Analysis
                pliego={selectedPliego}
                onBack={() => setView('dashboard')}
                onUpdateAnalysis={handleUpdateAnalysis}
                onUpdatePliego={handleUpdatePliego}
              />
            ) : isError ? (
              <ErrorState message={error?.message} onRetry={invalidatePliegos} />
            ) : isLoading || isFetching ? (
              <LoadingState />
            ) : selectedId ? (
              <NotFoundState onBack={() => setView('dashboard')} />
            ) : (
              <EmptyAnalysisState onBack={() => setView('dashboard')} />
            )
          )}
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

const LoadingState = () => (
  <div className="p-8 flex items-center gap-3 text-[14px]" style={{ color: theme.textMuted }}>
    <Loader2 size={18} strokeWidth={2} color={theme.link} className="animate-spin" />
    Cargando pliegos…
  </div>
);

const EmptyAnalysisState = ({ onBack }) => (
  <div className="p-8 max-w-[560px]">
    <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: theme.border, background: theme.muted }}>
      <AlertTriangle size={18} color={theme.textMuted} strokeWidth={1.8} className="shrink-0 mt-0.5" />
      <div>
        <div className="text-[13px] mb-0.5" style={{ color: theme.text, fontWeight: 500 }}>Ningún expediente disponible</div>
        <div className="text-[12px] mb-3" style={{ color: theme.textMuted }}>Sube un pliego o vuelve al dashboard para seleccionar uno.</div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-md text-[12px]"
          style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
        >
          Volver al dashboard
        </button>
      </div>
    </div>
  </div>
);

const NotFoundState = ({ onBack }) => (
  <div className="p-8 max-w-[560px]">
    <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: theme.border, background: theme.muted }}>
      <AlertTriangle size={18} color={theme.textMuted} strokeWidth={1.8} className="shrink-0 mt-0.5" />
      <div>
        <div className="text-[13px] mb-0.5" style={{ color: theme.text, fontWeight: 500 }}>Pliego no encontrado</div>
        <div className="text-[12px] mb-3" style={{ color: theme.textMuted }}>El pliego seleccionado ya no está disponible.</div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-md text-[12px]"
          style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
        >
          Volver al dashboard
        </button>
      </div>
    </div>
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="p-8 max-w-[560px]">
    <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: theme.errorBorder, background: theme.errorBg }}>
      <AlertTriangle size={18} color={theme.errorText} strokeWidth={1.8} className="shrink-0 mt-0.5" />
      <div>
        <div className="text-[13px] mb-0.5" style={{ color: theme.errorText, fontWeight: 500 }}>No se han podido cargar los pliegos</div>
        <div className="text-[12px] mb-3" style={{ color: theme.errorText }}>{message || 'Error de conexión con el servidor.'}</div>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-md text-[12px]"
          style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
        >
          Reintentar
        </button>
      </div>
    </div>
  </div>
);
