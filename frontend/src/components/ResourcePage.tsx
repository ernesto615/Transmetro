import { useState, type ReactNode } from 'react';
import { api, mensajeError } from '../api';
import { Estado, Field, Modal, Notice, PageHeader, Tabla, useLoad } from './ui';

export interface Campo {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'select' | 'date';
  options?: { value: number | string; label: string }[];
  required?: boolean;
  ayuda?: string;
}
interface Props {
  titulo: string;
  subtitulo?: string;
  endpoint: string;
  idKey: string;
  columnas: { titulo: string; celda: (r: any) => ReactNode }[];
  campos: Campo[];
  puedeEscribir: boolean;
  nombreSingular: string;
  extra?: ReactNode;
}

// Pantalla CRUD reutilizable: tabla + modal de alta/edición + eliminación con confirmación.
export default function ResourcePage(p: Props) {
  const { data, error, loading, reload } = useLoad<any[]>(() => api.get(p.endpoint), [p.endpoint]);
  const [editando, setEditando] = useState<any | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function eliminar(r: any) {
    if (!confirm(`¿Eliminar este registro de ${p.nombreSingular}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`${p.endpoint}/${r[p.idKey]}`);
      setAviso(null);
      reload();
    } catch (e) {
      setAviso(mensajeError(e));
    }
  }

  return (
    <>
      <PageHeader
        title={p.titulo}
        subtitle={p.subtitulo}
        actions={p.puedeEscribir && <button className="btn-primary" onClick={() => setEditando('nuevo')}>Agregar {p.nombreSingular}</button>}
      />
      {p.extra}
      {aviso && <Notice>{aviso}</Notice>}
      <Estado loading={loading} error={error} vacio={data?.length === 0 && `Aún no hay registros. ${p.puedeEscribir ? `Agregue el primer ${p.nombreSingular}.` : ''}`}>
        <Tabla cols={[...p.columnas.map((c) => c.titulo), ...(p.puedeEscribir ? ['Acciones'] : [])]}>
          {data?.map((r) => (
            <tr key={r[p.idKey]} className="hover:bg-route-soft/40">
              {p.columnas.map((c) => <td key={c.titulo} className="td">{c.celda(r)}</td>)}
              {p.puedeEscribir && (
                <td className="td whitespace-nowrap">
                  <button className="btn-ghost !px-2 !py-1" onClick={() => setEditando(r)}>Editar</button>{' '}
                  <button className="btn-ghost !px-2 !py-1 text-alarm" onClick={() => eliminar(r)}>Eliminar</button>
                </td>
              )}
            </tr>
          ))}
        </Tabla>
      </Estado>
      {editando && (
        <Formulario
          titulo={editando === 'nuevo' ? `Agregar ${p.nombreSingular}` : `Editar ${p.nombreSingular}`}
          campos={p.campos}
          inicial={editando === 'nuevo' ? {} : editando}
          onClose={() => setEditando(null)}
          onGuardar={async (body) => {
            if (editando === 'nuevo') await api.post(p.endpoint, body);
            else await api.patch(`${p.endpoint}/${editando[p.idKey]}`, body);
            setEditando(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function Formulario({ titulo, campos, inicial, onClose, onGuardar }: {
  titulo: string; campos: Campo[]; inicial: any; onClose: () => void; onGuardar: (b: any) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, any>>(() => Object.fromEntries(campos.map((c) => [c.name, inicial[c.name] ?? ''])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {};
    for (const c of campos) {
      const x = v[c.name];
      if (x === '' || x === null || x === undefined) body[c.name] = c.required ? undefined : null;
      else body[c.name] = c.type === 'number' || c.type === 'select' && typeof c.options?.[0]?.value === 'number' ? Number(x) : x;
    }
    setBusy(true);
    try {
      await onGuardar(body);
    } catch (e2) {
      setErr(mensajeError(e2));
      setBusy(false);
    }
  }

  return (
    <Modal title={titulo} onClose={onClose}>
      <form onSubmit={enviar}>
        {err && <Notice>{err}</Notice>}
        {campos.map((c) => (
          <Field key={c.name} label={c.label + (c.required ? '' : ' (opcional)')} ayuda={c.ayuda}>
            {c.type === 'select' ? (
              <select className="input" required={c.required} value={v[c.name]} onChange={(e) => setV({ ...v, [c.name]: e.target.value })}>
                <option value="">{c.required ? 'Seleccione…' : 'Ninguno'}</option>
                {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="input" type={c.type ?? 'text'} step={c.type === 'number' ? 'any' : undefined} required={c.required}
                value={v[c.name]} onChange={(e) => setV({ ...v, [c.name]: e.target.value })} />
            )}
          </Field>
        ))}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </Modal>
  );
}
