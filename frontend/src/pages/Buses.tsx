import { useState } from 'react';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { Formulario } from '../components/ResourcePage';
import { Badge, Estado, Field, Modal, Notice, PageHeader, Tabla, fechaHora, useLoad } from '../components/ui';

function Historial({ bus, onClose }: { bus: any; onClose: () => void }) {
  const { data, loading, error } = useLoad<any[]>(() => api.get(`/buses/${bus.id_bus}/historial`), [bus.id_bus]);
  return (
    <Modal title={`Historial de asignaciones · ${bus.placa}`} onClose={onClose} ancho="max-w-2xl">
      <Estado loading={loading} error={error} vacio={data?.length === 0 && 'Sin cambios registrados.'}>
        <Tabla cols={['Fecha', 'Línea (antes → ahora)', 'Parqueo (antes → ahora)']}>
          {data?.map((h) => (
            <tr key={h.id_auditoria}>
              <td className="td">{fechaHora(h.fecha_hora)}</td>
              <td className="td">{h.id_linea_anterior || h.id_linea_nueva ? `${h.id_linea_anterior ?? 'ninguna'} → ${h.id_linea_nueva ?? 'ninguna'}` : '—'}</td>
              <td className="td">{h.id_parqueo_anterior || h.id_parqueo_nuevo ? `${h.id_parqueo_anterior ?? '—'} → ${h.id_parqueo_nuevo ?? '—'}` : '—'}</td>
            </tr>
          ))}
        </Tabla>
      </Estado>
    </Modal>
  );
}

function CambiarAsignacion({ bus, lineas, parqueos, onClose, onDone }: { bus: any; lineas: any[]; parqueos: any[]; onClose: () => void; onDone: () => void }) {
  const [linea, setLinea] = useState(String(bus.id_linea ?? ''));
  const [parqueo, setParqueo] = useState(String(bus.id_parqueo));
  const [err, setErr] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (String(bus.id_linea ?? '') !== linea) await api.put(`/buses/${bus.id_bus}/linea`, { id_linea: linea ? Number(linea) : null });
      if (String(bus.id_parqueo) !== parqueo) await api.put(`/buses/${bus.id_bus}/parqueo`, { id_parqueo: Number(parqueo) });
      onDone();
    } catch (x) { setErr(mensajeError(x)); }
  }
  return (
    <Modal title={`Asignación de ${bus.placa}`} onClose={onClose}>
      <form onSubmit={guardar}>
        {err && <Notice>{err}</Notice>}
        <Field label="Línea" ayuda="Un bus solo puede estar en una línea, o en ninguna.">
          <select className="input" value={linea} onChange={(e) => setLinea(e.target.value)}>
            <option value="">Sin línea</option>
            {lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre}</option>)}
          </select>
        </Field>
        <Field label="Parqueo" ayuda="Un bus puede cambiar de parqueo, pero no quedar sin él.">
          <select className="input" required value={parqueo} onChange={(e) => setParqueo(e.target.value)}>
            {parqueos.map((p) => <option key={p.id_parqueo} value={p.id_parqueo}>{p.nombre}</option>)}
          </select>
        </Field>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary">Guardar asignación</button></div>
      </form>
    </Modal>
  );
}

export default function Buses() {
  const { usuario } = useAuth();
  const admin = usuario?.rol === 'admin';
  const { data, error, loading, reload } = useLoad<any[]>(() => api.get('/buses'));
  const { data: lineas } = useLoad<any[]>(() => api.get('/lineas'));
  const { data: parqueos } = useLoad<any[]>(() => api.get('/parqueos'));
  const [modo, setModo] = useState<{ tipo: 'nuevo' | 'asignar' | 'historial' | 'editar'; bus?: any } | null>(null);
  const cerrar = () => setModo(null);

  return (
    <>
      <PageHeader title="Buses" subtitle="Capacidad, línea y parqueo de cada unidad. Cada cambio de asignación queda en el historial."
        actions={admin && <button className="btn-primary" onClick={() => setModo({ tipo: 'nuevo' })}>Agregar bus</button>} />
      <Estado loading={loading} error={error} vacio={data?.length === 0 && 'Aún no hay buses registrados.'}>
        <Tabla cols={['Placa', 'Capacidad', 'Línea', 'Parqueo', 'Piloto', 'Última posición', ...(admin ? ['Acciones'] : [])]}>
          {data?.map((b) => (
            <tr key={b.id_bus} className="hover:bg-route-soft/40">
              <td className="td font-medium">{b.placa}</td>
              <td className="td">{b.capacidad_maxima}</td>
              <td className="td">{b.linea ? b.linea.nombre : <Badge tono="aviso">Sin línea</Badge>}</td>
              <td className="td">{b.parqueo?.nombre}</td>
              <td className="td">{b.pilotos.map((p: any) => p.nombre).join(', ') || '—'}</td>
              <td className="td">{fechaHora(b.ultima_posicion)}</td>
              {admin && (
                <td className="td whitespace-nowrap">
                  <button className="btn-ghost !px-2 !py-1" onClick={() => setModo({ tipo: 'asignar', bus: b })}>Línea y parqueo</button>{' '}
                  <button className="btn-ghost !px-2 !py-1" onClick={() => setModo({ tipo: 'editar', bus: b })}>Editar</button>{' '}
                  <button className="btn-ghost !px-2 !py-1" onClick={() => setModo({ tipo: 'historial', bus: b })}>Historial</button>
                </td>
              )}
            </tr>
          ))}
        </Tabla>
      </Estado>

      {modo?.tipo === 'nuevo' && (
        <Formulario titulo="Agregar bus" inicial={{}} onClose={cerrar}
          campos={[
            { name: 'placa', label: 'Placa', required: true },
            { name: 'capacidad_maxima', label: 'Capacidad máxima de pasajeros', type: 'number', required: true },
            { name: 'id_parqueo', label: 'Parqueo', type: 'select', required: true, options: parqueos?.map((p) => ({ value: p.id_parqueo, label: p.nombre })), ayuda: 'Todo bus debe tener un parqueo asignado.' },
            { name: 'id_linea', label: 'Línea', type: 'select', options: lineas?.map((l) => ({ value: l.id_linea, label: l.nombre })), ayuda: 'Puede dejarse sin línea.' },
          ]}
          onGuardar={async (b) => { await api.post('/buses', b); cerrar(); reload(); }} />
      )}
      {modo?.tipo === 'editar' && (
        <Formulario titulo={`Editar ${modo.bus.placa}`} inicial={modo.bus} onClose={cerrar}
          campos={[{ name: 'placa', label: 'Placa', required: true }, { name: 'capacidad_maxima', label: 'Capacidad máxima de pasajeros', type: 'number', required: true }]}
          onGuardar={async (b) => { await api.patch(`/buses/${modo.bus.id_bus}`, b); cerrar(); reload(); }} />
      )}
      {modo?.tipo === 'asignar' && <CambiarAsignacion bus={modo.bus} lineas={lineas ?? []} parqueos={parqueos ?? []} onClose={cerrar} onDone={() => { cerrar(); reload(); }} />}
      {modo?.tipo === 'historial' && <Historial bus={modo.bus} onClose={cerrar} />}
    </>
  );
}
