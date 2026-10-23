import { api } from '../api';
import { Estado, PageHeader, km, useLoad } from '../components/ui';

export default function Recorridos() {
  const { data, error, loading } = useLoad<any[]>(() => api.get('/mi/lineas'));
  return (
    <>
      <PageHeader title="Recorridos y estaciones" subtitle="Consulte por qué estaciones pasa cada línea y qué distancia hay entre ellas." />
      <Estado loading={loading} error={error} vacio={data?.length === 0 && 'Todavía no hay líneas disponibles.'}>
        <div className="grid gap-5 lg:grid-cols-2">
          {data?.map((l) => (
            <section key={l.id_linea} className="panel p-4">
              <h2 className="text-xl">{l.nombre}</h2>
              <p className="mb-4 text-sm text-slate">{l.municipalidad} · {l.paradas.length} estaciones · {km(l.distancia_total_km)}</p>
              <ol className="ml-2 border-l-4 border-route pl-5">
                {l.paradas.map((p: any, i: number) => (
                  <li key={p.orden} className="relative pb-5 last:pb-0">
                    <span aria-hidden className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-4 border-ink bg-panel" />
                    <div className="font-medium">{p.estacion}</div>
                    {i < l.paradas.length - 1 && <div className="text-xs text-route-dark">{km(p.distancia_a_siguiente_km)} a la siguiente</div>}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Estado>
    </>
  );
}
