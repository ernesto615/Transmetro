import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Inicio from './pages/Inicio';
import Dashboard from './pages/Dashboard';
import Lineas from './pages/Lineas';
import LineaDetalle from './pages/LineaDetalle';
import Estaciones from './pages/Estaciones';
import Buses from './pages/Buses';
import Parqueos from './pages/Parqueos';
import Pilotos from './pages/Pilotos';
import Cobros from './pages/Cobros';
import Alertas from './pages/Alertas';
import Mapa from './pages/Mapa';
import Reportes from './pages/Reportes';
import Registro from './pages/Registro';
import Finanzas from './pages/Finanzas';
import Demanda from './pages/Demanda';
import Horarios from './pages/Horarios';
import Sugerencias from './pages/Sugerencias';
import MiTarjeta from './pages/MiTarjeta';
import Recorridos from './pages/Recorridos';

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="p-8 text-sm text-slate">Cargando sesión…</p>;
  if (!usuario) return (
    <Routes>
      <Route path="/registro" element={<Registro />} />
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
  if (usuario.rol === 'pasajero') return (
    <Routes>
      <Route path="inicio" element={<Inicio />} />
      <Route element={<Layout />}>
        <Route index element={<MiTarjeta />} />
        <Route path="recorridos" element={<Recorridos />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
  return (
    <Routes>
      <Route path="inicio" element={<Inicio />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="alertas" element={<Alertas />} />
        <Route path="lineas" element={<Lineas />} />
        <Route path="lineas/:id" element={<LineaDetalle />} />
        <Route path="estaciones" element={<Estaciones />} />
        <Route path="buses" element={<Buses />} />
        <Route path="parqueos" element={<Parqueos />} />
        <Route path="pilotos" element={<Pilotos />} />
        <Route path="cobros" element={<Cobros />} />
        <Route path="horarios" element={<Horarios />} />
        <Route path="finanzas" element={<Finanzas />} />
        <Route path="demanda" element={<Demanda />} />
        <Route path="sugerencias" element={<Sugerencias />} />
        <Route path="reportes" element={<Reportes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
