import { useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import FondoCiudades from '../components/FondoCiudades';
import { EQUIPAJE, EXPRESO_12, FUENTE_URL, HORARIOS, NOTA_HORARIOS, PROHIBIDO, RECOMENDACIONES } from '../data/informacion';
import L from 'leaflet';
import { api, mensajeError } from '../api';
import LoginForm from '../components/LoginForm';
import { Link } from 'react-router-dom';
import { ROL_LABEL, useAuth } from '../auth';
import { Estado, Field, Notice, km, quetzales, useLoad } from '../components/ui';

const COLORES = ['#10069F', '#6DB52A', '#E8541E', '#5B2C8F', '#0A9BD9', '#C98500'];
const MONTOS = [5, 10, 20, 50];
const hora = (h: string) => h.replace(/^0/, '');
const franjaTxt = (f: { inicio: string; fin: string } | null) => (f ? `${hora(f.inicio)} a ${hora(f.fin)} hrs.` : 'Sin servicio');
const DIAS_TXT: [string, string][] = [['LUNES_VIERNES', 'Lunes a viernes'], ['SABADO', 'Sábado'], ['DOMINGO_FESTIVOS', 'Domingo y festivos']];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function MapaRed({ red, buscar }: { red: any; buscar: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcadores = useRef(new Map<string, L.CircleMarker>());

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false }).setView([14.6, -90.53], 12);
    mapa.current = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(m);

    red.lineas.forEach((l: any, i: number) => {
      const pts = l.paradas.filter((p: any) => p.latitud != null).map((p: any) => [p.latitud, p.longitud] as [number, number]);
      if (pts.length > 1) L.polyline(pts, { color: COLORES[i % COLORES.length], weight: 5, opacity: 0.85 }).addTo(m).bindTooltip(l.nombre, { sticky: true });
    });
    const puntos: [number, number][] = [];
    red.estaciones.filter((e: any) => e.latitud != null).forEach((e: any) => {
      const p: [number, number] = [e.latitud, e.longitud];
      puntos.push(p);
      const c = L.circleMarker(p, { radius: 7, color: '#12142B', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(m)
        .bindPopup(`<strong>${esc(e.nombre)}</strong><br/>${esc(e.municipalidad ?? '')}<br/>${e.lineas.length ? 'Líneas: ' + e.lineas.map(esc).join(', ') : 'Sin línea asignada'}`
          + (DIAS_TXT.some(([d]) => e.horarios?.[d]) ? '<br/><em>Horario de la estación</em>' + DIAS_TXT.map(([d, t]) => `<br/>${t}: ${franjaTxt(e.horarios[d])}`).join('') : ''));
      marcadores.current.set(e.nombre.toLowerCase(), c);
    });
    if (puntos.length) m.fitBounds(L.latLngBounds(puntos).pad(0.2));
    return () => { m.remove(); mapa.current = null; marcadores.current.clear(); };
  }, [red]);

  // Buscar una estación por nombre: acerca el mapa y abre su información.
  useEffect(() => {
    const c = marcadores.current.get(buscar.trim().toLowerCase());
    if (c && mapa.current) { mapa.current.flyTo(c.getLatLng(), 15); c.openPopup(); }
  }, [buscar]);

  return <div ref={el} className="h-[420px] w-full" role="application" aria-label="Mapa de estaciones y líneas" />;
}

function RecargaPublica() {
  const [numero, setNumero] = useState('');
  const [monto, setMonto] = useState('10');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function recargar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/publico/recargar', { numero: numero.trim(), monto: Number(monto), referencia: crypto.randomUUID() });
      setMsg({ tipo: 'ok', texto: `Recarga de ${quetzales(r.monto)} aprobada para la tarjeta ${r.tarjeta}. Cuando use su tarjeta el saldo estará disponible.` });
      setNumero('');
    } catch (x) { setMsg({ tipo: 'error', texto: mensajeError(x) }); }
    setBusy(false);
  }

  return (
    <form onSubmit={recargar}>
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
      <Field label="Número de su tarjeta Transmetro"><input className="input" required minLength={4} placeholder="Ej. TM-0001-2026" value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Montos rápidos">
        {MONTOS.map((m) => <button type="button" key={m} onClick={() => setMonto(String(m))} className={Number(monto) === m ? 'btn-primary' : 'btn-ghost'}>Q{m}</button>)}
      </div>
      <Field label="Otro monto (Q)"><input className="input" type="number" min="1" max="500" required value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
      <button className="btn-primary w-full" disabled={busy || !numero.trim()}>{busy ? 'Procesando…' : `Recargar Q${Number(monto || 0).toFixed(2)}`}</button>
    </form>
  );
}

