# Aura · Reserva Studio

Sistema fullstack de reservas para un estudio de bienestar. Interfaz en español, adaptable a móviles, API HTTP y almacenamiento real en SQLite. Proyecto de portafolio ejecutable con Node.js 24 sin instalar paquetes externos.

## Inicio rápido

1. Instala Node.js 24 o superior.
2. Copia `.env.example` a `.env` y cambia `ADMIN_TOKEN` por una clave aleatoria larga.
3. Ejecuta `npm start`.
4. Abre http://localhost:3000.

En PowerShell puedes copiar la configuración con `Copy-Item .env.example .env`. Para desarrollo: `npm run dev`. Para pruebas: `npm test`.

Si tu instalación incluye Node pero no npm, ejecuta `node --env-file-if-exists=.env server.js` para iniciar y `node --test` para verificar el backend. npm no es necesario para la aplicación.

## Funciones

- Tres servicios con precio y duración: masaje, facial y ritual.
- Horarios de 10:00 a 19:00, todos los días, en America/Mexico_City.
- Reservas hasta 90 días de anticipación y bloqueo de horas pasadas.
- Comprobación de solapamientos según duración dentro de una transacción SQLite.
- Confirmación con código aleatorio y consulta con código + correo.
- Administración con clave: listado, totales y cancelación que libera horarios.
- Datos persistentes en `data/bookings.db`, fuera del control de versiones.
- Validación del servidor, consultas parametrizadas y políticas de contenido.

## Arquitectura

`public/` contiene la interfaz HTML/CSS/JavaScript. `server.js` sirve los archivos y la API mediante `node:http`; `node:sqlite` gestiona la base de datos. Las pruebas de integración viven en `test/`.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/services` | Catálogo y fecha local |
| GET | `/api/slots?service=massage&date=YYYY-MM-DD` | Disponibilidad |
| POST | `/api/bookings` | Crear reserva: service, date, time, name, email |
| POST | `/api/bookings/lookup` | Consultar: code, email |
| GET | `/api/admin/bookings` | Listar con `Authorization: Bearer CLAVE` |
| PATCH | `/api/admin/bookings/:code` | Cancelar con `{"status":"cancelled"}` y clave |

## Alcance y despliegue

Es un MVP para una sola agenda: no incluye múltiples profesionales, pagos en línea, envío de correos, recuperación de códigos ni cuentas individuales. El pago se realiza en el estudio. La clave de administración se mantiene únicamente en memoria en el navegador.

El servidor escucha solo en `127.0.0.1`. Para publicarlo usa un proxy HTTPS en el mismo host, configura un secreto fuerte, añade límites de solicitudes y copias de seguridad del archivo SQLite. Se requiere almacenamiento persistente; un alojamiento de archivos estáticos no ejecuta este backend. No publiques `.env` ni `data/`.

## Subir a GitHub

Desde esta carpeta, crea un repositorio vacío en tu cuenta y ejecuta:

```sh
git init
git add .
git commit -m "Build booking system with SQLite persistence"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/reserva-studio.git
git push -u origin main
```

Reemplaza `TU_USUARIO` por tu cuenta. No hay credenciales ni datos personales de demostración incluidos.
