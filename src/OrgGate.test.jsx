import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgGate } from './OrgGate.jsx';
import { listMyOrgs } from './api/orgs.js';

vi.mock('./api/orgs.js', () => ({ listMyOrgs: vi.fn() }));
vi.mock('./App.jsx', () => ({
  default: ({ org }) => <div data-testid="app">{org.id}</div>,
}));

function renderWithClient(ui, client) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('OrgGate tenant cache', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
