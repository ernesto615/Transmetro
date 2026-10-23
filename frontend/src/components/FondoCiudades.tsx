import { useEffect, useState } from 'react';
import { CIUDADES } from '../data/informacion';

// Fondo del menú de acceso: fotos translúcidas de Ciudad de Guatemala, Mixco, Villa Nueva y San José Pinula.
// Las fotos se leen de public/fotos/. Si una no existe se omite; si no hay ninguna queda un degradado institucional.
export default function FondoCiudades() {
  const [cargadas, setCargadas] = useState<Record<string, boolean>>({});
  const [actual, setActual] = useState(0);
  const disponibles = CIUDADES.filter((c) => cargadas[c.archivo]);

  useEffect(() => {
    if (disponibles.length < 2) return;
    const t = setInterval(() => setActual((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [disponibles.length]);

  const visible = disponibles.length ? disponibles[actual % disponibles.length] : null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-route-soft via-white to-verde-soft">
      {/* se precargan todas; las que fallan simplemente no aparecen */}
      {CIUDADES.map((c) => (
        <img key={c.archivo} src={c.archivo} alt="" onLoad={() => setCargadas((x) => ({ ...x, [c.archivo]: true }))} onError={() => setCargadas((x) => ({ ...x, [c.archivo]: false }))}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${visible?.archivo === c.archivo ? 'opacity-25' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/55 to-white/85" />
      {visible && <div className="absolute bottom-3 right-4 text-xs font-semibold text-route-dark/70">{visible.nombre}</div>}
    </div>
  );
}
