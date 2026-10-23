import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { mensajeError } from '../api';
import { Field, Notice } from './ui';

// Formulario de acceso para cualquier usuario: pasajero o personal del sistema.
export default function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password); // al iniciar sesión, App.tsx muestra la pantalla que corresponde al rol
    } catch (x) {
      setErr(mensajeError(x));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      {err && <Notice>{err}</Notice>}
      <Field label="Correo electrónico"><input className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña"><input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <button className="btn-primary mt-1 w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar'}</button>
      <p className="mt-4 text-center text-sm text-slate">¿No tiene cuenta? <Link to="/registro" className="font-medium text-route underline">Crear cuenta de pasajero</Link></p>
    </form>
  );
}
