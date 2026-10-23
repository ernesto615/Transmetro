# Transmetro: Sistema de Control de Líneas, Estaciones y Buses

Monorepo con `backend/` (Node.js + Express 5 + TypeScript + Sequelize + PostgreSQL + Socket.IO) y `frontend/` (React + Vite + Tailwind + Leaflet + Recharts).

## Puesta en marcha local

Requisitos: Node 20+ y Docker (para PostgreSQL).

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend (http://localhost:4000)
cd backend
npm install
npm run seed      # crea las tablas y carga datos de demostración (BORRA los datos existentes)
npm run dev

# 3. Frontend (http://localhost:5173), en otra terminal
cd frontend
npm install
npm run dev

# 4. (opcional) Simular buses en movimiento y alertas, en otra terminal
cd backend && npm run simular
```

Usuarios de demostración: `pasajero@transmetro.gt / Pasajero123!`, `admin@transmetro.gt / Admin123!`, `municipal@transmetro.gt / Muni12345!`, `operador@transmetro.gt / Oper12345!`, `guardia@transmetro.gt / Guardia123!`.
Cambie `JWT_SECRET` en `backend/.env` y elimine estas cuentas antes de cualquier despliegue real.

## Pantalla principal pública

Al abrir `http://localhost:5173` sin sesión se ve la página del ciudadano: información general, mapa de estaciones y líneas con buscador, recorridos, recarga de tarjeta sin iniciar sesión y, a la derecha, el inicio de sesión para pasajeros y personal. Usa los endpoints públicos `GET /api/publico/red` y `POST /api/publico/recargar` (limitado por IP); nunca expone buses, pilotos ni saldos.

### Identidad visual y contenido institucional

La pantalla principal usa el logo del Transmetro de la Municipalidad de Guatemala (`frontend/public/logo-transmetro.png`), la paleta institucional (verde, azul `#10069F`, blanco y gris `#F2F4F7`), los horarios y las reglas de uso publicados por la Municipalidad (`frontend/src/data/informacion.ts`, con su fuente). El inicio de sesión está en el menú de hamburguesa de arriba a la derecha. Para el fondo con fotos de Ciudad de Guatemala, Mixco, Villa Nueva y San José Pinula, coloque las imágenes en `frontend/public/fotos/` (ver `LEEME.txt` allí).

### Novedades de esta versión

- **Línea 4 San José Pinula:** San José Pinula, Santa Catarina Pinula, Condado Concepción, Zona Pradera, Zona 10, Obelisco y Trébol (7 estaciones, 7 buses). Coordenadas y distancias aproximadas: se corrigen desde la aplicación.
- **Solicitud de tarjeta:** la primera vez pide teléfono y DPI o NIT. El DPI y el NIT se guardan cifrados (AES-256-GCM con `DATOS_CLAVE` del `.env`) y se muestran enmascarados. Cambie `DATOS_CLAVE` antes de cualquier despliegue real.
- **Horarios editables:** el administrador cambia los horarios de líneas y estaciones en **Horarios**; se publican de inmediato en la pantalla principal.
- **Caja de sugerencias y quejas** al final de la pantalla principal; el personal las gestiona en **Sugerencias y quejas**.
- **Incidentes en tiempo real:** cada incidente se envía por Socket.IO (`incidente`, y `panico` para el botón de pánico) solo al personal.
- Los mapas ya no se sobreponen a los menús y se corrigió el error `appendChild` del Mapa en vivo.
- Después de actualizar, ejecute `npm run seed` de nuevo (cambió la estructura de la base).

### Finanzas, demanda y pantalla principal

- **Logo:** al hacer clic en el logo de la barra superior se abre la pantalla principal pública (`/inicio`); desde allí, "Ir a mi panel" regresa al sistema.
- **Finanzas** (solo administrador): flujo de caja mensual (entradas de efectivo por recargas y otros ingresos, menos salidas), cobertura de costos, costo por pasajero y saldo prepago en tarjetas. El administrador registra ingresos y egresos en el libro de movimientos.
- **Demanda y capacidad** (administrador y personal municipal): ranking de líneas por uso, estaciones con más pasajes, tendencia y alertas. Una línea es **crítica** con 1.5 veces la carga promedio por bus o 5 alertas de sobrecupo en 7 días; **alta** con 1.25 veces o 2 alertas; **baja** con la mitad del promedio. Recomienda agregar buses (sin pasar de 2N), una línea nueva o expreso si ya está en su máximo, o reasignar buses sobrantes (sin bajar de N). El botón "Notificar al centro de control" crea alertas `REFUERZO_FLOTA` en vivo.
- Cada pasaje guarda ahora su **línea** (se deduce si la estación tiene una sola; se puede indicar en el cobro).
- `npm run seed` genera datos de **demostración** (120 días de pasajes y recargas, alertas y 5 meses de ingresos/egresos). Son ficticios: explíquelo en la presentación. Las pruebas automáticas no los cargan.
- Cambió la estructura de la base: vuelva a ejecutar `npm run seed` (local y en Neon).

## Publicarlo en la nube gratis

Vea `DESPLIEGUE.md`: guía paso a paso con Render (servidor) y Neon (base de datos), ambos sin tarjeta de crédito.

## Reglas de negocio y dónde viven (backend/src/services)

| Regla | Archivo |
|---|---|
| Un bus pertenece a una sola línea (o a ninguna) | `db.ts` (id_linea nullable) + `buses.ts` |
| Buses por línea entre N y 2N estaciones | `buses.ts` (`validarCupo`, `validarSalida`), `lineas.ts` (`cumplimiento`) |
| Un bus nunca queda sin parqueo | `db.ts` (id_parqueo NOT NULL) + `buses.ts` (`cambiarParqueo`) |
| Distancia total de la línea = suma de tramos | `lineas.ts` (`reemplazarParadas`) |
| Distancia entre dos estaciones | `lineas.ts` (`distanciaEntre`), `GET /api/estaciones/distancia` |
| Alerta con espera ≥ 150 % de la capacidad; +5 min si a bordo < 25 % | `capacidad.ts` |
| Cobro con tarjeta atómico e idempotente | `pagos.ts` |
| Historial de cambios de asignación (RNF-6) | tabla `auditoria_bus` |
| Mínimo un guardia por acceso | reporte de estaciones (`cumple_guardia_minima`) |

## Endpoints principales (`/api`, JWT en `Authorization: Bearer`)

`POST /auth/login` · `POST /auth/registro` · portal del pasajero `/mi/tarjetas`, `/mi/tarjetas/solicitar`, `/mi/tarjetas/vincular`, `/mi/recargar`, `/mi/tarjetas/:numero/historial`, `/mi/lineas` · `GET /auth/me` · CRUD de `/municipalidades`, `/lineas`, `/estaciones`, `/accesos`, `/guardias`, `/operadores`, `/parqueos`, `/buses`, `/pilotos`, `/tarjetas`, `/usuarios`
`GET /lineas/:id/detalle` · `GET /lineas/:id/cumplimiento` · `PUT /lineas/:id/estaciones`
`PUT /buses/:id/linea` · `PUT /buses/:id/parqueo` · `POST /buses/:id/posicion` · `GET /buses/:id/historial`
`POST /ocupacion` · `GET /alertas` · `PATCH /alertas/:id/atender`
`POST /pagos` · `POST /tarjetas/recargar` · `GET /pagos`
`POST /incidentes` · `POST /incidentes/panico` · `GET /incidentes`
`GET /finanzas/resumen` · `GET|POST|DELETE /finanzas/movimientos` · `GET /demanda` · `POST /demanda/notificar` · `GET /horarios` · `PUT /horarios/lineas/:id` · `PUT /horarios/estaciones/:id` · `GET|PATCH /sugerencias` · públicos `POST /publico/sugerencias` · `GET /mi/perfil` · `GET /reportes/{estaciones|lineas-buses|accesos-por-linea}[?formato=csv]` · `GET /dashboard`
Eventos Socket.IO: `bus:posicion`, `alerta`, `incidente`, `panico`.

Roles: `pasajero` (se registra solo; ve y recarga sus tarjetas, consulta recorridos), `admin` (todo), `municipal` (lectura de su municipalidad, pilotos), `operador` (su estación: ocupación, cobros, incidentes), `guardia` (incidentes y pánico).

## Diferencias respecto al ER y script entregados

- Se añadieron: `usuario` y `auditoria_bus` (RBAC y RNF-6), `latitud/longitud` en `estacion` y `bus` (mapa/GPS), `atendida` en `alerta`, `referencia` en `transaccion` (idempotencia / RF-12), `ultima_posicion` en `bus`.
- `bus.id_parqueo` es NOT NULL (el script original lo permitía nulo, pero el requerimiento 7 prohíbe que un bus quede sin parqueo).
- PostgreSQL en lugar de MySQL, como define el documento de stack.

## Pendiente (siguientes pasos)

1. Migraciones versionadas (hoy `sequelize.sync({ alter: true })`, solo para desarrollo).
2. Pruebas: Jest + Supertest (reglas de `services/`), Playwright, k6; SonarQube y GitHub Actions.
3. Cifrado de datos de pilotos (pgcrypto) y bitácora de auditoría general (RNF-3).
4. Modo sin conexión de la PC de estación: PWA + IndexedDB (RF-12); el backend ya acepta `referencia` para sincronizar sin duplicar.
5. Swagger/OpenAPI, Docker del backend/frontend y despliegue en AWS EC2 con Nginx.
6. Tableros adicionales y vistas SQL de los reportes para dejar constancia de los queries en el documento.

## Pruebas automáticas del backend (Jest + Supertest)

```bash
# 1. Crear una base SOLO para pruebas (las pruebas borran y recrean sus tablas)
docker exec -it transmetro_db psql -U transmetro -d postgres -c "CREATE DATABASE transmetro_test;"

# 2. Ejecutar
cd backend
npm install
npm test            # todas las pruebas, una a una
npm run test:cov    # con reporte de cobertura (carpeta coverage/)
```

`tests/unit` prueba las reglas puras (rango de buses, umbrales de ocupación, distancias, CSV) sin base de datos.
`tests/integration` prueba los endpoints completos contra la base de pruebas; cada caso lleva el ID del Plan de Pruebas (CP-01, CP-02, ...).
Por seguridad, `tests/setup.ts` se niega a correr si el nombre de la base no contiene "test". Puede usar otra base con `TEST_DATABASE_URL`.
