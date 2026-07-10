import { describe, it, expect, vi } from 'vitest';
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

  it('al guardar, actualiza el pliego (importe total) y el análisis (lotes) por separado', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onUpdatePliego).toHaveBeenCalledWith('test-1', { importe: 3000 });
    expect(onUpdateAnalysis).toHaveBeenCalledTimes(1);
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
