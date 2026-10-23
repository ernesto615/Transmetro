import { useState } from 'react';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { Formulario } from '../components/ResourcePage';
import { Estado, Field, Notice, PageHeader, Tabla, fechaHora, quetzales, useLoad } from '../components/ui';

export default function Cobros() {
  const { usuario } = useAuth();
  const { data: tarjetas, reload: rt } = useLoad<any[]>(() => api.get('/tarjetas'));
  const { data: estaciones } = useLoad<any[]>(() => api.get('/estaciones'));
  const { data: txs, error, loading, reload: rx } = useLoad<any[]>(() => api.get('/pagos'));
  const { data: lineas } = useLoad<any[]>(() => api.get('/lineas'));
  const [linea, setLinea] = useState('');
  const [numero, setNumero] = useState('');
  const [estacion, setEstacion] = useState(String(usuario?.idEstacion ?? ''));
  const [monto, setMonto] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [nueva, setNueva] = useState(false);

  const base = () => ({ numero_tarjeta: numero, id_estacion: estacion ? Number(estacion) : undefined, id_linea: linea ? Number(linea) : undefined, monto: monto ? Number(monto) : undefined });

  async function accion(tipo: 'cobrar' | 'recargar') {
    try {
      const referencia = crypto.randomUUID(); // idempotencia: un reintento no cobra dos veces
      const b = base();
      const r = tipo === 'cobrar'
        ? await api.post('/pagos', { ...b, referencia })
        : await api.post('/tarjetas/recargar', { numero: b.numero_tarjeta, id_estacion: b.id_estacion, monto: b.monto, referencia });
      setMsg({ tipo: 'ok', texto: `${tipo === 'cobrar' ? 'Cobro' : 'Recarga'} registrado. Saldo actual: ${quetzales(r.saldo)}.` });
      rt(); rx();
    } catch (e) { setMsg({ tipo: 'error', texto: mensajeError(e) }); }
  }

  return (
    <>
      <PageHeader title="Cobros y tarjetas" subtitle="Cobro de pasaje y recarga con tarjeta de acceso. El saldo y la transacción se guardan juntos o no se guardan." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel p-4">
          <h2 className="mb-3 text-xl">Registrar operación</h2>
          {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
          <Field label="Tarjeta">
            <input className="input" list="tarjetas" placeholder="Ej. TM-0001-2026" value={numero} onChange={(e) => setNumero(e.target.value)} />
            <datalist id="tarjetas">{tarjetas?.map((t) => <option key={t.id_tarjeta} value={t.numero} />)}</datalist>
          </Field>
          {usuario?.rol === 'admin' && (
            <Field label="Estación">
              <select className="input" value={estacion} onChange={(e) => setEstacion(e.target.value)}>
                <option value="">Seleccione…</option>
                {estaciones?.map((e) => <option key={e.id_estacion} value={e.id_estacion}>{e.nombre}</option>)}
              </select>
            </Field>
          )}
          <Field label="Línea del pasaje (opcional)" ayuda="Si la estación tiene varias líneas, indique en cuál abordó el pasajero; alimenta el análisis de demanda.">
            <select className="input" value={linea} onChange={(e) => setLinea(e.target.value)}><option value="">No indicar</option>{lineas?.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre}</option>)}</select>
          </Field>
          <Field label="Monto (Q)" ayuda="Al cobrar, déjelo vacío para aplicar la tarifa base de Q1.00.">
            <input className="input" type="number" min="0" step="0.25" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!numero} onClick={() => accion('cobrar')}>Cobrar pasaje</button>
            <button className="btn-ghost" disabled={!numero || !monto} onClick={() => accion('recargar')}>Recargar saldo</button>
            <button className="btn-ghost ml-auto" onClick={() => setNueva(true)}>Registrar tarjeta</button>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl">Tarjetas registradas</h2>
          <Tabla cols={['Número', 'Saldo']}>
            {tarjetas?.map((t) => <tr key={t.id_tarjeta}><td className="td">{t.numero}</td><td className="td">{quetzales(t.saldo)}</td></tr>)}
          </Tabla>
        </section>
      </div>

      <h2 className="mb-2 mt-6 text-xl">Últimas transacciones</h2>
      <Estado loading={loading} error={error} vacio={txs?.length === 0 && 'Aún no hay transacciones.'}>
        <Tabla cols={['Fecha', 'Tarjeta', 'Estación', 'Tipo', 'Monto']}>
          {txs?.map((x) => (
            <tr key={x.id_transaccion}>
              <td className="td">{fechaHora(x.fecha_hora)}</td><td className="td">{x.tarjeta?.numero}</td><td className="td">{x.estacion?.nombre ?? 'En línea'}</td>
              <td className="td">{x.medio_pago === 'RECARGA_EN_LINEA' ? 'Recarga en línea' : x.medio_pago === 'RECARGA' ? 'Recarga' : 'Pasaje'}</td><td className="td">{quetzales(x.monto)}</td>
            </tr>
          ))}
        </Tabla>
      </Estado>
      {nueva && <Formulario titulo="Registrar tarjeta" inicial={{}} onClose={() => setNueva(false)} campos={[{ name: 'numero', label: 'Número de tarjeta', required: true }]} onGuardar={async (b) => { await api.post('/tarjetas', b); setNueva(false); rt(); }} />}
    </>
  );
}
