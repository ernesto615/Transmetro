import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Estado, PageHeader, Tabla, km, useLoad } from '../components/ui';
import { Formulario } from '../components/ResourcePage';

export default function Lineas() {
  const { usuario } = useAuth();
  const { data, error, loading, reload } = useLoad<any[]>(() => api.get('/lineas'));
  const { data: munis } = useLoad<any[]>(() => api.get('/municipalidades'));
  const [nuevo, setNuevo] = useState(false);
  const admin = usuario?.rol === 'admin';

  return (
    <>
      <PageHeader title="Líneas" subtitle="Cada línea es una secuencia ordenada de estaciones. Abra una línea para ver su recorrido y administrar sus buses."
        actions={admin && <button className="btn-primary" onClick={() => setNuevo(true)}>Agregar línea</button>} />
      <Estado loading={loading} error={error} vacio={data?.length === 0 && 'Aún no hay líneas registradas.'}>
        <Tabla cols={['Línea', 'Municipalidad', 'Estaciones', 'Buses', 'Distancia', 'Rango de buses']}>
          {data?.map((l) => {
            const n = l.paradas.length, b = l.buses.length;
            const ok = n > 0 && b >= n && b <= n * 2;
            return (
              <tr key={l.id_linea} className="hover:bg-route-soft/40">
                <td className="td font-medium"><Link className="text-route-dark underline" to={`/lineas/${l.id_linea}`}>{l.nombre}</Link></td>
                <td className="td">{l.municipalidad?.nombre}</td>
                <td className="td">{n}</td>
                <td className="td">{b}</td>
                <td className="td">{km(l.distancia_total_km)}</td>
                <td className="td">{ok ? <Badge tono="ok">Cumple ({n}–{n * 2})</Badge> : <Badge tono="error">{n === 0 ? 'Sin estaciones' : `Fuera de ${n}–${n * 2}`}</Badge>}</td>
              </tr>
            );
          })}
        </Tabla>
      </Estado>
      {nuevo && (
        <Formulario titulo="Agregar línea" inicial={{}} onClose={() => setNuevo(false)}
          campos={[
            { name: 'nombre', label: 'Nombre de la línea', required: true },
            { name: 'id_municipalidad', label: 'Municipalidad', type: 'select', required: true, options: munis?.map((m) => ({ value: m.id_municipalidad, label: m.nombre })) },
          ]}
          onGuardar={async (b) => { await api.post('/lineas', b); setNuevo(false); reload(); }} />
      )}
    </>
  );
}
