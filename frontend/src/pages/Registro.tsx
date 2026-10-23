import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { mensajeError } from '../api';
import { Field, Notice } from '../components/ui';
import Logo from '../components/Logo';

export default function Registro() {
  const { registrar } = useAuth();
  const nav = useNavigate();
  const [v, setV] = useState({ nombre: '', email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await registrar(v.nombre, v.email, v.password);
      nav('/');
    } catch (x) {
      setErr(mensajeError(x));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <form onSubmit={enviar} className="w-full max-w-sm">
        <div className="mb-6"><Link to="/" aria-label="Pantalla principal"><Logo alto={40} /></Link></div>
        <h1 className="mb-1 text-3xl">Crear cuenta de pasajero</h1>
        <p className="mb-6 text-sm text-slate">Con su cuenta puede obtener una tarjeta, recargar saldo y ver sus pagos.</p>
        {err && <Notice>{err}</Notice>}
        <Field label="Nombre completo"><input className="input" required minLength={2} autoFocus value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></Field>
        <Field label="Correo electrónico"><input className="input" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Contraseña" ayuda="Mínimo 8 caracteres."><input className="input" type="password" required minLength={8} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
        <button className="btn-primary mt-2 w-full" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
        <p className="mt-5 text-center text-sm text-slate">¿Ya tiene cuenta? <Link to="/" className="font-medium text-route underline">Iniciar sesión</Link></p>
      </form>
    </div>
  );
}
