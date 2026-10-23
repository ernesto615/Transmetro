import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api';
import { getSocket } from '../socket';
import { PageHeader, Notice, fechaHora } from '../components/ui';

const COLORES = ['#10069F', '#6DB52A', '#E8541E', '#5B2C8F', '#0A9BD9', '#C98500'];

export default function Mapa() {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [leyenda, setLeyenda] = useState<{ nombre: string; color: string }[]>([]);
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    let cancelado = false; // evita dibujar sobre un mapa ya destruido (React monta el efecto dos veces en desarrollo)
    const map = L.map(el.current).setView([14.6, -90.53], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    const marcadores = new Map<number, L.CircleMarker>();
    const colorLinea = new Map<number, string>();

    const poner = (b: { id_bus: number; placa: string; id_linea: number | null; linea?: string | null; latitud: number; longitud: number; ultima_posicion?: string }) => {
      const pos: [number, number] = [Number(b.latitud), Number(b.longitud)];
      const color = (b.id_linea && colorLinea.get(b.id_linea)) || '#555B73';
      let m = marcadores.get(b.id_bus);
      if (!m) {
        m = L.circleMarker(pos, { radius: 8, color: '#12142B', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
        marcadores.set(b.id_bus, m);
      } else m.setLatLng(pos);
      m.bindTooltip(`${b.placa}${b.linea ? ' · ' + b.linea : ''}`);
    };

    (async () => {
      try {
        const [lineas, buses, estaciones] = await Promise.all([api.get('/lineas'), api.get('/buses'), api.get('/estaciones')]);
        const detalles = await Promise.all(lineas.map((l: any) => api.get(`/lineas/${l.id_linea}/detalle`)));
        if (cancelado) return;
        const ley: { nombre: string; color: string }[] = [];
        detalles.forEach((d: any, i: number) => {
          const color = COLORES[i % COLORES.length];
          colorLinea.set(d.id_linea, color);
          ley.push({ nombre: d.nombre, color });
          const pts = d.paradas.filter((p: any) => p.estacion.latitud != null).map((p: any) => [Number(p.estacion.latitud), Number(p.estacion.longitud)] as [number, number]);
          if (pts.length > 1) L.polyline(pts, { color, weight: 5, opacity: 0.8 }).addTo(map);
        });
        setLeyenda(ley);
        const puntos: [number, number][] = [];
        estaciones.filter((e: any) => e.latitud != null).forEach((e: any) => {
          const p: [number, number] = [Number(e.latitud), Number(e.longitud)];
          puntos.push(p);
          L.circleMarker(p, { radius: 6, color: '#12142B', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(map)
            .bindPopup(`<strong>${e.nombre}</strong><br/>${e.municipalidad?.nombre ?? ''}<br/>${e.accesos.length} acceso(s)`);
        });
        if (puntos.length) map.fitBounds(L.latLngBounds(puntos).pad(0.2));
        buses.filter((b: any) => b.latitud != null).forEach((b: any) => poner({ ...b, linea: b.linea?.nombre }));
      } catch (e: any) { if (!cancelado) setError(e.message); }
    })();

    const s = getSocket();
    const onPos = (p: any) => { poner(p); setUltimo(fechaHora(p.ultima_posicion)); };
    const onConn = () => setConectado(true), onDisc = () => setConectado(false);
    s.on('bus:posicion', onPos); s.on('connect', onConn); s.on('disconnect', onDisc);
    setConectado(s.connected);
    return () => { cancelado = true; s.off('bus:posicion', onPos); s.off('connect', onConn); s.off('disconnect', onDisc); map.remove(); };
  }, []);

  return (
    <>
      <PageHeader title="Mapa en vivo" subtitle="Estaciones, recorridos y posición de los buses según el GPS/AVL de cada unidad."
        actions={<span className={`rounded px-2 py-1 text-xs font-medium ${conectado ? 'bg-route-soft text-route-dark' : 'bg-alarm-soft text-alarm'}`}>{conectado ? 'Conectado en tiempo real' : 'Sin conexión en tiempo real'}</span>} />
      {error && <Notice>{error}</Notice>}
      <div className="panel isolate overflow-hidden"><div ref={el} className="h-[calc(100vh-17rem)] min-h-[420px] w-full" role="application" aria-label="Mapa de la red" /></div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        {leyenda.map((l) => <span key={l.nombre} className="inline-flex items-center gap-2"><span aria-hidden className="h-1.5 w-6 rounded" style={{ background: l.color }} />{l.nombre}</span>)}
        {ultimo && <span className="text-slate">Última actualización: {ultimo}</span>}
      </div>
    </>
  );
}
