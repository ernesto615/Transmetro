import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import { closeSocket } from './socket';

export type Rol = 'admin' | 'municipal' | 'operador' | 'guardia' | 'pasajero';
export interface Usuario { id: number; nombre: string; rol: Rol; idEstacion: number | null; idMunicipalidad: number | null }

interface Ctx {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  registrar: (nombre: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.get<Usuario>('/auth/me').then(setUsuario).catch(() => setToken(null)).finally(() => setCargando(false));
  }, []);

  const iniciar = (r: any) => {
    setToken(r.token);
    setUsuario({ id: r.usuario.id, nombre: r.usuario.nombre, rol: r.usuario.rol, idEstacion: r.usuario.id_estacion, idMunicipalidad: r.usuario.id_municipalidad });
  };
  const login = async (email: string, password: string) => iniciar(await api.post('/auth/login', { email, password }));
  const registrar = async (nombre: string, email: string, password: string) => iniciar(await api.post('/auth/registro', { nombre, email, password }));
  const logout = () => {
    setToken(null);
    closeSocket();
    setUsuario(null);
  };
  return <AuthCtx.Provider value={{ usuario, cargando, login, registrar, logout }}>{children}</AuthCtx.Provider>;
}

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador central',
  municipal: 'Personal municipal',
  operador: 'Operador de estación',
  guardia: 'Guardia de seguridad',
  pasajero: 'Pasajero',
};
