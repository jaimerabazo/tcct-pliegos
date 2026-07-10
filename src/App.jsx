import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { listPliegos, updatePliego, updateAnalysis } from './api/pliegos.js';
import { Sidebar } from './components/Sidebar.jsx';
import { UploadModal } from './components/UploadModal.jsx';
import { Dashboard } from './views/Dashboard.jsx';
import { Analysis } from './views/Analysis.jsx';

// Shell de la app: navegación (dashboard ↔ análisis), estado de servidor vía TanStack
// Query (la lista de pliegos es la única fuente de verdad) y el modal de subida. Los
// datos y callbacks bajan a las vistas presentacionales (Dashboard/Analysis) por props.
export default function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: pliegos = [], isLoading, isError, error } = useQuery({
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

  const handleUpdateAnalysis = (id, analysisData) => updateAnalysisMutation.mutate({ id, analysisData });
  const handleUpdatePliego = (id, patch) => updatePliegoMutation.mutate({ id, patch });

  return (
    <>
      <div className="min-h-screen flex" style={{ background: '#FAFBFC', fontFamily: '"Inter", -apple-system, sans-serif', color: '#001B4B' }}>
        <Sidebar view={view} setView={setView} />
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
            ) : (
              <LoadingState />
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
  <div className="p-8 flex items-center gap-3 text-[14px]" style={{ color: '#5B6478' }}>
    <Loader2 size={18} strokeWidth={2} color="#0066FF" className="animate-spin" />
    Cargando pliegos…
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="p-8 max-w-[560px]">
    <div className="flex items-start gap-3 p-4 rounded-md border" style={{ borderColor: '#F5C6C6', background: '#FCEBEB' }}>
      <AlertTriangle size={18} color="#8B1F1F" strokeWidth={1.8} className="shrink-0 mt-0.5" />
      <div>
        <div className="text-[13px] mb-0.5" style={{ color: '#8B1F1F', fontWeight: 500 }}>No se han podido cargar los pliegos</div>
        <div className="text-[12px] mb-3" style={{ color: '#8B1F1F' }}>{message || 'Error de conexión con el servidor.'}</div>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-md text-[12px]"
          style={{ background: '#0066FF', color: 'white', fontWeight: 500 }}
        >
          Reintentar
        </button>
      </div>
    </div>
  </div>
);
