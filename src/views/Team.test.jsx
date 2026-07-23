import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInvitation,
  listMembers,
  listPendingInvitations,
  removeMember,
  revokeInvitation,
} from '../api/orgs.js';
import { Team } from './Team.jsx';

vi.mock('../api/orgs.js', () => ({
  createInvitation: vi.fn(),
  listMembers: vi.fn(),
  listPendingInvitations: vi.fn(),
  removeMember: vi.fn(),
  revokeInvitation: vi.fn(),
}));

const renderTeam = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Team
        user={{ id: 'owner-1', email: 'owner@example.com' }}
        org={{ id: 'org-a', name: 'Acme', role: 'owner' }}
      />
    </QueryClientProvider>,
  );
};

describe('Team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMembers.mockResolvedValue([
      { userId: 'owner-1', role: 'owner', email: 'owner@example.com' },
      { userId: 'member-2', role: 'member', email: 'member@example.com' },
    ]);
    listPendingInvitations.mockResolvedValue([
      {
        id: 'inv-1',
        email: 'pending@example.com',
        role: 'member',
        expiresAt: '2026-07-23T21:00:00.000Z',
      },
    ]);
    createInvitation.mockResolvedValue({ invitation: { id: 'inv-2' } });
    revokeInvitation.mockResolvedValue(undefined);
    removeMember.mockResolvedValue(undefined);
  });

  it('muestra pendientes y permite invitar y revocar', async () => {
    const user = userEvent.setup();
    renderTeam();

    expect(await screen.findByText('pending@example.com')).toBeInTheDocument();
    // Los miembros se muestran por email, no por uuid.
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.selectOptions(screen.getByLabelText('Rol'), 'owner');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(createInvitation).toHaveBeenCalledWith('org-a', {
      email: 'new@example.com',
      role: 'owner',
    }));

    await user.click(screen.getByRole('button', {
      name: 'Revocar invitación de pending@example.com',
    }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith('org-a', 'inv-1'));
  });

  it('permite quitar a otro miembro (con confirmación) pero no a uno mismo', async () => {
    const user = userEvent.setup();
    renderTeam();

    // La fila propia no ofrece botón de quitar.
    expect(await screen.findByText('member@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar a owner@example.com' })).not.toBeInTheDocument();

    // Primer clic pide confirmación; aún no llama a la API.
    await user.click(screen.getByRole('button', { name: 'Quitar a member@example.com' }));
    expect(removeMember).not.toHaveBeenCalled();

    // Confirmar dispara la expulsión.
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('org-a', 'member-2'));
  });

  it('cancelar la confirmación no quita al miembro', async () => {
    const user = userEvent.setup();
    renderTeam();

    await user.click(await screen.findByRole('button', { name: 'Quitar a member@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(removeMember).not.toHaveBeenCalled();
    // Vuelve a estar el botón de quitar (no la confirmación).
    expect(screen.getByRole('button', { name: 'Quitar a member@example.com' })).toBeInTheDocument();
  });
});
