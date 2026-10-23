import { useState } from 'react';
import { api, mensajeError } from '../api';
import { useAuth } from '../auth';
import { Estado, Notice, PageHeader, useLoad } from '../components/ui';

const DIAS: [string, string][] = [['LUNES_VIERNES', 'Lunes a viernes'], ['SABADO', 'Sábado'], ['DOMINGO_FESTIVOS', 'Domingo y festivos']];
type Edit = Record<string, { inicio: string; fin: string }>;

const aEdicion = (h: any): Edit => Object.fromEntries(DIAS.map(([d]) => [d, { inicio: h?.[d]?.inicio ?? '', fin: h?.[d]?.fin ?? '' }]));

function Fila({ item, ruta, editable, onResultado }: { item: any; ruta: string; editable: boolean; onResultado: (m: { tipo: 'ok' | 'error'; texto: string }) => void }) {
  const [v, setV] = useState<Edit>(aEdicion(item.horarios));
  const [original, setOriginal] = useState(JSON.stringify(aEdicion(item.horarios)));
  const sucio = JSON.stringify(v) !== original;

  async function guardar() {
    const cuerpo: any = {};
    for (const [d, t] of DIAS) {
      const { inicio, fin } = v[d];
      if (!inicio && !fin) cuerpo[d] = null; // sin servicio ese día
      else if (!inicio || !fin) return onResultado({ tipo: 'error', texto: `${item.nombre}: complete la hora de inicio y de fin del día «${t}», o deje ambas vacías para indicar que no hay servicio.` });
      else cuerpo[d] = { inicio, fin };
    }
    try {
      await api.put(ruta, cuerpo);
      setOriginal(JSON.stringify(v));
      onResultado({ tipo: 'ok', texto: `Horario de ${item.nombre} guardado. Ya se muestra en la pantalla principal.` });
    } catch (e) { onResultado({ tipo: 'error', texto: `${item.nombre}: ${mensajeError(e)}` }); }
  }

  return (
    <tr>
      <th scope="row" className="td text-left font-semibold">{item.nombre}{item.municipalidad && <div className="text-xs font-normal text-slate">{item.municipalidad}</div>}</th>
      {DIAS.map(([d, t]) => (
        <td key={d} className="td">
          <div className="flex items-center gap-1">
            <input type="time" aria-label={`${item.nombre}, ${t}, inicio`} disabled={!editable} className="input !w-28 !px-2" value={v[d].inicio} onChange={(e) => setV({ ...v, [d]: { ...v[d], inicio: e.target.value } })} />
            <span aria-hidden>–</span>
            <input type="time" aria-label={`${item.nombre}, ${t}, fin`} disabled={!editable} className="input !w-28 !px-2" value={v[d].fin} onChange={(e) => setV({ ...v, [d]: { ...v[d], fin: e.target.value } })} />
          </div>
        </td>
      ))}
      {editable && <td className="td"><button className="btn-primary !px-3 !py-1.5" disabled={!sucio} onClick={guardar}>Guardar</button></td>}
    </tr>
  );
}

export default function Horarios() {
  const { usuario } = useAuth();
  const editable = usuario?.rol === 'admin';
  const { data, error, loading } = useLoad<any>(() => api.get('/horarios'));
  const [pestana, setPestana] = useState<'lineas' | 'estaciones'>('lineas');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const items = data?.[pestana] ?? [];

  return (
    <>
      <PageHeader title="Horarios" subtitle={editable ? 'Los cambios se publican de inmediato en la pantalla principal. Deje ambas horas vacías en un día para indicar que no hay servicio.' : 'Horarios publicados de las líneas y estaciones.'} />
      <div className="mb-4 flex gap-2" role="tablist">
        {([['lineas', 'Líneas'], ['estaciones', 'Estaciones']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
      <Estado loading={loading} error={error} vacio={items.length === 0 && 'No hay registros.'}>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead><tr><th className="th">{pestana === 'lineas' ? 'Línea' : 'Estación'}</th>{DIAS.map(([d, t]) => <th key={d} className="th">{t}</th>)}{editable && <th className="th" />}</tr></thead>
            <tbody>
              {items.map((it: any) => (
                <Fila key={`${pestana}-${it.id_linea ?? it.id_estacion}`} item={it} editable={editable} onResultado={setMsg}
                  ruta={pestana === 'lineas' ? `/horarios/lineas/${it.id_linea}` : `/horarios/estaciones/${it.id_estacion}`} />
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </>
  );
}