const IconoProhibido = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="#C2362B" strokeWidth="2.4" />
    <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" stroke="#C2362B" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
const IconoOk = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
    <circle cx="12" cy="12" r="10" fill="#10069F" />
    <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconoCamara = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
    <rect x="3" y="7" width="12" height="9" rx="1.5" fill="#10069F" /><path d="M15 10l6-3v10l-6-3z" fill="#10069F" />
  </svg>
);

function Horarios() {
  const celda = 'px-3 py-2 text-center text-sm font-semibold';
  return (
    <div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <caption className="sr-only">Horarios de servicio por línea</caption>
          <thead>
            <tr className="bg-route text-white">
              <th className="px-3 py-2 text-left text-sm">Línea</th>
              <th className="px-3 py-2 text-sm">Lunes a viernes</th>
              <th className="px-3 py-2 text-sm">Sábado</th>
              <th className="px-3 py-2 text-sm">Domingo y festivos</th>
            </tr>
          </thead>
          <tbody>
            {HORARIOS.map((h) => {
              const estilo = { background: h.fondo, color: h.texto };
              return (
                <tr key={h.linea} className="border-b border-white/40">
                  <th scope="row" className="px-3 py-2 text-left font-display text-sm font-extrabold" style={estilo}>{h.ruta ? 'Ruta' : 'Línea'} {h.linea}</th>
                  {h.lvSab ? <td colSpan={2} className={celda} style={estilo}>{h.lvSab} hrs.</td> : (
                    <>
                      <td className={celda} style={estilo}>{h.lv} hrs.</td>
                      {h.sabDom ? <td colSpan={2} className={celda} style={estilo}>{h.sabDom} hrs.</td> : <td className={celda} style={estilo}>{h.sab} hrs.</td>}
                    </>
                  )}
                  {!h.sabDom && <td className={celda} style={estilo}>{h.dom} hrs.</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border-2" style={{ borderColor: '#E8541E' }}>
        <div className="px-3 py-1.5 text-center text-sm font-bold" style={{ color: '#E8541E' }}>{EXPRESO_12.titulo}</div>
        <div className="grid gap-px text-center text-sm text-white sm:grid-cols-3" style={{ background: '#E8541E' }}>
          <div className="p-2 font-semibold" style={{ background: '#E8541E' }}>{EXPRESO_12.estaciones}</div>
          <div className="p-2" style={{ background: '#E8541E' }}><div className="text-xs opacity-90">Lunes a viernes</div>{EXPRESO_12.lunesViernes}</div>
          <div className="p-2" style={{ background: '#E8541E' }}><div className="text-xs opacity-90">Sábado</div>{EXPRESO_12.sabado}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate">*{NOTA_HORARIOS} Información de la <a className="underline" href={FUENTE_URL} target="_blank" rel="noreferrer">Municipalidad de Guatemala</a>; puede cambiar.</p>
    </div>
  );
}

function HorariosRed({ lineas }: { lineas: any[] }) {
  const celda = 'px-3 py-2 text-center text-sm';
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <caption className="sr-only">Horarios de servicio de las líneas de la red</caption>
        <thead>
          <tr className="bg-route text-white">
            <th className="px-3 py-2 text-left text-sm">Línea</th>
            {DIAS_TXT.map(([d, t]) => <th key={d} className="px-3 py-2 text-sm">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={l.id_linea} className="border-b border-rule">
              <th scope="row" className="px-3 py-2 text-left text-sm font-semibold">
                <span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COLORES[i % COLORES.length] }} />{l.nombre}
              </th>
              {DIAS_TXT.map(([d]) => <td key={d} className={`${celda} ${l.horarios?.[d] ? 'font-semibold' : 'text-slate'}`}>{franjaTxt(l.horarios?.[d] ?? null)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CajaSugerencias({ lineas, estaciones }: { lineas: any[]; estaciones: any[] }) {
  const vacio = { tipo: 'SUGERENCIA', mensaje: '', nombre: '', contacto: '', id_linea: '', id_estacion: '' };
  const [v, setV] = useState(vacio);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cuerpo: any = { tipo: v.tipo, mensaje: v.mensaje };
      for (const k of ['nombre', 'contacto', 'id_linea', 'id_estacion'] as const) if (v[k]) cuerpo[k] = v[k];
      const r = await api.post('/publico/sugerencias', cuerpo);
      setMsg({ tipo: 'ok', texto: `Gracias por escribirnos. Su ${v.tipo === 'QUEJA' ? 'queja' : 'sugerencia'} quedó registrada con el folio ${r.folio}.` });
      setV(vacio);
    } catch (x) { setMsg({ tipo: 'error', texto: mensajeError(x) }); }
    setBusy(false);
  }

  return (
    <form onSubmit={enviar} className="panel p-5">
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
      <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Tipo de mensaje">
        {[['SUGERENCIA', 'Sugerencia'], ['QUEJA', 'Queja']].map(([k, t]) => (
          <button type="button" key={k} role="radio" aria-checked={v.tipo === k} onClick={() => setV({ ...v, tipo: k })} className={v.tipo === k ? 'btn-primary' : 'btn-ghost'}>{t}</button>
        ))}
      </div>
      <Field label="Cuéntenos qué ocurrió o qué podemos mejorar" ayuda={`${v.mensaje.length}/1000`}>
        <textarea className="input min-h-28" required minLength={10} maxLength={1000} value={v.mensaje} onChange={(e) => setV({ ...v, mensaje: e.target.value })} />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Línea (opcional)"><select className="input" value={v.id_linea} onChange={(e) => setV({ ...v, id_linea: e.target.value })}><option value="">No aplica</option>{lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre}</option>)}</select></Field>
        <Field label="Estación (opcional)"><select className="input" value={v.id_estacion} onChange={(e) => setV({ ...v, id_estacion: e.target.value })}><option value="">No aplica</option>{estaciones.map((s) => <option key={s.id_estacion} value={s.id_estacion}>{s.nombre}</option>)}</select></Field>
        <Field label="Su nombre (opcional)"><input className="input" maxLength={100} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></Field>
        <Field label="Teléfono o correo para responderle (opcional)"><input className="input" maxLength={120} value={v.contacto} onChange={(e) => setV({ ...v, contacto: e.target.value })} /></Field>
      </div>
      <button className="btn-primary" disabled={busy || v.mensaje.trim().length < 10}>{busy ? 'Enviando…' : 'Enviar'}</button>
    </form>
  );
}

function Reglas() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="panel p-4">
        <h3 className="mb-3 text-lg font-bold text-alarm">Está prohibido</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PROHIBIDO.map((r) => <li key={r} className="flex items-start gap-2 text-sm"><IconoProhibido />{r}</li>)}
          <li className="flex items-start gap-2 text-sm"><IconoCamara />Sonría, lo estamos grabando</li>
        </ul>
      </div>
      <div className="panel p-4">
        <h3 className="mb-3 text-lg font-bold text-route">Para viajar mejor</h3>
        <ul className="space-y-2">
          {RECOMENDACIONES.map((r) => <li key={r} className="flex items-start gap-2 text-sm"><IconoOk />{r}</li>)}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
        {[EQUIPAJE.mochilas, EQUIPAJE.maletas].map((e) => (
          <div key={e.titulo} className="panel p-4">
            <h3 className="text-lg font-bold">{e.titulo}</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-alarm">Tamaño máximo permitido</p>
            <p className="font-display text-lg font-bold">{e.medida}</p>
            <p className="mt-1 text-sm text-slate">{e.detalle}</p>
          </div>
        ))}
        <p className="rounded-lg border-2 border-route p-4 text-center text-sm font-medium sm:col-span-2">{EQUIPAJE.nota}</p>
      </div>
    </div>
  );
}

function PanelAcceso({ onClose }: { onClose: () => void }) {
  const { usuario, logout } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/50" onClick={onClose} aria-hidden />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label="Iniciar sesión" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto bg-white shadow-2xl">
        <FondoCiudades />
        <div className="relative flex min-h-full flex-col p-6">
          <div className="mb-6 flex items-start justify-between">
            <Logo alto={34} />
            <button className="btn-ghost !px-2.5" aria-label="Cerrar menú" onClick={onClose}>✕</button>
          </div>
          {usuario ? (
            <>
              <h2 className="text-2xl font-extrabold text-route">Hola, {usuario.nombre.split(' ')[0]}</h2>
              <p className="mb-5 mt-1 text-sm text-ink/70">{ROL_LABEL[usuario.rol]}</p>
              <div className="space-y-2 rounded-lg border border-rule bg-white/90 p-4 backdrop-blur-sm">
                <Link to="/" className="btn-primary w-full">Ir a mi panel</Link>
                <button className="btn-ghost w-full" onClick={() => { onClose(); logout(); }}>Cerrar sesión</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-route">Iniciar sesión</h2>
              <p className="mb-5 mt-1 text-sm text-ink/70">Pasajeros y personal del sistema.</p>
              <div className="rounded-lg border border-rule bg-white/90 p-4 backdrop-blur-sm"><LoginForm /></div>
            </>
          )}
          <nav aria-label="Ir a una sección" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-route">
            {[['#mapa', 'Mapa'], ['#horarios', 'Horarios'], ['#reglas', 'Reglas'], ['#recargar', 'Recargar tarjeta'], ['#sugerencias', 'Sugerencias y quejas']].map(([h, t]) => (
              <a key={h} href={h} onClick={onClose} className="underline decoration-verde decoration-2 underline-offset-4">{t}</a>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}

export default function Inicio() {
  const { usuario } = useAuth();
  const { data: red, error, loading } = useLoad<any>(() => api.get('/publico/red'));
  const [buscar, setBuscar] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => { document.documentElement.style.scrollBehavior = 'smooth'; return () => { document.documentElement.style.scrollBehavior = ''; }; }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b-4 border-verde bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
          <Link to={usuario ? '/inicio' : '/'} aria-label="Pantalla principal" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Logo alto={38} /></Link>
          <nav aria-label="Secciones" className="ml-4 hidden gap-6 text-sm font-bold uppercase tracking-wide text-route lg:flex">
            <a href="#mapa" className="hover:text-verde-dark">Mapa</a>
            <a href="#horarios" className="hover:text-verde-dark">Horarios</a>
            <a href="#reglas" className="hover:text-verde-dark">Reglas</a>
            <a href="#sugerencias" className="hover:text-verde-dark">Sugerencias</a>
            <a href="#recargar" className="hover:text-verde-dark">Recargar tarjeta</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {usuario ? <Link to="/" className="btn-primary hidden sm:inline-flex">Ir a mi panel</Link> : <button className="btn-primary hidden sm:inline-flex" onClick={() => setMenu(true)}>Iniciar sesión</button>}
            <button className="btn-ghost !px-2.5" aria-label={usuario ? "Abrir menú de usuario" : "Abrir menú de acceso"} aria-expanded={menu} onClick={() => setMenu(true)}>
              <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-6 md:px-8">
        <section className="relative isolate overflow-hidden rounded-lg bg-route text-white">
          <img src="/fotos/ciudad-de-guatemala.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-route/95 via-route/75 to-route/25" />
          <div className="p-6 md:p-9">
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight md:text-4xl">Muévase por la ciudad con Transmetro</h1>
            <p className="mt-2 max-w-xl text-white/80">Consulte las líneas, estaciones y horarios, conozca las reglas del servicio y recargue su tarjeta desde aquí.</p>
            {red && (
              <dl className="mt-6 grid max-w-xl grid-cols-2 gap-5 sm:grid-cols-4">
                {[['Líneas', red.resumen.lineas], ['Estaciones', red.resumen.estaciones], ['Municipalidades', red.resumen.municipalidades], ['Pasaje', quetzales(red.tarifa)]].map(([t, v]) => (
                  <div key={t as string} className="flex flex-col-reverse"><dt className="text-xs text-white/75">{t}</dt><dd className="font-display text-3xl font-extrabold">{v}</dd></div>
                ))}
              </dl>
            )}
          </div>
          <div className="h-2 bg-verde" />
        </section>

        <Estado loading={loading} error={error}>
          {red && (
            <>
              <section id="mapa" className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="titulo-seccion">Mapa de estaciones</h2>
                  <div>
                    <input className="input !w-64" list="lista-estaciones" placeholder="Buscar una estación…" aria-label="Buscar una estación" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
                    <datalist id="lista-estaciones">{red.estaciones.map((e: any) => <option key={e.id_estacion} value={e.nombre} />)}</datalist>
                  </div>
                </div>
                <div className="panel isolate overflow-hidden"><MapaRed red={red} buscar={buscar} /></div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  {red.lineas.map((l: any, i: number) => <span key={l.id_linea} className="inline-flex items-center gap-2"><span aria-hidden className="h-1.5 w-6 rounded" style={{ background: COLORES[i % COLORES.length] }} />{l.nombre}</span>)}
                </div>
              </section>

              <div className="grid gap-8 xl:grid-cols-2">
                <section id="recargar" className="scroll-mt-24">
                  <h2 className="titulo-seccion mb-3">Recargar tarjeta</h2>
                  <div className="panel p-4"><RecargaPublica /></div>
                  {!usuario && <p className="mt-2 text-sm text-slate">Para ver su saldo y el historial de sus pagos, <button className="font-semibold text-route underline" onClick={() => setMenu(true)}>inicie sesión</button> o cree una cuenta de pasajero.</p>}
                </section>

                <section id="lineas" className="scroll-mt-24">
                  <h2 className="titulo-seccion mb-3">Líneas y recorridos</h2>
                  <div className="space-y-2">
                    {red.lineas.map((l: any) => (
                      <details key={l.id_linea} className="panel p-3">
                        <summary className="cursor-pointer list-none font-semibold">
                          {l.nombre} <span className="ml-1 text-sm font-normal text-slate">· {l.municipalidad} · {l.paradas.length} estaciones · {km(l.distancia_total_km)}</span>
                        </summary>
                        <ol className="ml-2 mt-3 border-l-4 border-verde pl-5">
                          {l.paradas.map((p: any, i: number) => (
                            <li key={p.orden} className="relative pb-3 last:pb-0">
                              <span aria-hidden className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-[3px] border-route bg-white" />
                              <div className="text-sm font-medium">{p.estacion}</div>
                              {i < l.paradas.length - 1 && <div className="text-xs text-verde-dark">{km(p.distancia_a_siguiente_km)} a la siguiente</div>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </Estado>

        <section id="horarios" className="scroll-mt-24">
          <h2 className="titulo-seccion mb-3">Horarios de servicio</h2>
          {red && <HorariosRed lineas={red.lineas} />}
          <details className="panel mt-4 p-3">
            <summary className="cursor-pointer font-semibold">Horarios oficiales publicados por la Municipalidad de Guatemala (referencia)</summary>
            <div className="mt-3"><Horarios /></div>
          </details>
        </section>

        <section id="reglas" className="scroll-mt-24">
          <h2 className="titulo-seccion mb-3">Reglas para usar el Transmetro</h2>
          <Reglas />
        </section>
      </main>

      <section id="sugerencias" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-10 md:px-8">
        <h2 className="titulo-seccion mb-3">Sugerencias y quejas</h2>
        <CajaSugerencias lineas={red?.lineas ?? []} estaciones={red?.estaciones ?? []} />
      </section>

      <footer className="mt-6 border-t-4 border-verde bg-white py-5 text-center text-xs text-slate">
        <Logo alto={26} className="mx-auto mb-2" />
        Sistema de Control de Líneas, Estaciones y Buses · Ciudad de Guatemala y municipios
      </footer>

      {menu && <PanelAcceso onClose={() => setMenu(false)} />}
    </div>
  );
}
