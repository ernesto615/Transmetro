import { api } from '../api';
import { useAuth } from '../auth';
import ResourcePage from '../components/ResourcePage';
import { useLoad } from '../components/ui';

export default function Pilotos() {
  const { usuario } = useAuth();
  const { data: buses } = useLoad<any[]>(() => api.get('/buses'));
  return (
    <ResourcePage
      titulo="Pilotos" subtitulo="Historial educativo, residencia y datos de contacto de cada piloto, asociado al bus y la línea donde presta servicio."
      endpoint="/pilotos" idKey="id_piloto" nombreSingular="piloto" puedeEscribir={usuario?.rol === 'admin' || usuario?.rol === 'municipal'}
      columnas={[
        { titulo: 'Piloto', celda: (r) => <strong>{r.nombre}</strong> },
        { titulo: 'Bus / línea', celda: (r) => (r.bus ? `${r.bus.placa} · ${r.bus.linea?.nombre ?? 'sin línea'}` : 'Sin bus') },
        { titulo: 'Historial educativo', celda: (r) => r.historial_educativo ?? '—' },
        { titulo: 'Residencia', celda: (r) => r.direccion_residencia ?? '—' },
        { titulo: 'Contacto', celda: (r) => [r.telefono, r.email].filter(Boolean).join(' · ') || '—' },
      ]}
      campos={[
        { name: 'nombre', label: 'Nombre completo', required: true },
        { name: 'historial_educativo', label: 'Historial educativo' },
        { name: 'direccion_residencia', label: 'Dirección de residencia' },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'email', label: 'Correo electrónico', type: 'email' },
        { name: 'id_bus', label: 'Bus asignado', type: 'select', options: buses?.map((b) => ({ value: b.id_bus, label: `${b.placa} · ${b.linea?.nombre ?? 'sin línea'}` })) },
      ]}
    />
  );
}
