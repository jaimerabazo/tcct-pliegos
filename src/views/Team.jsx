import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MailPlus, ShieldCheck, Trash2, UserMinus, Users } from 'lucide-react';
import {
  createInvitation,
  listMembers,
  listPendingInvitations,
  removeMember,
  revokeInvitation,
} from '../api/orgs.js';
import { tenantQueryKeys } from '../queryKeys.js';
import { theme } from '../theme.js';

const roleLabel = (role) => (role === 'owner' ? 'Owner' : 'Miembro');

const formatExpiry = (value) => new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

export const Team = ({ user, org }) => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  // uuid del miembro pendiente de confirmar su expulsión (confirmación inline en dos
  // pasos: quitar a alguien retira su acceso, así que no es un clic sin red).
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const membersKey = tenantQueryKeys.members(user.id, org.id);
  const invitationsKey = tenantQueryKeys.invitations(user.id, org.id);

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () => listMembers(org.id),
  });
  const invitationsQuery = useQuery({
    queryKey: invitationsKey,
    queryFn: () => listPendingInvitations(org.id),
  });
  const inviteMutation = useMutation({
    mutationFn: (invitation) => createInvitation(org.id, invitation),
    onSuccess: async () => {
      setEmail('');
      setRole('member');
      await queryClient.invalidateQueries({ queryKey: invitationsKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (invitationId) => revokeInvitation(org.id, invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });
  const removeMutation = useMutation({
    mutationFn: (userId) => removeMember(org.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
    onSettled: () => setConfirmingRemoveId(null),
  });

  const submitInvitation = (event) => {
    event.preventDefault();
    inviteMutation.mutate({ email, role });
  };

  const invitations = invitationsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const loading = membersQuery.isLoading || invitationsQuery.isLoading;
  const loadError = membersQuery.error || invitationsQuery.error;
  const mutationError = inviteMutation.error || revokeMutation.error || removeMutation.error;

  return (
    <div className="p-8 max-w-[1000px]">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: theme.textMuted, letterSpacing: '0.1em', fontWeight: 500 }}>
          {org.name}
        </div>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '32px', color: theme.text, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Equipo
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: theme.textMuted }}>
          Invita personas y controla los accesos pendientes de la organización.
        </p>
      </div>

      <section className="rounded-lg border p-5 mb-6" style={{ borderColor: theme.border, background: theme.card }}>
        <div className="flex items-center gap-2 mb-4">
          <MailPlus size={17} color={theme.link} strokeWidth={2} />
          <h2 className="text-[15px]" style={{ color: theme.text, fontWeight: 500 }}>Invitar persona</h2>
        </div>
        <form className="flex items-end gap-3" onSubmit={submitInvitation}>
          <label className="flex-1 text-[12px]" style={{ color: theme.text }}>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@empresa.com"
              className="mt-1.5 w-full px-3 py-2 rounded-md border text-[13px] outline-none"
              style={{ borderColor: theme.border, background: theme.white }}
            />
          </label>
          <label className="w-40 text-[12px]" style={{ color: theme.text }}>
            Rol
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-1.5 w-full px-3 py-2 rounded-md border text-[13px] outline-none"
              style={{ borderColor: theme.border, background: theme.white }}
            >
              <option value="member">Miembro</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="h-[38px] flex items-center gap-2 px-4 rounded-md text-[13px] disabled:opacity-60"
            style={{ background: theme.primary, color: theme.white, fontWeight: 500 }}
          >
            {inviteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Enviar invitación
          </button>
        </form>
        <p className="mt-2 text-[11px]" style={{ color: theme.textMuted }}>
          El enlace enviado por email caduca en una hora.
        </p>
        {mutationError && (
          <p role="alert" className="mt-3 text-[12px]" style={{ color: theme.errorText }}>
            {mutationError.message}
          </p>
        )}
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: theme.textMuted }}>
          <Loader2 size={16} className="animate-spin" /> Cargando equipo…
        </div>
      ) : loadError ? (
        <p role="alert" className="text-[13px]" style={{ color: theme.errorText }}>{loadError.message}</p>
      ) : (
        <>
          <DataTable
            title="Invitaciones pendientes"
            icon={MailPlus}
            count={invitations.length}
            empty="No hay invitaciones pendientes."
            headers={['Email', 'Rol', 'Caduca', '']}
          >
            {invitations.map((invitation) => (
              <tr key={invitation.id} style={{ borderTop: `1px solid ${theme.borderSubtle}` }}>
                <td className="px-5 py-3 text-[13px]" style={{ color: theme.text }}>{invitation.email}</td>
                <td className="px-4 py-3"><RoleBadge role={invitation.role} /></td>
                <td className="px-4 py-3 text-[12px]" style={{ color: theme.textMuted }}>{formatExpiry(invitation.expiresAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    aria-label={`Revocar invitación de ${invitation.email}`}
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(invitation.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] disabled:opacity-60"
                    style={{ color: theme.errorText, background: theme.errorBg }}
                  >
                    <Trash2 size={12} /> Revocar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>

          <DataTable
            title="Miembros"
            icon={Users}
            count={members.length}
            empty="No hay miembros."
            headers={['Miembro', 'Rol', '']}
          >
            {members.map((member) => {
              const isSelf = member.userId === user.id;
              const confirming = confirmingRemoveId === member.userId;
              return (
                <tr key={member.userId} style={{ borderTop: `1px solid ${theme.borderSubtle}` }}>
                  <td className="px-5 py-3 text-[13px]" style={{ color: theme.text }}>
                    {member.email || member.userId}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                  <td className="px-4 py-3 text-right">
                    {isSelf ? (
                      <span className="text-[11px]" style={{ color: theme.textMuted }}>Tú</span>
                    ) : confirming ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(member.userId)}
                          className="px-2.5 py-1.5 rounded-md text-[12px] disabled:opacity-60"
                          style={{ color: theme.white, background: theme.error }}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemoveId(null)}
                          className="px-2.5 py-1.5 rounded-md text-[12px]"
                          style={{ color: theme.textMuted, background: theme.muted }}
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Quitar a ${member.email || member.userId}`}
                        onClick={() => setConfirmingRemoveId(member.userId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px]"
                        style={{ color: theme.errorText, background: theme.errorBg }}
                      >
                        <UserMinus size={12} /> Quitar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </>
      )}
    </div>
  );
};

const RoleBadge = ({ role }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
    style={{
      color: role === 'owner' ? theme.infoText : theme.textMuted,
      background: role === 'owner' ? theme.infoBg : theme.muted,
    }}
  >
    {role === 'owner' && <ShieldCheck size={11} />}
    {roleLabel(role)}
  </span>
);

const DataTable = ({ title, icon: Icon, count, empty, headers, children }) => (
  <section className="rounded-lg border overflow-hidden mb-6" style={{ borderColor: theme.border, background: theme.card }}>
    <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: theme.border }}>
      <Icon size={16} color={theme.textMuted} />
      <h2 className="text-[15px]" style={{ color: theme.text, fontWeight: 500 }}>{title}</h2>
      <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: theme.muted, color: theme.textMuted }}>{count}</span>
    </div>
    {count === 0 ? (
      <p className="px-5 py-5 text-[13px]" style={{ color: theme.textMuted }}>{empty}</p>
    ) : (
      <table className="w-full">
        <thead>
          <tr style={{ background: theme.tableHead }}>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider"
                style={{ color: theme.textMuted, fontWeight: 500, letterSpacing: '0.08em' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    )}
  </section>
);
