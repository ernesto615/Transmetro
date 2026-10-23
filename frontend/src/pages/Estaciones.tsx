import { useState } from 'react';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import ResourcePage from '../components/ResourcePage';
import { Badge, Modal, Notice, useLoad } from '../components/ui';

// Accesos de una estación y guardias de cada acceso (mínimo un guardia por acceso).
function AccesosModal({ estacion, onClose, puedeEditar }: { estacion: any; onClose: () => void; puedeEditar: boolean }) {
  const { data, reload } = useLoad<any[]>(() => api.get(`/accesos?id_estacion=${estacion.id_estacion}`), [estacion.id_estacion]);
  const [nombre, setNombre] = useState('');
  const [guardia, setGuardia] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>) => { try { await fn(); setErr(null); reload(); } catch (e) { setErr(mensajeError(e)); } };

  return (
    <Modal title={`Accesos de ${estacion.nombre}`} onClose={onClose} ancho="max-w-2xl">
      {err && <Notice>{err}</Notice>}
      {data?.length === 0 && <p className="mb-3 text-sm text-slate">Esta estación todavía no tiene accesos. Cada acceso necesita al menos un guardia.</p>}
      <ul className="space-y-3">
        {data?.map((a) => (
          <li key={a.id_acceso} className="rounded border border-rule p-3">
            <div className="flex items-center justify-between">
              <strong>{a.nombre}</strong>
              <span className="flex items-center gap-2">
                {a.guardias.length === 0 ? <Badge tono="error">Sin guardia</Badge> : <Badge tono="ok">{a.guardias.length} guardia(s)</Badge>}
                {puedeEditar && <button className="text-xs text-alarm underline" onClick={() => confirm('¿Eliminar este acceso y sus guardias?') && run(async () => { for (const g of a.guardias) await api.del(`/guardias/${g.id_guardia}`); await api.del(`/accesos/${a.id_acceso}`); })}>Eliminar</button>}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {a.guardias.map((g: any) => (
                <li key={g.id_guardia} className="flex justify-between">
                  <span>{g.nombre} <span className="text-slate">· {g.turno ?? 'sin turno'}</span></span>
                  {puedeEditar && <button className="text-xs underline" onClick={() => run(() => api.del(`/guardias/${g.id_guardia}`))}>Quitar</button>}
                </li>
              ))}
            </ul>
            {puedeEditar && (
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = guardia[a.id_acceso]?.trim(); if (n) run(() => api.post('/guardias', { nombre: n, turno: 'Diurno', id_acceso: a.id_acceso }).then(() => setGuardia({ ...guardia, [a.id_acceso]: '' }))); }}>
                <input className="input" placeholder="Nombre del guardia" value={guardia[a.id_acceso] ?? ''} onChange={(e) => setGuardia({ ...guardia, [a.id_acceso]: e.target.value })} />
                <button className="btn-ghost whitespace-nowrap">Asignar guardia</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <form className="mt-4 flex gap-2 border-t border-rule pt-3" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) run(() => api.post('/accesos', { nombre: nombre.trim(), id_estacion: estacion.id_estacion }).then(() => setNombre(''))); }}>
          <input className="input" placeholder="Nombre del nuevo acceso" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <button className="btn-primary whitespace-nowrap">Agregar acceso</button>
        </form>
      )}
    </Modal>
  );
}

export default function Estaciones() {
  const { usuario } = useAuth();
  const admin = usuario?.rol === 'admin';
  const { data: munis } = useLoad<any[]>(() => api.get('/municipalidades'));
  const [ver, setVer] = useState<any | null>(null);

  return (
    <>
      <ResourcePage
        titulo="Estaciones" subtitulo="Una estación puede pertenecer a varias líneas y tiene uno o más accesos, cada uno con al menos un guardia."
        endpoint="/estaciones" idKey="id_estacion" nombreSingular="estación" puedeEscribir={admin}
        columnas={[
          { titulo: 'Estación', celda: (r) => <strong>{r.nombre}</strong> },
          { titulo: 'Municipalidad', celda: (r) => r.municipalidad?.nombre },
          { titulo: 'Líneas', celda: (r) => r.lineas.map((l: any) => l.linea.nombre).join(', ') || '—' },
          { titulo: 'Accesos', celda: (r) => {
            const sin = r.accesos.filter((a: any) => a.guardias.length === 0).length;
            return <button className="underline" onClick={() => setVer(r)}>{r.accesos.length} {sin > 0 && <Badge tono="error">{sin} sin guardia</Badge>}</button>;
          } },
          { titulo: 'Parqueos', celda: (r) => r.parqueos.length },
        ]}
        campos={[
          { name: 'nombre', label: 'Nombre de la estación', required: true },
          { name: 'id_municipalidad', label: 'Municipalidad', type: 'select', required: true, options: munis?.map((m) => ({ value: m.id_municipalidad, label: m.nombre })) },
          { name: 'latitud', label: 'Latitud', type: 'number', ayuda: 'Se usa para ubicar la estación en el mapa. Ejemplo: 14.6349' },
          { name: 'longitud', label: 'Longitud', type: 'number', ayuda: 'Ejemplo: -90.5069' },
        ]}
      />
      {ver && <AccesosModal estacion={ver} puedeEditar={admin} onClose={() => setVer(null)} />}
    </>
  );
}
