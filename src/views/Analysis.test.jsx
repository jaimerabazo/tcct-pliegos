import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Analysis } from './Analysis.jsx';

const buildAnalysisData = (loteImportes) => ({
  resumen: { objeto: 'Objeto de prueba', cpv: [], procedimiento: 'Abierto', duracion: '12 meses', prorrogas: 'Sin prórrogas' },
  lotes: loteImportes.map((importe, i) => ({
    numero: i + 1,
    descripcion: `Lote ${i + 1}`,
    importe,
    cpv: '00000000-0',
    confianza: 90,
  })),
  perfiles: [],
  solvencia: {
    tecnica: { experienciaMinima: '—', volumenNegocio: 0, clasificacion: '—', certificaciones: [] },
    economica: { seguroRC: 0, capitalMinimo: 0 },
  },
  criterios: [],
  penalizaciones: [],
  plazos: { limite: '—', apertura: '—', formalizacion: '—', inicio: '—', hitos: [] },
  marco: { ens: 'Alto', ccnStic: [], normativa: [] },
});

const buildPliego = (importe, loteImportes) => ({
  id: 'test-1',
  expediente: '2026/9999',
  titulo: 'Pliego de prueba',
  organismo: 'Organismo de Prueba',
  importe,
  lotes: loteImportes.length,
  procedimiento: 'Abierto',
  ens: 'Alto',
  analysisData: buildAnalysisData(loteImportes),
});

const goToLotes = async (user) => {
  const lotesNavButton = screen.getByRole('button', { name: /Lotes/ });
  await user.click(lotesNavButton);
};

describe('Analysis - aviso de descuadre lotes vs importe', () => {
  it('muestra el aviso cuando la suma de los lotes no coincide con el importe del pliego', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(5000, [1000, 2000]); // suma lotes = 3000, importe pliego = 5000
    const { container } = render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    await goToLotes(user);

    expect(container.textContent).toMatch(/no coincide con el importe total del pliego/);
    expect(container.textContent).toMatch(/de menos/); // la suma de lotes es menor que el importe total
  });

  it('no muestra ningún aviso cuando la suma de los lotes coincide con el importe del pliego', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(3000, [1000, 2000]); // suma lotes = 3000 = importe pliego
    const { container } = render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    await goToLotes(user);

    expect(container.textContent).not.toMatch(/no coincide con el importe total del pliego/);
  });

  it('muestra un estado vacío (sin secciones ni aviso) cuando el pliego no tiene análisis propio', () => {
    // Sin analysisData: ya no se cae a datos demo de otro expediente; se muestra un
    // estado vacío claro. No hay índice de secciones ni aviso de descuadre.
    const pliego = {
      id: 'sin-analisis',
      expediente: '2026/0001',
      titulo: 'Pliego sin análisis',
      organismo: 'Organismo de Prueba',
      importe: 4500000,
      lotes: 1,
      procedimiento: 'Abierto',
      ens: 'Alto',
      analysisData: null,
    };
    const { container } = render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    expect(container.textContent).toMatch(/aún no se ha analizado en detalle/);
    expect(container.textContent).not.toMatch(/no coincide con el importe total del pliego/);
    // El pliego (título/importe) sí se muestra en la cabecera; las secciones no.
    expect(screen.getByText('Pliego sin análisis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('indica "de más" cuando la suma de los lotes supera el importe del pliego', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(1000, [700, 700]); // suma lotes = 1400, importe pliego = 1000
    const { container } = render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    await goToLotes(user);

    expect(container.textContent).toMatch(/no coincide con el importe total del pliego/);
    expect(container.textContent).toMatch(/de más/);
  });
});

