import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { Badge, Estado, Notice, PageHeader, Tabla, km, useLoad } from '../components/ui';

// Recorrido dibujado como línea de metro: estaciones en orden con la distancia de cada tramo.
function Recorrido({ paradas }: { paradas: any[] }) {
  if (paradas.length === 0) return <p className="text-sm text-slate">Esta línea aún no tiene estaciones.</p>;
  const paso = 150, w = Math.max(paradas.length * paso, 320);
  return (
    <div className="overflow-x-auto">
      <svg width={w} height={110} role="img" aria-label="Recorrido de la línea">
        <line x1={paso / 2} y1="40" x2={w - paso / 2} y2="40" stroke="#10069F" strokeWidth="6" strokeLinecap="round" />
        {paradas.map((p, i) => {
          const x = paso / 2 + i * paso;
          const compartida = (p.estacion.lineas?.length ?? 0) > 1;
          return (
            <g key={p.id_estacion}>
              <circle cx={x} cy="40" r={compartida ? 12 : 9} fill="#FFFFFF" stroke="#12142B" strokeWidth="4" />
              <text x={x} y="72" textAnchor="middle" fontSize="13" fontWeight="600" fill="#12142B">{p.estacion.nombre}</text>
              {compartida && <text x={x} y="90" textAnchor="middle" fontSize="11" fill="#555B73">conecta con otra línea</text>}
              {i < paradas.length - 1 && <text x={x + paso / 2} y="26" textAnchor="middle" fontSize="12" fill="#0B0475">{km(p.distancia_a_siguiente_km)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function LineaDetalle() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const admin = usuario?.rol === 'admin';
  const { data: l, error, loading, reload } = useLoad<any>(() => api.get(`/lineas/${id}/detalle`), [id]);
  const { data: todasEstaciones } = useLoad<any[]>(() => api.get('/estaciones'));
  const { data: todosBuses, reload: recargarBuses } = useLoad<any[]>(() => api.get('/buses'));
  const [paradas, setParadas] = useState<{ id_estacion: number; nombre: string; d: string }[]>([]);
  const [agregar, setAgregar] = useState('');
  const [busAsignar, setBusAsignar] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null);

  useEffect(() => {
    if (l) setParadas(l.paradas.map((p: any) => ({ id_estacion: p.id_estacion, nombre: p.estacion.nombre, d: String(p.distancia_a_siguiente_km) })));
  }, [l]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg({ tipo: 'ok', texto: ok }); reload(); recargarBuses(); } catch (e) { setMsg({ tipo: 'error', texto: mensajeError(e) }); }
  };
  const mover = (i: number, dir: number) => {
    const p = [...paradas]; const j = i + dir;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]]; setParadas(p);
  };
  const guardarRecorrido = () => run(
    () => api.put(`/lineas/${id}/estaciones`, { paradas: paradas.map((p) => ({ id_estacion: p.id_estacion, distancia_a_siguiente_km: Number(p.d) || 0 })) }),
    'Recorrido guardado. La distancia total se recalculó.',
  );

  const c = l?.cumplimiento;
  const sinLinea = todosBuses?.filter((b) => !b.id_linea) ?? [];
  const libres = todasEstaciones?.filter((e) => !paradas.some((p) => p.id_estacion === e.id_estacion)) ?? [];

  return (
    <>
      <p className="mb-2 text-sm"><Link to="/lineas" className="text-route-dark underline">← Líneas</Link></p>
      <Estado loading={loading} error={error}>
        {l && (
          <>
            <PageHeader title={l.nombre} subtitle={`${l.municipalidad?.nombre} · ${paradas.length} estaciones · ${km(l.distancia_total_km)} de recorrido`}
              actions={c && (c.cumple ? <Badge tono="ok">{c.buses} buses · rango {c.min}–{c.max}</Badge> : <Badge tono="error">{c.buses} buses · se requieren {c.min}–{c.max}</Badge>)} />
            {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}

            <section className="panel mb-5 p-4"><Recorrido paradas={l.paradas} /></section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="panel p-4">
                <h2 className="mb-1 text-xl">Orden de estaciones</h2>
                <p className="mb-3 text-sm text-slate">La distancia de cada fila es el tramo hasta la estación siguiente.</p>
                <ol className="space-y-2">
                  {paradas.map((p, i) => (
                    <li key={p.id_estacion} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-right text-slate">{i + 1}</span>
                      <span className="flex-1 font-medium">{p.nombre}</span>
                      {i < paradas.length - 1 ? (
                        <input aria-label={`Distancia desde ${p.nombre}`} disabled={!admin} className="input !w-24" type="number" min="0" step="0.1" value={p.d}
                          onChange={(e) => setParadas(paradas.map((x, k) => (k === i ? { ...x, d: e.target.value } : x)))} />
                      ) : <span className="w-24 text-xs text-slate">última</span>}
                      {admin && (
                        <>
                          <button className="btn-ghost !px-2 !py-1" aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
                          <button className="btn-ghost !px-2 !py-1" aria-label="Bajar" onClick={() => mover(i, 1)}>↓</button>
                          <button className="btn-ghost !px-2 !py-1 text-alarm" aria-label="Quitar" onClick={() => setParadas(paradas.filter((_, k) => k !== i))}>✕</button>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                {admin && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3">
                    <select className="input !w-auto min-w-48" value={agregar} onChange={(e) => setAgregar(e.target.value)} aria-label="Estación a agregar">
                      <option value="">Agregar estación…</option>
                      {libres.map((e) => <option key={e.id_estacion} value={e.id_estacion}>{e.nombre}</option>)}
                    </select>
                    <button className="btn-ghost" disabled={!agregar} onClick={() => {
                      const e = libres.find((x) => x.id_estacion === Number(agregar))!;
                      setParadas([...paradas, { id_estacion: e.id_estacion, nombre: e.nombre, d: '1' }]); setAgregar('');
                    }}>Agregar al final</button>
                    <button className="btn-primary ml-auto" onClick={guardarRecorrido}>Guardar recorrido</button>
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-2 text-xl">Buses asignados</h2>
                <Tabla cols={['Placa', 'Capacidad', 'Parqueo', 'Piloto', ...(admin ? [''] : [])]}>
                  {l.buses.length === 0 && <tr><td className="td text-slate" colSpan={5}>Esta línea todavía no tiene buses.</td></tr>}
                  {l.buses.map((b: any) => (
                    <tr key={b.id_bus}>
                      <td className="td font-medium">{b.placa}</td>
                      <td className="td">{b.capacidad_maxima}</td>
                      <td className="td">{b.parqueo?.nombre}</td>
                      <td className="td">{b.pilotos.map((p: any) => p.nombre).join(', ') || '—'}</td>
                      {admin && <td className="td"><button className="btn-ghost !px-2 !py-1" onClick={() => run(() => api.put(`/buses/${b.id_bus}/linea`, { id_linea: null }), `Bus ${b.placa} retirado de la línea.`)}>Retirar</button></td>}
                    </tr>
                  ))}
                </Tabla>
                {admin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select className="input !w-auto min-w-48" value={busAsignar} onChange={(e) => setBusAsignar(e.target.value)} aria-label="Bus a asignar">
                      <option value="">Buses sin línea…</option>
                      {sinLinea.map((b) => <option key={b.id_bus} value={b.id_bus}>{b.placa} ({b.capacidad_maxima} pas.)</option>)}
                    </select>
                    <button className="btn-primary" disabled={!busAsignar} onClick={() => run(() => api.put(`/buses/${busAsignar}/linea`, { id_linea: Number(id) }), 'Bus asignado a la línea.').then(() => setBusAsignar(''))}>Asignar a esta línea</button>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </Estado>
    </>
  );
}
