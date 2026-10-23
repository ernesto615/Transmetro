# Cómo publicar Transmetro en la nube gratis (sin tarjeta de crédito)

**Plan:** el servidor y la web viven en **Render** (plan Free) y la base de datos en **Neon** (plan Free).
Ninguno pide tarjeta, así que **no hay forma de que le cobren** mientras no agregue una. La web y la API salen del mismo servicio, con una sola dirección.

| Pieza | Servicio | Costo | Límite que debe conocer |
|---|---|---|---|
| Web + API + tiempo real | Render, Web Service plan **Free** | $0 | Se "duerme" tras 15 min sin visitas; despertar tarda cerca de 1 minuto |
| Base de datos PostgreSQL | Neon, plan **Free** | $0 | 0.5 GB y 100 horas de cómputo al mes; se suspende a los 5 min sin uso y despierta en unos segundos |
| Código | GitHub | $0 | Render lo descarga de aquí |

Las condiciones gratuitas cambian. Revise render.com/docs/free y neon.com/pricing antes de empezar.

## 0. Ensayo local en modo producción (recomendado antes de publicar)

Así comprueba en su computadora, con la misma configuración de la nube, que todo arranca. Con Docker en marcha y desde la carpeta del proyecto (PowerShell):

```powershell
docker exec -it transmetro_db psql -U transmetro -d postgres -c "CREATE DATABASE transmetro_ensayo;"
cd frontend
npm install
npm run build
cd ../backend
npm install
$env:NODE_ENV="production"
$env:DATABASE_URL="postgres://transmetro:transmetro@localhost:5432/transmetro_ensayo"
$env:JWT_SECRET="un-secreto-largo-de-prueba-123456"
$env:DATOS_CLAVE="otro-secreto-largo-de-prueba-123456"
$env:AUTO_SEED="true"
$env:SEED_ADMIN_PASSWORD="MiClave123!"
npm start
```
Debe decir `Base vacía: cargando datos de demostración…` y luego `API Transmetro en http://localhost:4000`.
Abra **http://localhost:4000** (no el 5173): debe verse la pantalla principal completa, servida por el mismo servidor.
Si esto funciona, la publicación en Render funcionará igual. Si falla, el mensaje de error de la terminal dice por qué; envíemelo.

## 1. Subir el proyecto a GitHub

```bash
cd transmetro
git init
git add .
git commit -m "Transmetro"
# Cree un repositorio vacío en github.com y copie su dirección:
git branch -M main
git remote add origin https://github.com/SU_USUARIO/transmetro.git
git push -u origin main
```
El archivo `.gitignore` ya excluye `.env` y `node_modules`: **nunca suba contraseñas ni archivos .env**.
Este repositorio sirve también para el enlace que pide el enunciado del proyecto.

## 2. Crear la base de datos en Neon

1. Entre a neon.com y cree una cuenta (con Google o GitHub, sin tarjeta).
2. Cree un proyecto. Nombre: `transmetro`. Región: **AWS US East (Ohio)** o la más cercana en Estados Unidos.
3. En el panel, botón **Connect**. Apague la opción **Connection pooling** y copie la cadena que empieza con `postgresql://...` (incluye `?sslmode=require`).
4. Guárdela en un lugar privado: es su `DATABASE_URL`.

## 3. Crear el servicio en Render

1. Entre a render.com con su cuenta de GitHub. **No agregue método de pago.**
2. **New +** → **Web Service** → elija su repositorio `transmetro`.
3. Configure:
   - Language / Runtime: **Node**
   - Region: **Ohio** (la misma zona de Neon)
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Instance Type: **Free**
4. En **Environment Variables** agregue:

| Variable | Valor |
|---|---|
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | la cadena de Neon |
| `JWT_SECRET` | texto largo aleatorio (vea abajo) |
| `DATOS_CLAVE` | otro texto largo aleatorio |
| `SEED_ADMIN_PASSWORD` | una contraseña privada para el administrador |
| `AUTO_SEED` | `true` (carga los datos de demostración la primera vez) |

Para generar un texto aleatorio, en su computadora:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
5. Pulse **Create Web Service**. La primera publicación tarda unos 5 a 10 minutos.
6. Cuando diga **Live**, abra la dirección `https://transmetro-xxxx.onrender.com`. Debe ver la pantalla principal.
7. En el menú ☰ inicie sesión con `admin@transmetro.gt` y la contraseña que puso en `SEED_ADMIN_PASSWORD`.

