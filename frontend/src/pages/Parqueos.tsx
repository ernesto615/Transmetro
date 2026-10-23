import { api } from '../api';
import { useAuth } from '../auth';
import ResourcePage from '../components/ResourcePage';
import { useLoad } from '../components/ui';

export default function Parqueos() {
  const { usuario } = useAuth();
  const { data: estaciones } = useLoad<any[]>(() => api.get('/estaciones'));
  return (
    <ResourcePage
      titulo="Parqueos" subtitulo="Algunas estaciones tienen parqueo. Cada bus debe tener uno asignado."
      endpoint="/parqueos" idKey="id_parqueo" nombreSingular="parqueo" puedeEscribir={usuario?.rol === 'admin'}
      columnas={[
        { titulo: 'Parqueo', celda: (r) => <strong>{r.nombre}</strong> },
        { titulo: 'Estación', celda: (r) => r.estacion?.nombre ?? 'Independiente' },
        { titulo: 'Capacidad (buses)', celda: (r) => r.capacidad ?? '—' },
      ]}
      campos={[
        { name: 'nombre', label: 'Nombre del parqueo', required: true },
        { name: 'capacidad', label: 'Capacidad en buses', type: 'number' },
        { name: 'id_estacion', label: 'Estación asociada', type: 'select', options: estaciones?.map((e) => ({ value: e.id_estacion, label: e.nombre })) },
      ]}
    />
  );
}
