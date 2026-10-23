// Simula buses recorriendo sus líneas (GPS/AVL) y reportes de ocupación, para ver el mapa y las alertas en vivo.
// Uso: npm run simular   (requiere API en marcha y datos cargados con npm run seed)
const API = process.env.API_URL ?? 'http://localhost:4000/api';

async function call(path: string, token: string | null, method = 'GET', body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const { token } = await call('/auth/login', null, 'POST', { email: 'admin@transmetro.gt', password: 'Admin123!' });
  const lineas = await call('/lineas', token);
  const recorridos: { buses: any[]; ruta: { lat: number; lon: number; id: number }[] }[] = [];
  for (const l of lineas) {
    const d = await call(`/lineas/${l.id_linea}/detalle`, token);
    const ruta = d.paradas.map((p: any) => ({ lat: Number(p.estacion.latitud), lon: Number(p.estacion.longitud), id: p.id_estacion }));
    if (ruta.length >= 2 && d.buses.length) recorridos.push({ buses: d.buses, ruta });
  }
  console.log(`Simulando ${recorridos.reduce((s, r) => s + r.buses.length, 0)} buses. Ctrl+C para detener.`);

  let tick = 0;
  setInterval(async () => {
    tick++;
    for (const { buses, ruta } of recorridos) {
      const tramos = ruta.length - 1;
      buses.forEach((b, i) => {
        // ida y vuelta: t recorre 0..2 y se refleja
        const fase = (tick * 0.02 + i / buses.length) % 2;
        const s = (fase <= 1 ? fase : 2 - fase) * tramos;
        const k = Math.min(Math.floor(s), tramos - 1);
        const f = s - k;
        const a = ruta[k], c = ruta[k + 1];
        call(`/buses/${b.id_bus}/posicion`, token, 'POST', { latitud: a.lat + (c.lat - a.lat) * f, longitud: a.lon + (c.lon - a.lon) * f }).catch(() => {});
      });
    }
    if (tick % 15 === 0) {
      const r = recorridos[Math.floor(Math.random() * recorridos.length)];
      const bus = r.buses[Math.floor(Math.random() * r.buses.length)];
      const parada = r.ruta[Math.floor(Math.random() * r.ruta.length)];
      const cap = bus.capacidad_maxima;
      const espera = Math.random() > 0.5 ? Math.round(cap * 1.6) : Math.round(cap * 0.4);
      const abordo = Math.random() > 0.5 ? Math.round(cap * 0.15) : Math.round(cap * 0.6);
      call('/ocupacion', token, 'POST', { id_estacion: parada.id, id_bus: bus.id_bus, pasajeros_en_espera: espera, pasajeros_a_bordo: abordo })
        .then((x) => console.log(`ocupación: espera ${x.ocupacion_espera_pct}% / a bordo ${x.ocupacion_bus_pct}% ->`, x.alertas.map((a: any) => a.tipo).join(', ') || 'sin alerta'))
        .catch((e) => console.error(e.message));
    }
  }, 2000);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
