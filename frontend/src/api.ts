const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { campo: string; mensaje: string }[]) {
    super(message);
  }
}

export const getToken = () => localStorage.getItem('tm_token');
export const setToken = (t: string | null) => (t ? localStorage.setItem('tm_token', t) : localStorage.removeItem('tm_token'));

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    setToken(null);
    window.location.href = '/';
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Error inesperado', data.details);
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, b?: unknown) => request<T>(p, 'POST', b ?? {}),
  put: <T = any>(p: string, b?: unknown) => request<T>(p, 'PUT', b ?? {}),
  patch: <T = any>(p: string, b?: unknown) => request<T>(p, 'PATCH', b ?? {}),
  del: <T = any>(p: string) => request<T>(p, 'DELETE'),
  // Descarga autenticada de reportes CSV
  async descargar(path: string, nombre: string) {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(res.status, 'No se pudo generar el archivo');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const mensajeError = (e: unknown) => {
  if (e instanceof ApiError) return e.details?.length ? `${e.message}: ${e.details.map((d) => `${d.campo} ${d.mensaje}`).join('; ')}` : e.message;
  return 'No hay conexión con el servidor. Verifique que la API esté en marcha.';
};
