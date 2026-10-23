import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, mensajeError } from '../api';
import { Badge, Estado, Field, Modal, Notice, PageHeader, Tabla, moneda, quetzales, useLoad } from '../components/ui';

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
const mesCorto = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('es-GT', { month: 'short', year: '2-digit' });
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });

function Kpi({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota?: string; tono?: 'bien' | 'mal' }) {
  return (
    <div className="p-4">
      <div className={`font-display text-2xl font-extrabold ${tono === 'mal' ? 'text-alarm' : tono === 'bien' ? 'text-verde-dark' : ''}`}>{valor}</div>
      <div className="text-sm font-medium">{titulo}</div>
      {nota && <div className="text-xs text-slate">{nota}</div>}
    </div>
  );
}

function NuevoMovimiento({ categorias, lineas, onClose, onGuardado }: { categorias: { egreso: string[]; ingreso: string[] }; lineas: any[]; onClose: () => void; onGuardado: () => void }) {
  const [v, setV] = useState({ tipo: 'EGRESO', categoria: '', monto: '', fecha: hoy(), descripcion: '', id_linea: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opciones = v.tipo === 'EGRESO' ? categorias.egreso : categorias.ingreso;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cuerpo: any = { tipo: v.tipo, categoria: v.categoria, monto: Number(v.monto), fecha: v.fecha };
      if (v.descripcion.trim()) cuerpo.descripcion = v.descripcion.trim();
      if (v.id_linea) cuerpo.id_linea = Number(v.id_linea);
      await api.post('/finanzas/movimientos', cuerpo);
      onGuardado();
    } catch (x) { setErr(mensajeError(x)); setBusy(false); }
  }

  return (
    <Modal title="Registrar movimiento" onClose={onClose}>
      <form onSubmit={enviar}>
        {err && <Notice>{err}</Notice>}
        <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Tipo de movimiento">
          {[['EGRESO', 'Egreso (gasto)'], ['INGRESO', 'Ingreso']].map(([k, t]) => (
            <button type="button" key={k} role="radio" aria-checked={v.tipo === k} className={v.tipo === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setV({ ...v, tipo: k, categoria: '' })}>{t}</button>
          ))}
        </div>
        <Field label="Categoría"><select className="input" required value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value })}><option value="">Seleccione…</option>{opciones.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Monto (Q)"><input className="input" type="number" min="0.01" step="0.01" required value={v.monto} onChange={(e) => setV({ ...v, monto: e.target.value })} /></Field>
          <Field label="Fecha"><input className="input" type="date" required value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} /></Field>
        </div>
        <Field label="Línea (opcional)"><select className="input" value={v.id_linea} onChange={(e) => setV({ ...v, id_linea: e.target.value })}><option value="">Toda la red</option>{lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre}</option>)}</select></Field>
        <Field label="Descripción (opcional)"><input className="input" maxLength={255} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Field>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </Modal>
  );
}

