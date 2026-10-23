import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Badge, Estado, PageHeader, quetzales, useLoad } from '../components/ui';

export default function Dashboard() {
  const { usuario } = useAuth();
  const veDemanda = usuario?.rol === 'admin' || usuario?.rol === 'municipal';
  const { data: d, error, loading } = useLoad<any>(() => api.get('/dashboard'));
  const t = d?.totales;
  const cifras = t && [
    ['Líneas', t.lineas], ['Estaciones', t.estaciones], ['Buses', t.buses], ['Pilotos', t.pilotos],
    ['Alertas abiertas', t.alertas_abiertas], ['Incidentes (7 días)', t.incidentes_7d],
  ];

  return (
    <>
      <PageHeader title="Tablero de control" subtitle="Estado general de la red y los puntos que requieren atención." />
      <Estado loading={loading} error={error}>
        {d && (
          <>
            <div className="panel mb-5 grid grid-cols-2 divide-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
              {cifras.map(([l, v]: any) => (
                <div key={l} className="p-4">
                  <div className={`font-display text-4xl font-semibold ${(l === 'Alertas abiertas' && v > 0) ? 'text-alarm' : ''}`}>{v}</div>
                  <div className="text-sm text-slate">{l}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <section className="panel p-4">
                <h2 className="mb-1 text-xl">Buses asignados por línea</h2>
                <p className="mb-3 text-sm text-slate">Cada línea debe tener entre tantos buses como estaciones y el doble.</p>
                <div className="h-72" role="img" aria-label="Gráfico de buses asignados por línea frente al rango permitido">
                  <ResponsiveContainer>
                    <ComposedChart data={d.buses_por_linea}>
                      <CartesianGrid stroke="#D3DAE6" vertical={false} />
                      <XAxis dataKey="linea" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="buses" name="Buses asignados" fill="#6DB52A" radius={[3, 3, 0, 0]} />
                      <Line type="stepAfter" dataKey="min" name="Mínimo" stroke="#C98500" strokeWidth={2} dot={false} />
                      <Line type="stepAfter" dataKey="max" name="Máximo" stroke="#C2362B" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel p-4">
                <h2 className="mb-3 text-xl">Requiere atención</h2>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start justify-between gap-2">
                    <span>Alertas sin atender</span>
                    {t.alertas_abiertas ? <Link to="/alertas" className="underline"><Badge tono="error">{t.alertas_abiertas} abiertas</Badge></Link> : <Badge tono="ok">Ninguna</Badge>}
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span>Buses sin línea asignada</span>
                    {t.buses_sin_linea ? <Link to="/buses" className="underline"><Badge tono="aviso">{t.buses_sin_linea}</Badge></Link> : <Badge tono="ok">Ninguno</Badge>}
                  </li>
                  <li className="flex items-start justify-between gap-2">
                    <span>Líneas con demanda crítica o alta</span>
                    {d.capacidad.criticas + d.capacidad.altas > 0
                      ? (veDemanda ? <Link to="/demanda" className="underline"><Badge tono="error">{d.capacidad.criticas + d.capacidad.altas} requieren refuerzo</Badge></Link> : <Badge tono="error">{d.capacidad.criticas + d.capacidad.altas}</Badge>)
                      : <Badge tono="ok">Ninguna</Badge>}
                  </li>
                  <li>
                    <div className="mb-1">Líneas fuera del rango de buses</div>
                    {d.lineas_fuera_de_rango.length === 0 ? <Badge tono="ok">Todas cumplen</Badge> : (
                      <ul className="space-y-1">
                        {d.lineas_fuera_de_rango.map((l: any) => (
                          <li key={l.id_linea}><Link className="underline" to={`/lineas/${l.id_linea}`}>{l.linea}</Link> — {l.buses} buses (permitido {l.rango})</li>
                        ))}
                      </ul>
                    )}
                  </li>
                  <li className="flex items-start justify-between gap-2 border-t border-rule pt-3">
                    <span>Recaudo acumulado con tarjeta</span><strong>{quetzales(d.recaudo_total)}</strong>
                  </li>
                </ul>
              </section>
            </div>
          </>
        )}
      </Estado>
    </>
  );
}
