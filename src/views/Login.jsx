import { useState } from 'react';
import { FileSearch, Mail, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { theme } from '../theme.js';
import { signInWithMagicLink, supabaseConfigured } from '../lib/supabase.js';

// Mensajes de Supabase → castellano accionable. El caso estrella es el invite-only:
// signInWithOtp con shouldCreateUser=false rechaza emails no invitados.
function friendlyAuthError(message) {
  if (/signups not allowed/i.test(message)) {
    return 'Este email no tiene acceso. Pide una invitación al administrador.';
  }
  if (/rate limit|security purposes/i.test(message)) {
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  }
  if (/invalid.*email|validate email/i.test(message)) {
    return 'Ese email no parece válido. Revísalo.';
  }
  return message || 'No se ha podido enviar el enlace. Inténtalo de nuevo.';
}

export const Login = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);

  const canSubmit = email.trim().length > 3 && email.includes('@') && status !== 'sending';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    setError(null);
    try {
      await signInWithMagicLink(email.trim());
      setStatus('sent');
    } catch (err) {
      setError(friendlyAuthError(err?.message));
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: theme.sidebar.bg, fontFamily: '"Inter", -apple-system, sans-serif' }}>
      <div className="w-full max-w-[400px]">
        {/* Marca */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: theme.link }}>
            <FileSearch size={20} color={theme.white} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[16px] leading-tight" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, color: theme.white, letterSpacing: '-0.01em' }}>
              TCCT Pliegos
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: theme.sidebar.text, letterSpacing: '0.08em' }}>Presales Suite</div>
          </div>
        </div>

        <div className="rounded-lg p-6" style={{ background: theme.card, boxShadow: `0 20px 60px ${theme.shadow}` }}>
          {status === 'sent' ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: theme.successBg }}>
                <CheckCircle2 size={22} color={theme.success} strokeWidth={2} />
              </div>
              <div className="text-[15px] mb-1.5" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: theme.text }}>
                Revisa tu correo
              </div>
              <div className="text-[13px]" style={{ color: theme.textMuted }}>
                Hemos enviado un enlace de acceso a<br />
                <span style={{ fontWeight: 500, color: theme.text }}>{email.trim()}</span>
              </div>
              <button
                onClick={() => { setStatus('idle'); }}
                className="mt-4 text-[12px]"
                style={{ color: theme.link }}
              >
                Usar otro email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 className="text-[17px] mb-1" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: theme.text }}>
                Iniciar sesión
              </h1>
              <p className="text-[13px] mb-5" style={{ color: theme.textMuted }}>
                Te enviaremos un enlace de acceso por correo. Solo para usuarios invitados.
              </p>

              {!supabaseConfigured && (
                <div className="flex items-start gap-2 p-3 mb-4 rounded-md border text-[12px]" style={{ borderColor: theme.errorBorder, background: theme.errorBg, color: theme.errorText }}>
                  <AlertTriangle size={14} strokeWidth={1.8} className="shrink-0 mt-0.5" />
                  Falta configurar VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el entorno.
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 mb-4 rounded-md border text-[12px]" style={{ borderColor: theme.errorBorder, background: theme.errorBg, color: theme.errorText }}>
                  <AlertTriangle size={14} strokeWidth={1.8} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <label className="block text-[11px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted, letterSpacing: '0.08em' }} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2 rounded-md border text-[14px] mb-4 outline-none"
                style={{ borderColor: theme.border, color: theme.text, background: theme.white }}
              />

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px]"
                style={{
                  background: canSubmit ? theme.primary : theme.muted,
                  color: canSubmit ? theme.white : theme.textMuted,
                  fontWeight: 500,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {status === 'sending'
                  ? <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                  : <Mail size={14} strokeWidth={2} />}
                {status === 'sending' ? 'Enviando enlace…' : 'Enviar enlace de acceso'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-6 text-[11px]" style={{ color: theme.sidebar.text }}>
          Acceso restringido · Los datos de expedientes son confidenciales
        </div>
      </div>
    </div>
  );
};
