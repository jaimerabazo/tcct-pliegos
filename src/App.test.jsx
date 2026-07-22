import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { listPliegos } from './api/pliegos.js';

vi.mock('./api/pliegos.js', () => ({
  listPliegos: vi.fn(),
  updatePliego: vi.fn(),
  updateAnalysis: vi.fn(),
  analyzePdf: vi.fn(),
}));

describe('App tenant cache', () => {
  it('no muestra pliegos cacheados de otro tenant mientras carga el actual', () => {
    listPliegos.mockReturnValue(new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['pliegos'], [{
      id: 'anterior',
      expediente: 'OLD-001',
      titulo: 'Pliego del tenant anterior',
      organismo: 'Organización anterior',
      importe: 1000,
      lotes: 1,
      estado: 'analizado',
    }]);

    render(
      <QueryClientProvider client={client}>
        <App
          user={{ id: 'usuario-nuevo', email: 'nuevo@example.com' }}
          org={{ id: 'org-nueva', name: 'Nueva' }}
          onSignOut={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Cargando pliegos…')).toBeInTheDocument();
    expect(screen.queryByText('Pliego del tenant anterior')).not.toBeInTheDocument();
    expect(listPliegos).toHaveBeenCalledOnce();
  });
});