export default function Finanzas() {
  const [meses, setMeses] = useState(6);
  const { data: r, error, loading, reload } = useLoad<any>(() => api.get(`/finanzas/resumen?meses=${meses}`), [meses]);
  const mov = useLoad<any[]>(() => api.get(`/finanzas/movimientos?meses=${meses}`), [meses]);
  const { data: categorias } = useLoad<any>(() => api.get('/finanzas/categorias'));
  const { data: lineas } = useLoad<any[]>(() => api.get('/lineas'));
  const [nuevo, setNuevo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const k = r?.kpis;
  const grafica = r?.mensual.map((m: any) => ({ ...m, etiqueta: mesCorto(m.mes) }));
  const refrescar = () => { reload(); mov.reload(); };

  async function eliminar(m: any) {
    if (!confirm(`¿Eliminar el movimiento «${m.categoria}» por ${moneda(m.monto)}?`)) return;
    try { await api.del(`/finanzas/movimientos/${m.id_movimiento}`); refrescar(); } catch (e) { setAviso(mensajeError(e)); }
  }

  return (
    <>
      <PageHeader title="Finanzas y flujo de caja" subtitle="Entradas y salidas de dinero de la operación, y cuánto de los gastos cubre el pasaje."
        actions={<>
          <select className="input !w-auto" aria-label="Período" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>{[3, 6, 12].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}</select>
          <button className="btn-primary" onClick={() => setNuevo(true)}>Registrar movimiento</button>
        </>} />
      {aviso && <Notice>{aviso}</Notice>}
      <Estado loading={loading} error={error}>
        {r && (
          <>
            <div className="panel mb-5 grid grid-cols-2 divide-rule sm:grid-cols-4 lg:grid-cols-7 lg:divide-x">
              <Kpi titulo="Entradas de efectivo" valor={moneda(k.entradas)} nota={`Recargas ${moneda(k.entradas_recargas)} · otros ${moneda(k.entradas_otras)}`} />
              <Kpi titulo="Salidas" valor={moneda(k.salidas)} />
              <Kpi titulo="Flujo neto de caja" valor={moneda(k.flujo_neto)} tono={k.flujo_neto >= 0 ? 'bien' : 'mal'} />
              <Kpi titulo="Ingresos por pasajes" valor={moneda(k.ingreso_pasajes)} nota={`${k.pasajes.toLocaleString('es-GT')} pasajes`} />
              <Kpi titulo="Cobertura de costos" valor={k.cobertura_costos_pct === null ? '—' : `${k.cobertura_costos_pct} %`} nota="Pasajes ÷ salidas" />
              <Kpi titulo="Costo por pasajero" valor={k.costo_por_pasajero === null ? '—' : quetzales(k.costo_por_pasajero)} />
              <Kpi titulo="Saldo prepago en tarjetas" valor={moneda(k.pasivo_prepago)} nota="Recargado y sin usar" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
              <section className="panel p-4">
                <h2 className="mb-1 text-xl">Flujo de caja por mes</h2>
                <p className="mb-3 text-sm text-slate">Barras: dinero que entra y sale. Línea azul: flujo neto del mes. Línea gris: neto acumulado del período.</p>
                <div className="h-80" role="img" aria-label="Gráfico de entradas, salidas y flujo neto por mes">
                  <ResponsiveContainer>
                    <ComposedChart data={grafica}>
                      <CartesianGrid stroke="#D3DAE6" vertical={false} />
                      <XAxis dataKey="etiqueta" />
                      <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: any) => moneda(v)} />
                      <Legend />
                      <Bar dataKey="entradas" name="Entradas" fill="#6DB52A" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="salidas" name="Salidas" fill="#C2362B" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="neto" name="Flujo neto" stroke="#10069F" strokeWidth={2.5} />
                      <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="#555B73" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel p-4">
                <h2 className="mb-3 text-xl">¿En qué se gasta?</h2>
                {r.egresos_por_categoria.length === 0 ? <p className="text-sm text-slate">Aún no hay egresos registrados en el período.</p> : (
                  <div style={{ height: Math.max(180, r.egresos_por_categoria.length * 44) }} role="img" aria-label="Egresos por categoría">
                    <ResponsiveContainer>
                      <BarChart data={r.egresos_por_categoria} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid stroke="#D3DAE6" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="categoria" width={130} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: any) => moneda(v)} />
                        <Bar dataKey="total" name="Total" fill="#C2362B" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {r.ingresos_por_categoria.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 text-base">Otros ingresos</h3>
                    <ul className="space-y-1 text-sm">{r.ingresos_por_categoria.map((i: any) => <li key={i.categoria} className="flex justify-between"><span>{i.categoria}</span><strong>{moneda(i.total)}</strong></li>)}</ul>
                  </>
                )}
              </section>
            </div>

            <details className="panel mt-5 p-3">
              <summary className="cursor-pointer font-semibold">Cómo leer este tablero</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">
                <li><strong>Entradas de efectivo:</strong> dinero que realmente ingresa: recargas de tarjetas (en estación y en línea) más otros ingresos registrados, como subsidios y publicidad.</li>
                <li><strong>Ingresos por pasajes:</strong> el consumo del saldo prepagado. Una recarga es efectivo que entra hoy; el pasaje es el momento en que ese dinero se gana.</li>
                <li><strong>Saldo prepago:</strong> dinero recargado que los pasajeros todavía no usan. Es una obligación del sistema con ellos.</li>
                <li><strong>Cobertura de costos:</strong> qué porcentaje de las salidas cubre solo el cobro de pasajes. El resto debe venir de subsidios u otros ingresos.</li>
              </ul>
            </details>

            <div className="mb-2 mt-6 flex items-center justify-between"><h2 className="text-xl">Movimientos registrados</h2></div>
            <Estado loading={mov.loading} error={mov.error} vacio={mov.data?.length === 0 && 'No hay movimientos en el período.'}>
              <Tabla cols={['Fecha', 'Tipo', 'Categoría', 'Línea', 'Descripción', 'Monto', '']}>
                {mov.data?.map((m) => (
                  <tr key={m.id_movimiento}>
                    <td className="td whitespace-nowrap">{fechaCorta(m.fecha)}</td>
                    <td className="td"><Badge tono={m.tipo === 'INGRESO' ? 'ok' : 'error'}>{m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}</Badge></td>
                    <td className="td">{m.categoria}</td><td className="td">{m.linea?.nombre ?? 'Toda la red'}</td><td className="td">{m.descripcion ?? '—'}</td>
                    <td className="td whitespace-nowrap text-right font-semibold">{m.tipo === 'INGRESO' ? '+' : '−'}{moneda(m.monto)}</td>
                    <td className="td"><button className="btn-ghost !px-2 !py-1 text-alarm" onClick={() => eliminar(m)}>Eliminar</button></td>
                  </tr>
                ))}
              </Tabla>
            </Estado>
          </>
        )}
      </Estado>
      {nuevo && categorias && <NuevoMovimiento categorias={categorias} lineas={lineas ?? []} onClose={() => setNuevo(false)} onGuardado={() => { setNuevo(false); refrescar(); }} />}
    </>
  );
}
