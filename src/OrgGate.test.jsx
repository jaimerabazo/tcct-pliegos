import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgGate } from './OrgGate.jsx';
import { acceptInvitation, createOrganization, listMyOrgs } from './api/orgs.js';

vi.mock('./api/orgs.js', () => ({
  listMyOrgs: vi.fn(),
  createOrganization: vi.fn(),
  acceptInvitation: vi.fn(),
}));
vi.mock('./App.jsx', () => ({
  default: ({ org }) => <div data-testid="app">{org.id}</div>,
}));

function renderWithClient(ui, client) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('OrgGate tenant cache', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('no monta App con organizaciones de otro usuario cacheadas bajo la clave antigua', () => {
    listMyOrgs.mockReturnValue(new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['orgs'], [{ id: 'org-del-usuario-anterior', name: 'Anterior' }]);

    renderWithClient(
      <OrgGate user={{ id: 'usuario-nuevo', email: 'nuevo@example.com' }} onSignOut={vi.fn()} />,
      client,
    );

    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(localStorage.getItem('activeOrgId')).toBeNull();
    expect(listMyOrgs).toHaveBeenCalledOnce();
  });

  it('permite crear la primera organización y monta App con ella', async () => {
    listMyOrgs.mockResolvedValue([]);
    createOrganization.mockResolvedValue({
      id: 'org-nueva',
      name: 'Acme',
      slug: 'acme',
      plan: 'trial',
      role: 'owner',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderWithClient(
      <OrgGate user={{ id: 'usuario-nuevo', email: 'nuevo@example.com' }} onSignOut={vi.fn()} />,
      client,
    );

    expect(await screen.findByRole('heading', { name: 'Crea tu organización' })).toBeInTheDocument();
    const user = (await import('@testing-library/user-event')).default.setup();
    await user.type(screen.getByLabelText('Nombre de la empresa'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Crear organización' }));

    expect(await screen.findByTestId('app')).toHaveTextContent('org-nueva');
    expect(createOrganization.mock.calls[0][0]).toBe('Acme');
    expect(localStorage.getItem('activeOrgId')).toBe('org-nueva');
  });

  it('acepta una invitación del enlace antes de montar App', async () => {
    window.history.replaceState({}, '', '/?invitation=token-secreto');
    listMyOrgs.mockReturnValue(new Promise(() => {}));
    acceptInvitation.mockResolvedValue({
      organizationId: 'org-invitada',
      name: 'Invitada',
      slug: 'invitada',
      plan: 'trial',
      role: 'member',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderWithClient(
      <OrgGate user={{ id: 'invitado', email: 'invite@example.com' }} onSignOut={vi.fn()} />,
      client,
    );

    expect(screen.getByText('Aceptando invitación…')).toBeInTheDocument();
    expect(await screen.findByTestId('app')).toHaveTextContent('org-invitada');
    expect(acceptInvitation.mock.calls[0][0]).toBe('token-secreto');
    expect(window.location.search).toBe('');
  });
});
