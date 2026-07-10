import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard.jsx';

const basePliego = (overrides) => ({
  id: '2026-0001',
  expediente: '2026/0001',
  titulo: 'Pliego de prueba',
  organismo: 'Organismo de Prueba',
  fechaAnalisis: '01 ene 2026',
  fechaLimite: '01 feb 2026',
  importe: 1000000,
  lotes: 1,
  estado: 'analizado',
  procedimiento: 'Abierto',
  ens: 'Alto',
  ...overrides,
});

// Cada KPI vive en su propia tarjeta; acotamos la búsqueda a esa tarjeta
// para no chocar con el mismo número/importe repetido en la tabla de abajo.
const kpiValue = (label) => {
  const card = screen.getByText(label).closest('.p-5');
  // El valor es el segundo div hijo directo de la tarjeta (tras el bloque label+icono).
  return card.children[1].textContent;
};

describe('Dashboard KPIs', () => {
  it('muestra el recuento, el importe agregado y el importe medio calculados a partir de los pliegos', () => {
    const pliegos = [
      basePliego({ id: 'a', importe: 1000000 }),
      basePliego({ id: 'b', importe: 3000000 }),
    ];

    render(<Dashboard pliegos={pliegos} onSelect={vi.fn()} onNewAnalysis={vi.fn()} />);

    expect(kpiValue('Pliegos analizados (mes)')).toBe('2');
    expect(kpiValue('Importe agregado')).toBe('4.00M €');
    expect(kpiValue('Importe medio')).toBe('2.00M €');
  });

  it('recalcula las KPIs cuando se añade un nuevo pliego analizado (re-render con más datos)', () => {
    const { rerender } = render(<Dashboard pliegos={[basePliego({ id: 'a', importe: 1000000 })]} onSelect={vi.fn()} onNewAnalysis={vi.fn()} />);
    expect(kpiValue('Importe agregado')).toBe('1.00M €');

    const conNuevoAnalisis = [
      basePliego({ id: 'a', importe: 1000000 }),
      basePliego({ id: 'nuevo', importe: 5000000 }),
    ];
    rerender(<Dashboard pliegos={conNuevoAnalisis} onSelect={vi.fn()} onNewAnalysis={vi.fn()} />);

    expect(kpiValue('Importe agregado')).toBe('6.00M €'); // Importe agregado tras el nuevo análisis
    expect(kpiValue('Pliegos analizados (mes)')).toBe('2');
  });

  it('con una lista vacía de pliegos no rompe y muestra 0', () => {
    render(<Dashboard pliegos={[]} onSelect={vi.fn()} onNewAnalysis={vi.fn()} />);
    expect(kpiValue('Pliegos analizados (mes)')).toBe('0');
    expect(kpiValue('Importe agregado')).toBe('0 €');
    expect(kpiValue('Importe medio')).toBe('0 €');
  });
});
