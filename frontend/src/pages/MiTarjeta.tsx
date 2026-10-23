import { useEffect, useState } from 'react';
import { api, mensajeError } from '../api';
import { Formulario } from '../components/ResourcePage';
import { Badge, Estado, Field, Modal, Notice, PageHeader, Tabla, fechaHora, quetzales, useLoad } from '../components/ui';

const MONTOS = [5, 10, 20, 50];
const TIPO: Record<string, string> = { TARJETA: 'Pasaje', RECARGA: 'Recarga en estación', RECARGA_EN_LINEA: 'Recarga en línea' };

// Datos que se piden la primera vez que se solicita una tarjeta: teléfono y DPI o NIT.
function DatosTarjeta({ perfil, onClose, onEnviar }: { perfil: any; onClose: () => void; onEnviar: (b: any) => Promise<void> }) {
  const [v, setV] = useState({ telefono: '', dpi: '', nit: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const faltaTel = !perfil?.telefono;
  const faltaDoc = !perfil?.dpi && !perfil?.nit;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {};
    for (const k of ['telefono', 'dpi', 'nit'] as const) if (v[k].trim()) body[k] = v[k].trim();
    setBusy(true);
    try { await onEnviar(body); } catch (x) { setErr(mensajeError(x)); setBusy(false); }
  }

  return (
    <Modal title="Datos para solicitar su tarjeta" onClose={onClose}>
      <form onSubmit={enviar}>
        <p className="mb-4 text-sm text-slate">Para entregarle una tarjeta a su nombre necesitamos su teléfono y su número de DPI o de NIT. Sus documentos se guardan cifrados y solo se muestran parcialmente.</p>
        {err && <Notice>{err}</Notice>}
        {faltaTel && <Field label="Número de teléfono" ayuda="8 dígitos. Ejemplo: 5555-0123"><input className="input" inputMode="tel" required autoFocus value={v.telefono} onChange={(e) => setV({ ...v, telefono: e.target.value })} /></Field>}
        {faltaDoc ? (
          <>
            <Field label="Número de DPI" ayuda="13 dígitos"><input className="input" inputMode="numeric" value={v.dpi} onChange={(e) => setV({ ...v, dpi: e.target.value })} /></Field>
            <Field label="Número de NIT" ayuda="Puede usar su DPI, su NIT, o ambos. Con el dígito verificador, por ejemplo 1234567-K"><input className="input" value={v.nit} onChange={(e) => setV({ ...v, nit: e.target.value })} /></Field>
          </>
        ) : <p className="mb-3 text-sm">Documento registrado: <strong>{perfil.dpi ?? perfil.nit}</strong></p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || (faltaDoc && !v.dpi.trim() && !v.nit.trim())}>{busy ? 'Solicitando…' : 'Solicitar tarjeta'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MiTarjeta() {
  const { data: tarjetas, error, loading, reload } = useLoad<any[]>(() => api.get('/mi/tarjetas'));
  const [numero, setNumero] = useState<string | null>(null);
  const [monto, setMonto] = useState('10');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [vincular, setVincular] = useState(false);
  const perfil = useLoad<any>(() => api.get('/mi/perfil'));
  const [datos, setDatos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (tarjetas?.length && !tarjetas.some((t) => t.numero === numero)) setNumero(tarjetas[0].numero); }, [tarjetas]);

  const hist = useLoad<any>(() => (numero ? api.get(`/mi/tarjetas/${numero}/historial`) : Promise.resolve(null)), [numero]);
  const actual = tarjetas?.find((t) => t.numero === numero);

  async function enviarSolicitud(cuerpo: object) {
    const t = await api.post('/mi/tarjetas/solicitar', cuerpo);
    setMsg({ tipo: 'ok', texto: `Su nueva tarjeta es ${t.numero}.` });
    setNumero(t.numero); setDatos(false); reload(); perfil.reload();
  }
  // La primera vez se piden teléfono y DPI o NIT; después la tarjeta se solicita directo.
  function pedir() {
    if (perfil.data?.completo) enviarSolicitud({}).catch((e) => setMsg({ tipo: 'error', texto: mensajeError(e) }));
    else setDatos(true);
  }
  async function recargar() {
    setBusy(true);
    try {
      const r = await api.post('/mi/recargar', { numero, monto: Number(monto), referencia: crypto.randomUUID() });
      setMsg({ tipo: 'ok', texto: `Recarga de ${quetzales(monto)} aprobada. Su saldo es ${quetzales(r.saldo)}.` });
      reload(); hist.reload();
    } catch (e) { setMsg({ tipo: 'error', texto: mensajeError(e) }); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Mi tarjeta" subtitle="Consulte su saldo, recargue y revise dónde y cuándo ha usado su tarjeta."
        actions={<><button className="btn-ghost" onClick={() => setVincular(true)}>Vincular tarjeta</button><button className="btn-primary" onClick={pedir}>Solicitar tarjeta nueva</button></>} />
      {msg && <Notice tipo={msg.tipo}>{msg.texto}</Notice>}
      <Estado loading={loading} error={error} vacio={tarjetas?.length === 0 && 'Todavía no tiene tarjetas. Solicite una nueva o vincule la que ya tiene.'}>
        <div className="mb-5 flex flex-wrap gap-3">
          {tarjetas?.map((t) => (
            <button key={t.id_tarjeta} onClick={() => setNumero(t.numero)} aria-pressed={t.numero === numero}
              className={`panel min-w-56 p-4 text-left ${t.numero === numero ? 'border-route ring-2 ring-route' : 'hover:bg-route-soft/40'}`}>
              <div className="text-sm text-slate">{t.numero}</div>
              <div className="font-display text-3xl font-semibold">{quetzales(t.saldo)}</div>
              <div className="text-xs text-slate">saldo disponible</div>
            </button>
          ))}
        </div>

        {actual && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
            <section className="panel p-4">
              <h2 className="mb-3 text-xl">Recargar saldo</h2>
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Montos rápidos">
                {MONTOS.map((m) => <button key={m} onClick={() => setMonto(String(m))} className={Number(monto) === m ? 'btn-primary' : 'btn-ghost'}>Q{m}</button>)}
              </div>
              <Field label="Otro monto (Q)"><input className="input" type="number" min="1" max="500" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
              <button className="btn-primary w-full" disabled={busy || !(Number(monto) >= 1)} onClick={recargar}>{busy ? 'Procesando…' : `Pagar Q${Number(monto || 0).toFixed(2)}`}</button>
            </section>

            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl">Movimientos</h2>
                {hist.data?.ultimo_uso
                  ? <Badge tono="ok">Último uso: {fechaHora(hist.data.ultimo_uso.fecha_hora)}{hist.data.ultimo_uso.estacion ? ` · ${hist.data.ultimo_uso.estacion}` : ''}</Badge>
                  : <Badge>Aún no la ha usado para pagar</Badge>}
              </div>
              <Estado loading={hist.loading} error={hist.error} vacio={hist.data?.movimientos.length === 0 && 'Sin movimientos todavía.'}>
                <Tabla cols={['Fecha', 'Tipo', 'Lugar', 'Monto']}>
                  {hist.data?.movimientos.map((m: any) => (
                    <tr key={m.id_transaccion}>
                      <td className="td whitespace-nowrap">{fechaHora(m.fecha_hora)}</td>
                      <td className="td">{TIPO[m.medio_pago] ?? m.medio_pago}</td>
                      <td className="td">{m.estacion?.nombre ?? 'En línea'}</td>
                      <td className={`td ${m.medio_pago === 'TARJETA' ? '' : 'text-route-dark'}`}>{m.medio_pago === 'TARJETA' ? '−' : '+'}{quetzales(m.monto)}</td>
                    </tr>
                  ))}
                </Tabla>
              </Estado>
            </section>
          </div>
        )}
      </Estado>
      {datos && <DatosTarjeta perfil={perfil.data} onClose={() => setDatos(false)} onEnviar={enviarSolicitud} />}
      {vincular && (
        <Formulario titulo="Vincular tarjeta" inicial={{}} onClose={() => setVincular(false)}
          campos={[{ name: 'numero', label: 'Número de la tarjeta', required: true, ayuda: 'Solo puede vincular tarjetas que no pertenezcan a otra cuenta.' }]}
          onGuardar={async (b) => { await api.post('/mi/tarjetas/vincular', b); setVincular(false); reload(); }} />
      )}
    </>
  );
}
