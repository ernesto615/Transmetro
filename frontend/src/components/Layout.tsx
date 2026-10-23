import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ROL_LABEL, useAuth, type Rol } from '../auth';
import { getSocket } from '../socket';
import { fechaHora } from './ui';
import Logo from './Logo';

const P: Rol[] = ['admin', 'municipal', 'operador', 'guardia'];
const NAV: { to: string; label: string; roles?: Rol[] }[] = [
  { to: '/', label: 'Mi tarjeta', roles: ['pasajero'] },
  { to: '/recorridos', label: 'Recorridos y estaciones', roles: ['pasajero'] },
  { to: '/', label: 'Tablero', roles: P },
  { to: '/demanda', label: 'Demanda y capacidad', roles: ['admin', 'municipal'] },
  { to: '/finanzas', label: 'Finanzas', roles: ['admin'] },
  { to: '/mapa', label: 'Mapa en vivo', roles: P },
  { to: '/alertas', label: 'Alertas e incidentes', roles: P },
  { to: '/lineas', label: 'Líneas', roles: P },
  { to: '/estaciones', label: 'Estaciones', roles: P },
  { to: '/buses', label: 'Buses', roles: P },
  { to: '/parqueos', label: 'Parqueos', roles: P },
  { to: '/pilotos', label: 'Pilotos', roles: ['admin', 'municipal'] },
  { to: '/horarios', label: 'Horarios', roles: ['admin', 'municipal'] },
  { to: '/sugerencias', label: 'Sugerencias y quejas', roles: ['admin', 'municipal'] },
  { to: '/cobros', label: 'Cobros y tarjetas', roles: ['admin', 'operador'] },
  { to: '/reportes', label: 'Reportes', roles: P },
];

interface Aviso { id: number; tipo: 'panico' | 'alerta' | 'incidente'; texto: string; hora: string }

export default function Layout() {
  const { usuario, logout } = useAuth();
  const { pathname } = useLocation();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);

  const items = NAV.filter((n) => !n.roles || (usuario && n.roles.includes(usuario.rol)));
  const actual = items.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Transmetro';

  // El menú se cierra al navegar y con la tecla Escape.
  useEffect(() => { setAbierto(false); }, [pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Notificaciones en vivo: botón de pánico y alertas de capacidad llegan sin recargar.
  useEffect(() => {
    if (usuario?.rol === 'pasajero') return; // el pasajero no recibe alertas internas
    const s = getSocket();
    const add = (tipo: Aviso['tipo']) => (p: any) =>
      setAvisos((a) => [{ id: Date.now() + Math.random(), tipo, texto: p.descripcion ?? p.tipo, hora: fechaHora(p.fecha_hora) }, ...a].slice(0, 4));
    const onPanico = add('panico'), onAlerta = add('alerta');
    const onIncidente = (p: any) => add('incidente')({ ...p, descripcion: `${p.tipo}${p.descripcion ? ': ' + p.descripcion : ''}` });
    s.on('panico', onPanico);
    s.on('alerta', onAlerta);
    s.on('incidente', onIncidente);
    return () => { s.off('panico', onPanico); s.off('alerta', onAlerta); s.off('incidente', onIncidente); };
  }, [usuario?.rol]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-rule bg-panel px-4">
        <button className="btn-ghost !px-2.5" aria-label="Abrir menú de navegación" aria-expanded={abierto} aria-controls="menu-lateral" onClick={() => setAbierto(true)}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <Link to="/inicio" aria-label="Ir a la pantalla principal" title="Ir a la pantalla principal"><Logo alto={30} /></Link>
        <span aria-hidden className="hidden text-rule sm:inline">/</span>
        <span className="hidden font-display text-base text-slate sm:inline">{actual}</span>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-right leading-tight sm:block">
            <span className="block font-medium">{usuario?.nombre}</span>
            <span className="block text-xs text-slate">{usuario && ROL_LABEL[usuario.rol]}</span>
          </span>
          <button className="btn-ghost" onClick={logout}>Salir</button>
        </div>
      </header>

      {abierto && <div className="fixed inset-0 z-40 bg-ink/50" onClick={() => setAbierto(false)} aria-hidden />}
      <aside id="menu-lateral" aria-label="Navegación principal" aria-hidden={!abierto}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-panel shadow-xl transition-transform duration-200 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b border-rule px-4">
          <span className="font-display text-lg font-bold">Menú</span>
          <button className="btn-ghost !px-2.5" aria-label="Cerrar menú" onClick={() => setAbierto(false)}>✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.to === '/'} tabIndex={abierto ? 0 : -1}
                  className={({ isActive }) => `block rounded px-3 py-2.5 text-sm ${isActive ? 'bg-route font-semibold text-white' : 'text-ink hover:bg-route-soft'}`}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-rule p-4 text-sm">
          <div className="font-medium">{usuario?.nombre}</div>
          <div className="text-xs text-slate">{usuario && ROL_LABEL[usuario.rol]}</div>
        </div>
      </aside>

      <main className="mx-auto max-w-7xl p-5 md:p-8">
        {avisos.length > 0 && (
          <div className="mb-5 space-y-2" aria-live="assertive">
            {avisos.map((a) => (
              <div key={a.id} className={`flex items-start justify-between gap-3 rounded border-l-4 px-3 py-2 text-sm ${a.tipo === 'panico' ? 'border-alarm bg-alarm text-white' : 'border-signal bg-signal-soft'}`}>
                <span><strong>{a.tipo === 'panico' ? 'Botón de pánico' : a.tipo === 'incidente' ? 'Incidente de seguridad' : 'Alerta'}</strong> · {a.texto} <span className="opacity-70">({a.hora})</span></span>
                <button className="shrink-0 underline" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>Descartar</button>
              </div>
            ))}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