(Opcional) El archivo `render.yaml` hace estos mismos pasos con **New +** → **Blueprint**.

## 3.5 Verificación después de publicar

Abra estas direcciones (cambie el dominio por el suyo):

1. `https://SU-DIRECCION/health` debe responder `{"ok":true,...}`.
2. `https://SU-DIRECCION/api/publico/red` debe mostrar un JSON con 4 líneas y 14 estaciones.
3. `https://SU-DIRECCION/` debe mostrar la pantalla principal con el mapa y la foto del banner.
4. Inicie sesión como administrador y revise **Tablero**, **Finanzas** y **Demanda y capacidad**: deben mostrar datos de demostración.
5. Haga clic en el logo de la barra superior: debe abrir la pantalla principal.

Si el paso 2 funciona pero Finanzas o Demanda salen vacías, en *Logs* de Render busque el aviso `No se pudieron cargar los datos de demostración`; el resto del sistema sigue funcionando.

## 4. Para que esté despierto durante la presentación

- Abra la dirección **10 minutos antes** de presentar: así evita la espera del primer arranque.
- Opcional: cree un monitor gratis en uptimerobot.com que visite `https://SU-DIRECCION/health` cada 5 minutos. Mientras esté activo, Render no la duerme. **Apáguelo después del viernes.**
- Tenga el proyecto local funcionando como respaldo (`npm run dev`), por si falla el internet del salón.

## 5. Actualizar el sitio después de cambios

```bash
git add .
git commit -m "Cambios"
git push
```
Render vuelve a publicar solo.

Si cambió la **estructura de la base de datos** (tablas o columnas nuevas), en producción no se ajusta sola. Reinicie los datos desde su computadora (esto **borra** todo y recarga la demostración):
```powershell
cd backend
$env:DATABASE_URL="la cadena de Neon"
$env:SEED_ADMIN_PASSWORD="su contraseña de admin"
npm run seed
```

> **Importante tras actualizar el código:** si el sitio ya estaba publicado y se agregaron tablas o columnas (como en las finanzas y la demanda), en producción no se ajustan solas. Reinicie los datos de Neon con el comando `npm run seed` de la sección 5. Con `AUTO_SEED=true` y una base vacía, la primera carga incluye los datos de demostración (unas 65 mil filas; es normal que tarde un poco más).

## 6. Cómo asegurarse de no pagar

- No agregue tarjeta en Render ni en Neon. Sin tarjeta no pueden cobrar.
- No pulse **Upgrade** ni elija un plan de pago.
- En Render, el servicio debe decir **Free** en *Settings → Instance Type*.
- Si el servicio gratuito agota sus horas del mes, Render lo suspende; no cobra.
- Terminada la presentación: en Render, *Settings → Suspend Service* o *Delete*; en Neon, elimine el proyecto.

## 7. Cuentas de demostración en un sitio público

Cualquiera que tenga la dirección puede intentar entrar. Use una contraseña propia para el administrador (`SEED_ADMIN_PASSWORD`).
Las demás cuentas de demostración (municipal, operador, guardia, pasajero) siguen con sus contraseñas conocidas: no ponga datos reales en el sistema y apáguelo al terminar.

## 8. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| "Application loading" por casi un minuto | Es el arranque tras dormir. Espere y recargue |
| Error de conexión a la base | Revise `DATABASE_URL` (completa, con `sslmode=require`) y desactive el *pooling* en Neon |
| Falla el build con "out of memory" | Reintente con *Manual Deploy → Clear build cache & deploy* |
| La página abre pero el mapa sale gris | El navegador no pudo cargar OpenStreetMap; revise internet |
| Al iniciar sesión dice credenciales incorrectas | Use la contraseña de `SEED_ADMIN_PASSWORD`, no `Admin123!` |
| Cambió código y la base no tiene las columnas nuevas | Vuelva a ejecutar `npm run seed` contra Neon (sección 5) |
| El servicio dice "Failed" al iniciar | Revise *Logs*; lo más común es faltar `JWT_SECRET` o `DATOS_CLAVE` |

## 9. ¿Y AWS?

AWS puede servir, pero **no es lo más seguro para evitar cobros**: exige tarjeta, hay que armar servidor, red y base de datos por separado, y los servicios de base de datos no tienen capa gratuita permanente. Las cuentas nuevas reciben créditos por un tiempo limitado y, si eligen el plan de pago, se cobra al agotarse. Para una presentación de una semana, Render + Neon es más simple y sin riesgo de cobro.
