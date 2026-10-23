import { Fragment, useState } from 'react';
import { api, mensajeError } from '../api';
import { Badge, Estado, Notice, PageHeader, Tabla, km, useLoad } from '../components/ui';

function Descargar({ path, nombre, setErr }: { path: string; nombre: string; setErr: (s: string | null) => void }) {
  return <button className="btn-ghost" onClick={() => api.descargar(path + '?formato=csv', nombre).then(() => setErr(null)).catch((e) => setErr(mensajeError(e)))}>Descargar CSV</button>;
}

export default function Reportes() {
  const est = useLoad<any[]>(() => api.get('/reportes/estaciones'));
  const lin = useLoad<any[]>(() => api.get('/reportes/lineas-buses'));
  const acc = useLoad<any[]>(() => api.get('/reportes/accesos-por-linea'));
  const [err, setErr] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Reportes" subtitle="Información consolidada para análisis. Cada reporte se puede exportar a CSV y abrir en Excel." />
      {err && <Notice>{err}</Notice>}

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xl">Líneas y buses asignados</h2><Descargar path="/reportes/lineas-buses" nombre="reporte-lineas-buses.csv" setErr={setErr} /></div>
        <Estado loading={lin.loading} error={lin.error} vacio={lin.data?.length === 0 && 'No hay líneas para reportar.'}>
          <Tabla cols={['Línea', 'Municipalidad', 'Estaciones', 'Distancia', 'Buses', 'Rango permitido', 'Estado', '']}>
            {lin.data?.map((l) => (
              <Fragment key={l.id_linea}>
                <tr>
                  <td className="td font-medium">{l.linea}</td><td className="td">{l.municipalidad}</td><td className="td">{l.estaciones}</td><td className="td">{km(l.distancia_total_km)}</td>
                  <td className="td">{l.buses_asignados}</td><td className="td">{l.rango_permitido}</td>
                  <td className="td">{l.cumple_rango ? <Badge tono="ok">Cumple</Badge> : <Badge tono="error">Fuera de rango</Badge>}</td>
                  <td className="td"><button className="underline text-sm" onClick={() => setAbierta(abierta === l.id_linea ? null : l.id_linea)}>{abierta === l.id_linea ? 'Ocultar buses' : 'Ver buses'}</button></td>
                </tr>
                {abierta === l.id_linea && (
                  <tr><td className="td bg-paper" colSpan={8}>
                    {l.buses.length === 0 ? 'Sin buses asignados.' : l.buses.map((b: any) => <div key={b.id_bus}>{b.placa} · {b.capacidad} pasajeros · {b.parqueo} · {b.pilotos || 'sin piloto'}</div>)}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </Tabla>
        </Estado>
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xl">Estaciones</h2><Descargar path="/reportes/estaciones" nombre="reporte-estaciones.csv" setErr={setErr} /></div>
        <Estado loading={est.loading} error={est.error} vacio={est.data?.length === 0 && 'No hay estaciones para reportar.'}>
          <Tabla cols={['Estación', 'Municipalidad', 'Líneas', 'Accesos', 'Guardias', 'Parqueos', 'Cobertura de guardias']}>
            {est.data?.map((e) => (
              <tr key={e.id_estacion}>
                <td className="td font-medium">{e.estacion}</td><td className="td">{e.municipalidad}</td><td className="td">{e.lineas || '—'}</td>
                <td className="td">{e.accesos}</td><td className="td">{e.guardias}</td><td className="td">{e.parqueos}</td>
                <td className="td">{e.cumple_guardia_minima ? <Badge tono="ok">Completa</Badge> : <Badge tono="error">Falta: {e.accesos_sin_guardia || 'sin accesos'}</Badge>}</td>
              </tr>
            ))}
          </Tabla>
        </Estado>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xl">Accesos de cada línea</h2><Descargar path="/reportes/accesos-por-linea" nombre="reporte-accesos-por-linea.csv" setErr={setErr} /></div>
        <Estado loading={acc.loading} error={acc.error} vacio={acc.data?.length === 0 && 'No hay accesos para reportar.'}>
          <Tabla cols={['Línea', 'Orden', 'Estación', 'Acceso']}>
            {acc.data?.map((a, i) => <tr key={i}><td className="td">{a.linea}</td><td className="td">{a.orden}</td><td className="td">{a.estacion}</td><td className="td">{a.acceso}</td></tr>)}
          </Tabla>
        </Estado>
      </section>
    </>
  );
}
