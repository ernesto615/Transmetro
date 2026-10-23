import { useEffect, useState } from 'react';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { getSocket } from '../socket';
import { Formulario } from '../components/ResourcePage';
import { Badge, Estado, Field, Notice, PageHeader, Tabla, fechaHora, useLoad } from '../components/ui';

const TONO: Record<string, 'error' | 'aviso' | 'neutro'> = { SOBRECUPO: 'error', ESPERA_EXTRA: 'aviso', REFUERZO_FLOTA: 'aviso' };
const ETIQUETA: Record<string, string> = { SOBRECUPO: 'Sobrecupo', ESPERA_EXTRA: 'Espera de 5 min', REFUERZO_FLOTA: 'Refuerzo de flota' };

export default function Alertas() {
  const { usuario } = useAuth();
  const opera = usuario?.rol === 'admin' || usuario?.rol === 'operador';
  const reporta = opera || usuario?.rol === 'guardia';
  const { data: alertas, error, loading, reload: ra } = useLoad<any[]>(() => api.get('/alertas'));
  const { data: incidentes, reload: ri } = useLoad<any[]>(() => api.get('/incidentes'));
  const { data: buses } = useLoad<any[]>(() => api.get('/buses'));
  const { data: estaciones } = useLoad<any[]>(() => api.get('/estaciones'));
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [oc, setOc] = useState({ id_estacion: String(usuario?.idEstacion ?? ''), id_bus: '', espera: '', abordo: '' });

  // Actualización en vivo cuando llega una alerta o un pánico.
  useEffect(() => {
    const s = getSocket();
    const h = () => { ra(); ri(); };
    s.on('alerta', h); s.on('panico', h); s.on('incidente', h); // cualquier incidente nuevo actualiza la lista sin recargar
    return () => { s.off('alerta', h); s.off('panico', h); s.off('incidente', h); };
  }, []);

  async function panico() {
    if (!confirm('¿Activar el botón de pánico? El centro de control será notificado de inmediato.')) return;
    try { await api.post('/incidentes/panico', { id_estacion: usuario?.idEstacion ?? null }); setMsg({ tipo: 'ok', texto: 'Pánico enviado al centro de control.' }); ri(); }
    catch (e) { setMsg({ tipo: 'error', texto: mensajeError(e) }); }
  }
  async function evaluar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post('/ocupacion', {
        id_estacion: oc.id_estacion ? Number(oc.id_estacion) : undefined, id_bus: Number(oc.id_bus),
        pasajeros_en_espera: Number(oc.espera), pasajeros_a_bordo: oc.abordo ? Number(oc.abordo) : undefined,
      });
      const partes = [`Espera: ${r.ocupacion_espera_pct}% de la capacidad del bus.`];
      if (r.ocupacion_bus_pct !== null) partes.push(`A bordo: ${r.ocupacion_bus_pct}%.`);
      partes.push(r.sobrecupo ? 'Se generó alerta de sobrecupo: despachar un bus adicional.' : 'Sin sobrecupo.');
      if (r.espera_adicional_min) partes.push(`El bus debe esperar ${r.espera_adicional_min} minutos más.`);
      setMsg({ tipo: r.alertas.length ? 'aviso' : 'ok', texto: partes.join(' ') });
      ra();
    } catch (x) { setMsg({ tipo: 'error', texto: mensajeError(x) }); }
  }

  return (
    <>
      <PageHeader title="Alertas e incidentes" subtitle="Alertas de capacidad, incidentes de seguridad y botón de pánico, en tiempo real."
        actions={reporta && <button className="btn-danger" onClick={panico}>Activar botón de pánico</button>} />
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}

      {opera && (
        <section className="panel mb-5 p-4">
          <h2 className="mb-1 text-xl">Evaluar ocupación</h2>
          <p className="mb-3 text-sm text-slate">Con pasajeros en espera iguales o mayores al 150% de la capacidad del bus se genera alerta. Con menos del 25% a bordo, el bus espera 5 minutos más.</p>
          <form onSubmit={evaluar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            {usuario?.rol === 'admin' && (
              <Field label="Estación"><select required className="input" value={oc.id_estacion} onChange={(e) => setOc({ ...oc, id_estacion: e.target.value })}><option value="">Seleccione…</option>{estaciones?.map((e) => <option key={e.id_estacion} value={e.id_estacion}>{e.nombre}</option>)}</select></Field>
            )}
            <Field label="Bus"><select required className="input" value={oc.id_bus} onChange={(e) => setOc({ ...oc, id_bus: e.target.value })}><option value="">Seleccione…</option>{buses?.map((b) => <option key={b.id_bus} value={b.id_bus}>{b.placa} ({b.capacidad_maxima})</option>)}</select></Field>
            <Field label="Pasajeros en espera"><input required className="input" type="number" min="0" value={oc.espera} onChange={(e) => setOc({ ...oc, espera: e.target.value })} /></Field>
            <Field label="Pasajeros a bordo (opcional)"><input className="input" type="number" min="0" value={oc.abordo} onChange={(e) => setOc({ ...oc, abordo: e.target.value })} /></Field>
            <button className="btn-primary mb-3">Evaluar</button>
          </form>
        </section>
      )}

      <h2 className="mb-2 text-xl">Alertas</h2>
      <Estado loading={loading} error={error} vacio={alertas?.length === 0 && 'No hay alertas registradas.'}>
        <Tabla cols={['Fecha', 'Tipo', 'Estación', 'Bus', 'Detalle', 'Estado']}>
          {alertas?.map((a) => (
            <tr key={a.id_alerta}>
              <td className="td whitespace-nowrap">{fechaHora(a.fecha_hora)}</td>
              <td className="td"><Badge tono={TONO[a.tipo] ?? 'neutro'}>{ETIQUETA[a.tipo] ?? a.tipo}</Badge></td>
              <td className="td">{a.estacion?.nombre ?? '—'}</td><td className="td">{a.bus?.placa ?? '—'}</td>
              <td className="td max-w-md">{a.descripcion}</td>
              <td className="td whitespace-nowrap">{a.atendida ? <Badge tono="ok">Atendida</Badge> : opera ? <button className="btn-ghost !px-2 !py-1" onClick={async () => { await api.patch(`/alertas/${a.id_alerta}/atender`); ra(); }}>Marcar atendida</button> : <Badge tono="aviso">Abierta</Badge>}</td>
            </tr>
          ))}
        </Tabla>
      </Estado>

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-xl">Incidentes de seguridad</h2>
        {reporta && <button className="btn-ghost" onClick={() => setNuevo(true)}>Registrar incidente</button>}
      </div>
      <Tabla cols={['Fecha', 'Tipo', 'Estación', 'Acceso', 'Bus', 'Descripción']}>
        {incidentes?.length === 0 && <tr><td className="td text-slate" colSpan={6}>No hay incidentes registrados.</td></tr>}
        {incidentes?.map((i) => (
          <tr key={i.id_incidente}>
            <td className="td whitespace-nowrap">{fechaHora(i.fecha_hora)}</td>
            <td className="td">{i.tipo === 'PANICO' ? <Badge tono="error">Pánico</Badge> : i.tipo}</td>
            <td className="td">{i.estacion?.nombre ?? '—'}</td><td className="td">{i.acceso?.nombre ?? '—'}</td><td className="td">{i.bus?.placa ?? '—'}</td><td className="td">{i.descripcion ?? '—'}</td>
          </tr>
        ))}
      </Tabla>
      {nuevo && (
        <Formulario titulo="Registrar incidente" inicial={{ id_estacion: usuario?.idEstacion }} onClose={() => setNuevo(false)}
          campos={[
            { name: 'tipo', label: 'Tipo de incidente', required: true, ayuda: 'Ejemplo: Robo, Altercado, Daño a la unidad' },
            { name: 'descripcion', label: 'Descripción' },
            { name: 'id_estacion', label: 'Estación', type: 'select', options: estaciones?.map((e) => ({ value: e.id_estacion, label: e.nombre })) },
            { name: 'id_bus', label: 'Bus', type: 'select', options: buses?.map((b) => ({ value: b.id_bus, label: b.placa })) },
          ]}
          onGuardar={async (b) => { await api.post('/incidentes', b); setNuevo(false); ri(); }} />
      )}
    </>
  );
}