describe('Analysis - edición del importe total del pliego (sección Lotes)', () => {
  it('el aviso de descuadre reacciona en vivo al editar el importe total, antes de guardar', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(5000, [1000, 2000]); // suma lotes = 3000, importe pliego = 5000
    const { container } = render(
      <Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} onUpdatePliego={vi.fn()} />
    );

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(container.textContent).toMatch(/no coincide con el importe total del pliego/);

    const totalInput = screen.getByText('Importe total del pliego').nextElementSibling;
    await user.clear(totalInput);
    await user.type(totalInput, '3000');

    expect(container.textContent).not.toMatch(/no coincide con el importe total del pliego/);
  });

  it('al guardar, persiste importe total y lotes en un único PATCH combinado (atómico)', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(5000, [1000, 2000]);
    const onUpdateAnalysis = vi.fn();
    const onUpdatePliego = vi.fn().mockResolvedValue({});
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={onUpdateAnalysis} onUpdatePliego={onUpdatePliego} />);

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    const totalInput = screen.getByText('Importe total del pliego').nextElementSibling;
    await user.clear(totalInput);
    await user.type(totalInput, '3000');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Una sola llamada que lleva importe + analysisData juntos (no dos PATCH separados).
    expect(onUpdatePliego).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdatePliego.mock.calls[0];
    expect(id).toBe('test-1');
    expect(patch.importe).toBe(3000);
    expect(patch.analysisData.lotes.map(l => l.importe)).toEqual([1000, 2000]);
    // Los lotes editados pasan a confianza 100 (verificado por humano).
    expect(patch.analysisData.lotes.every(l => l.confianza === 100)).toBe(true);
    expect(onUpdateAnalysis).not.toHaveBeenCalled();
  });

  it('si el guardado falla, mantiene el modo edición y muestra el error (no pierde los cambios en silencio)', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(3000, [1000, 2000]);
    const onUpdateAnalysis = vi.fn();
    const onUpdatePliego = vi.fn().mockRejectedValue(new Error('Error de red simulado'));
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={onUpdateAnalysis} onUpdatePliego={onUpdatePliego} />);

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    const descInput = screen.getByDisplayValue('Lote 1');
    await user.clear(descInput);
    await user.type(descInput, 'Lote editado');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Sigue en modo edición: el formulario (con el cambio) permanece visible y hay error.
    expect(await screen.findByText(/No se han guardado los cambios/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lote editado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar/ })).toBeInTheDocument();
  });

  it('si el guardado tiene éxito, sale del modo edición', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(3000, [1000, 2000]);
    const onUpdateAnalysis = vi.fn().mockResolvedValue({});
    const onUpdatePliego = vi.fn().mockResolvedValue({});
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={onUpdateAnalysis} onUpdatePliego={onUpdatePliego} />);

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Vuelve al modo lectura: reaparece el botón "Editar" y desaparece "Guardar".
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
  });

  it('un campo numérico dejado en blanco se persiste como null (no como "")', async () => {
    const user = userEvent.setup();
    // Confirmamos el aviso de "campos numéricos vacíos" (jsdom devuelve false por defecto).
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pliego = buildPliego(3000, [1000, 2000]);
    const onUpdateAnalysis = vi.fn().mockResolvedValue({});
    const onUpdatePliego = vi.fn().mockResolvedValue({});
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={onUpdateAnalysis} onUpdatePliego={onUpdatePliego} />);

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    // Vaciamos el importe total del pliego y el importe del primer lote.
    const totalInput = screen.getByText('Importe total del pliego').nextElementSibling;
    await user.clear(totalInput);
    const loteImporteInput = screen.getByDisplayValue('1000');
    await user.clear(loteImporteInput);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // importe total y lotes viajan juntos en el mismo patch combinado.
    const [, patch] = onUpdatePliego.mock.calls[0];
    expect(patch.importe).toBeNull();
    expect(patch.analysisData.lotes[0].importe).toBeNull();
    expect(patch.analysisData.lotes[1].importe).toBe(2000);
    expect(onUpdateAnalysis).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('al cancelar, no llama a onUpdatePliego ni onUpdateAnalysis', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(5000, [1000, 2000]);
    const onUpdateAnalysis = vi.fn();
    const onUpdatePliego = vi.fn();
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={onUpdateAnalysis} onUpdatePliego={onUpdatePliego} />);

    await goToLotes(user);
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    const totalInput = screen.getByText('Importe total del pliego').nextElementSibling;
    await user.clear(totalInput);
    await user.type(totalInput, '3000');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onUpdatePliego).not.toHaveBeenCalled();
    expect(onUpdateAnalysis).not.toHaveBeenCalled();
  });
});

describe('Analysis - botón Generar presentación', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockBinaryFetch = (blob) => {
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
      headers: { get: () => 'attachment; filename="Presentacion_2026-9999.pptx"' },
    });
  };

  it('muestra "Generar presentación" (ya no "Generar borrador RFP") y mantiene "Exportar a Excel"', () => {
    const pliego = buildPliego(3000, [1000, 2000]);
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Generar presentación/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar borrador RFP/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Exportar a Excel/ })).toBeInTheDocument();
  });

  it('al pulsar, llama al endpoint de presentación con el pliego y dispara la descarga', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(3000, [1000, 2000]);
    mockBinaryFetch(new Blob(['pptx']));
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Generar presentación/ }));

    expect(global.fetch).toHaveBeenCalledWith('/api/pliegos/test-1/presentation', expect.objectContaining({ method: 'POST' }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('muestra un banner de error si la generación falla', async () => {
    const user = userEvent.setup();
    const pliego = buildPliego(3000, [1000, 2000]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Claude ha fallado.' }),
    });
    const { container } = render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Generar presentación/ }));

    expect(container.textContent).toMatch(/No se ha podido generar la presentación/);
    expect(container.textContent).toMatch(/Claude ha fallado/);
  });

  it('deshabilita el botón en el estado vacío (pliego sin analizar)', () => {
    const pliego = {
      id: 'sin-analisis', expediente: '2026/0001', titulo: 'Sin análisis',
      organismo: 'Org', importe: 1000, lotes: 1, procedimiento: 'Abierto', ens: 'Alto',
      analysisData: null,
    };
    render(<Analysis pliego={pliego} onBack={vi.fn()} onUpdateAnalysis={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Generar presentación/ })).toBeDisabled();
  });
});
