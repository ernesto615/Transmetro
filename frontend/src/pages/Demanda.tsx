import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { Badge, Estado, Notice, PageHeader, Tabla, useLoad } from '../components/ui';

const COLORES = ['#10069F', '#6DB52A', '#E8541E', '#5B2C8F', '#0A9BD9', '#C98500'];
const colorDe = (id: number) => COLORES[(id - 1) % COLORES.length];
const NIVEL: Record<string, { texto: string; tono: 'error' | 'aviso' | 'ok' | 'neutro'; borde: string }> = {
  CRITICA: { texto: 'Crítica', tono: 'error', borde: 'border-alarm' },
  ALTA: { texto: 'Alta', tono: 'aviso', borde: 'border-signal' },
  NORMAL: { texto: 'Normal', tono: 'ok', borde: 'border-verde' },
  BAJA: { texto: 'Baja', tono: 'neutro', borde: 'border-slate' },
  SIN_DATOS: { texto: 'Sin datos', tono: 'neutro', borde: 'border-rule' },
};
const num = (n: number) => n.toLocaleString('es-GT');
const diaCorto = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' });

export default function Demanda() {
  const { usuario } = useAuth();
  const [dias, setDias] = useState(30);
  const { data: r, error, loading, reload } = useLoad<any>(() => api.get(`/demanda?dias=${dias}`), [dias]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Una fila por día con una columna por línea, como pide la gráfica
  const serie = useMemo(() => {
    if (!r) return [];
    const porDia = new Map<string, any>();
    for (const s of r.serie_diaria) porDia.set(s.dia, { ...(porDia.get(s.dia) ?? { dia: s.dia, etiqueta: diaCorto(s.dia) }), [`l${s.id_linea}`]: s.pasajes });
    return [...porDia.values()];
  }, [r]);

  async function notificar() {
    try {
      const x = await api.post(`/demanda/notificar?dias=${dias}`);
      setMsg({ tipo: 'ok', texto: x.creadas ? `Se enviaron ${x.creadas} alerta(s) al centro de control.` : 'No hay recomendaciones nuevas que notificar: las alertas abiertas ya fueron enviadas.' });
      reload();
    } catch (e) { setMsg({ tipo: 'error', texto: mensajeError(e) }); }
  }

  const recomendaciones = r?.lineas.filter((l: any) => l.recomendacion) ?? [];

  return (
    <>
      <PageHeader title="Demanda y capacidad" subtitle="Qué líneas se usan más, cuáles están saturadas y dónde conviene agregar buses o abrir una línea nueva."
        actions={<>
          <select className="input !w-auto" aria-label="Período de análisis" value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}</select>
          {usuario?.rol === 'admin' && <button className="btn-primary" onClick={notificar} disabled={!recomendaciones.some((l: any) => l.nivel === 'CRITICA' || l.nivel === 'ALTA')}>Notificar al centro de control</button>}
        </>} />
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
      <Estado loading={loading} error={error}>
        {r && (
          <>
            <div className="panel mb-5 grid grid-cols-2 divide-rule sm:grid-cols-5 sm:divide-x">
              {[
                ['Pasajes en el período', num(r.total_pasajes)],
                ['Promedio por día', num(Math.round(r.total_pasajes / r.dias))],
                ['Carga promedio por bus', `${r.carga_promedio_red} pasajes/día`],
                ['Líneas críticas o altas', r.resumen.criticas + r.resumen.altas],
                ['Líneas con buses de sobra', r.resumen.bajas],
              ].map(([t, v]) => <div key={t as string} className="p-4"><div className={`font-display text-2xl font-extrabold ${t === 'Líneas críticas o altas' && (v as number) > 0 ? 'text-alarm' : ''}`}>{v}</div><div className="text-sm text-slate">{t}</div></div>)}
            </div>

            <section className="mb-6">
              <h2 className="mb-2 text-xl">Recomendaciones</h2>
              {recomendaciones.length === 0 ? <Notice tipo="ok">La capacidad de todas las líneas es adecuada para la demanda actual.</Notice> : (
                <div className="space-y-3">
                  {recomendaciones.map((l: any) => (
                    <article key={l.id_linea} className={`panel border-l-4 p-4 ${NIVEL[l.nivel].borde}`}>
                      <div className="flex flex-wrap items-center gap-2"><Badge tono={NIVEL[l.nivel].tono}>Demanda {NIVEL[l.nivel].texto.toLowerCase()}</Badge><strong>{l.nombre}</strong></div>
                      <p className="mt-2">{l.recomendacion}</p>
                      {l.estaciones_mas_usadas.length > 0 && (l.nivel === 'CRITICA' || l.nivel === 'ALTA') && (
                        <p className="mt-1 text-sm text-slate">Estaciones con más pasajes en esta línea: {l.estaciones_mas_usadas.join(', ')}.{l.necesita_linea_nueva ? ' Una línea o servicio expreso nuevo podría conectar esos puntos.' : ''}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-xl">Uso por línea</h2>
              <Tabla cols={['#', 'Línea', 'Pasajes', 'Participación', 'Pasajes/día', 'Buses (mín–máx)', 'Pasajes por bus/día', 'Vs. promedio', 'Tendencia', 'Sobrecupos 7 d', 'Estado']}>
                {r.lineas.map((l: any, i: number) => (
                  <tr key={l.id_linea}>
                    <td className="td font-semibold">{i + 1}</td>
                    <td className="td whitespace-nowrap font-medium"><span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: colorDe(l.id_linea) }} />{l.nombre}{i === 0 && l.pasajes > 0 && <span className="ml-2"><Badge tono="ok">Más usada</Badge></span>}</td>
                    <td className="td">{num(l.pasajes)}</td>
                    <td className="td"><div className="flex items-center gap-2"><div className="h-2 w-20 rounded bg-paper"><div className="h-2 rounded" style={{ width: `${l.participacion_pct}%`, background: colorDe(l.id_linea) }} /></div>{l.participacion_pct} %</div></td>
                    <td className="td">{num(l.pasajes_dia)}</td>
                    <td className="td">{l.buses} <span className="text-slate">({l.minimo}–{l.maximo})</span></td>
                    <td className="td">{l.carga_por_bus}</td>
                    <td className="td">{l.indice_vs_red} ×</td>
                    <td className={`td ${l.crecimiento_pct !== null && l.crecimiento_pct >= 20 ? 'font-semibold text-alarm' : ''}`}>{l.crecimiento_pct === null ? '—' : `${l.crecimiento_pct > 0 ? '+' : ''}${l.crecimiento_pct} %`}</td>
                    <td className="td">{l.sobrecupos_7d}</td>
                    <td className="td"><Badge tono={NIVEL[l.nivel].tono}>{NIVEL[l.nivel].texto}</Badge></td>
                  </tr>
                ))}
              </Tabla>
              <p className="mt-2 text-xs text-slate">La carga se mide en pasajes por bus por día y se compara con el promedio de toda la red. Crítica: 1.5 veces el promedio o 5 alertas de sobrecupo en 7 días; alta: 1.25 veces o 2 alertas; baja: la mitad del promedio o menos. Tendencia: cambio frente al período anterior de igual duración.</p>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <section className="panel p-4">
                <h2 className="mb-3 text-xl">Pasajes por día</h2>
                {serie.length === 0 ? <p className="text-sm text-slate">Aún no hay pasajes con línea registrada en este período.</p> : (
                  <div className="h-72" role="img" aria-label="Pasajes por día de cada línea">
                    <ResponsiveContainer>
                      <LineChart data={serie}>
                        <CartesianGrid stroke="#D3DAE6" vertical={false} />
                        <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        {r.lineas.map((l: any) => <Line key={l.id_linea} type="monotone" dataKey={`l${l.id_linea}`} name={l.nombre} stroke={colorDe(l.id_linea)} strokeWidth={2} dot={false} />)}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
              <section>
                <h2 className="mb-2 text-xl">Estaciones con más pasajes</h2>
                <Tabla cols={['Estación', 'Pasajes', 'Sobrecupos 7 d']}>
                  {r.estaciones_top.map((e: any) => <tr key={e.id_estacion}><td className="td font-medium">{e.nombre}</td><td className="td">{num(e.pasajes)}</td><td className="td">{e.sobrecupos_7d}</td></tr>)}
                </Tabla>
              </section>
            </div>
          </>
        )}
      </Estado>
    </>
  );
}
