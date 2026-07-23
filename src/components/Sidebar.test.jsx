// Test de integración ligero del Sidebar (usuario real + logout), plus fuera del
// umbral de cobertura, como Dashboard.test.jsx / Analysis.test.jsx.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, emailInitials } from './Sidebar.jsx';

describe('emailInitials', () => {
  it('deriva iniciales de emails con separadores', () => {
    expect(emailInitials('jaime.rabazo@dominio.com')).toBe('JR');
    expect(emailInitials('ana_garcia@dominio.com')).toBe('AG');
    expect(emailInitials('laura-f@dominio.com')).toBe('LF');
  });

  it('usa las dos primeras letras si no hay separador', () => {
    expect(emailInitials('yirah@dominio.com')).toBe('YI');
  });

  it('cae a "?" sin email', () => {
    expect(emailInitials('')).toBe('?');
    expect(emailInitials(undefined)).toBe('?');
  });
});

describe('Sidebar — tarjeta de usuario', () => {
  it('muestra el email del usuario autenticado y sus iniciales', () => {
    render(<Sidebar view="dashboard" setView={vi.fn()} user={{ email: 'jaime.rabazo@dominio.com' }} onSignOut={vi.fn()} />);
    expect(screen.getByText('jaime.rabazo@dominio.com')).toBeInTheDocument();
    expect(screen.getByText('JR')).toBeInTheDocument();
  });

  it('el botón de cerrar sesión llama a onSignOut', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<Sidebar view="dashboard" setView={vi.fn()} user={{ email: 'x@y.com' }} onSignOut={onSignOut} />);
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('sin onSignOut no renderiza el botón de logout', () => {
    render(<Sidebar view="dashboard" setView={vi.fn()} user={{ email: 'x@y.com' }} />);
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('muestra la gestión de equipo solo a owners', () => {
    const { rerender } = render(
      <Sidebar view="dashboard" setView={vi.fn()} user={{ email: 'x@y.com' }} org={{ role: 'member' }} />,
    );
    expect(screen.queryByRole('button', { name: 'Equipo' })).toBeNull();

    rerender(
      <Sidebar view="dashboard" setView={vi.fn()} user={{ email: 'x@y.com' }} org={{ role: 'owner' }} />,
    );
    expect(screen.getByRole('button', { name: 'Equipo' })).toBeInTheDocument();
  });
});
