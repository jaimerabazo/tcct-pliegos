// Test de integración del Login (React Testing Library). Mockea global.fetch — la
// llamada real de supabase-js a POST {url}/auth/v1/otp — en vez de mockear módulos,
// mismo patrón que src/api/pliegos.test.js. Las VITE_SUPABASE_* fake vienen de
// vitest.config.js (test.env), así que el cliente existe pero nunca toca la red.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login.jsx';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

const mockOtpResponse = ({ ok = true, status = 200, body = {} } = {}) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
};

describe('Login (magic link)', () => {
  it('deshabilita el botón hasta que el email tiene pinta de email', async () => {
    const user = userEvent.setup();
    render(<Login />);
    const button = screen.getByRole('button', { name: /Enviar enlace/ });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Email'), 'jaime@dominio.com');
    expect(button).toBeEnabled();
  });

  it('envía el magic link y muestra "Revisa tu correo"', async () => {
    const user = userEvent.setup();
    mockOtpResponse();
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), 'jaime@dominio.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
    expect(screen.getByText('jaime@dominio.com')).toBeInTheDocument();
    // La llamada fue al endpoint OTP de Supabase con shouldCreateUser=false (invite-only)
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/auth\/v1\/otp/);
    expect(JSON.parse(opts.body).create_user).toBe(false);
  });

  it('conserva la invitación en la URL de retorno del magic link', async () => {
    const user = userEvent.setup();
    mockOtpResponse();
    window.history.replaceState({}, '', '/acceso?invitation=token-secreto&source=email#local');
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), 'invitado@dominio.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    await screen.findByText('Revisa tu correo');
    const [url] = global.fetch.mock.calls[0];
    expect(new URL(url).searchParams.get('redirect_to')).toBe(
      `${window.location.origin}/acceso?invitation=token-secreto&source=email`,
    );
  });

  it('traduce el rechazo invite-only a un mensaje accionable', async () => {
    const user = userEvent.setup();
    mockOtpResponse({ ok: false, status: 422, body: { code: 'otp_disabled', msg: 'Signups not allowed for otp' } });
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), 'intruso@dominio.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    expect(await screen.findByText(/no tiene acceso.*invitación/i)).toBeInTheDocument();
  });

  it('permite volver a "usar otro email" tras enviar', async () => {
    const user = userEvent.setup();
    mockOtpResponse();
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), 'jaime@dominio.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    await screen.findByText('Revisa tu correo');
    await user.click(screen.getByRole('button', { name: /otro email/i }));

    expect(screen.getByRole('button', { name: /Enviar enlace/ })).toBeInTheDocument();
  });
});
