import { useState } from 'react';
import { api, mensajeError } from '../api';
import { Badge, Estado, Notice, PageHeader, fechaHora, useLoad } from '../components/ui';

const ESTADOS: [string, string][] = [['NUEVA', 'Nueva'], ['EN_REVISION', 'En revisión'], ['RESUELTA', 'Resuelta']];

function Tarjeta({ s, onCambio, onError }: { s: any; onCambio: () => void; onError: (m: string) => void }) {
  const [nota, setNota] = useState(s.nota_interna ?? '');
  const patch = (cuerpo: object) => api.patch(`/sugerencias/${s.id_sugerencia}`, cuerpo).then(onCambio).catch((e) => onError(mensajeError(e)));

  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={s.tipo === 'QUEJA' ? 'error' : 'ok'}>{s.tipo === 'QUEJA' ? 'Queja' : 'Sugerencia'}</Badge>
        <span className="text-sm text-slate">Folio {s.id_sugerencia} · {fechaHora(s.fecha_hora)}</span>
        <select className="input ml-auto !w-auto" aria-label="Estado" value={s.estado} onChange={(e) => patch({ estado: e.target.value })}>
          {ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>
      <p className="mt-3 whitespace-pre-wrap">{s.mensaje}</p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate">
        <div><dt className="inline">De: </dt><dd className="inline text-ink">{s.nombre || 'Anónimo'}</dd></div>
        {s.contacto && <div><dt className="inline">Contacto: </dt><dd className="inline text-ink">{s.contacto}</dd></div>}
        {s.linea && <div><dt className="inline">Línea: </dt><dd className="inline text-ink">{s.linea.nombre}</dd></div>}
        {s.estacion && <div><dt className="inline">Estación: </dt><dd className="inline text-ink">{s.estacion.nombre}</dd></div>}
      </dl>
      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="Nota interna (solo la ve el personal)" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
        <button className="btn-ghost whitespace-nowrap" disabled={nota === (s.nota_interna ?? '')} onClick={() => patch({ nota_interna: nota })}>Guardar nota</button>
      </div>
    </article>
  );
}

export default function Sugerencias() {
  const [filtro, setFiltro] = useState('');
  const { data, error, loading, reload } = useLoad<any[]>(() => api.get(`/sugerencias${filtro ? `?estado=${filtro}` : ''}`), [filtro]);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Sugerencias y quejas" subtitle="Mensajes enviados por los ciudadanos desde la pantalla principal."
        actions={<select className="input !w-auto" aria-label="Filtrar por estado" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todas</option>{ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>} />
      {err && <Notice>{err}</Notice>}
      <Estado loading={loading} error={error} vacio={data?.length === 0 && 'No hay mensajes con ese filtro.'}>
        <div className="space-y-3">{data?.map((s) => <Tarjeta key={s.id_sugerencia} s={s} onCambio={reload} onError={setErr} />)}</div>
      </Estado>
    </>
  );
}
