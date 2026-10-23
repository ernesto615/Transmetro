import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { mensajeError } from '../api';

// Carga de datos con estado de error y recarga manual.
export function useLoad<T = any>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return fn()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(mensajeError(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'aviso'; children: ReactNode }) {
  const c = { error: 'border-alarm bg-alarm-soft text-alarm', ok: 'border-route bg-route-soft text-route-dark', aviso: 'border-signal bg-signal-soft text-ink' }[tipo];
  return <div role={tipo === 'error' ? 'alert' : 'status'} className={`mb-3 rounded border-l-4 px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Badge({ tono = 'neutro', children }: { tono?: 'ok' | 'aviso' | 'error' | 'neutro'; children: ReactNode }) {
  const c = { ok: 'bg-route-soft text-route-dark', aviso: 'bg-signal-soft text-[#7A5200]', error: 'bg-alarm-soft text-alarm', neutro: 'bg-paper text-slate border border-rule' }[tono];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function Estado({ loading, error, vacio, children }: { loading: boolean; error: string | null; vacio?: string | false; children: ReactNode }) {
  if (error) return <Notice>{error}</Notice>;
  if (loading) return <p className="py-6 text-sm text-slate">Cargando…</p>;
  if (vacio) return <p className="py-6 text-sm text-slate">{vacio}</p>;
  return <>{children}</>;
}

export function Modal({ title, onClose, children, ancho = 'max-w-lg' }: { title: string; onClose: () => void; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 pt-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`panel w-full ${ancho} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">{title}</h2>
          <button className="btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, ayuda }: { label: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="mb-3 block">
      <span className="label">{label}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate">{ayuda}</span>}
    </label>
  );
}

export function Tabla({ cols, children }: { cols: string[]; children: ReactNode }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr>{cols.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const km = (n: number | string | null | undefined) => `${Number(n ?? 0).toFixed(1)} km`;
export const fechaHora = (s?: string | null) => (s ? new Date(s).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtQ = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 });
export const moneda = (n: number | string | null | undefined) => fmtQ.format(Number(n ?? 0));
export const quetzales = (n: number | string) => `Q${Number(n).toFixed(2)}`;
