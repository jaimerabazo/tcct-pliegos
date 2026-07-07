# TCCT Pliegos · Analizador de Pliegos

Mockup interno del analizador de pliegos de licitación pública para el equipo de presales de Telefónica Cybersecurity & Cloud Tech (TCCT).

La extracción de datos de los pliegos ya usa la API de Anthropic Claude a través de una función serverless (`api/analyze.js`); el resto del producto (dashboard, navegación) sigue siendo el mismo mockup en React.

## Arrancarlo en local (3 pasos)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` y ya lo tienes. **Ojo**: con `npm run dev` (Vite) el modal de "Nuevo análisis" no puede llamar a `/api/analyze`, porque Vite solo sirve el frontend. Para probar la extracción real en local:

```bash
npx vercel link      # una vez, para asociar la carpeta al proyecto de Vercel
npx vercel env pull  # trae las variables de entorno del proyecto (o crea .env.local con ANTHROPIC_API_KEY=sk-ant-...)
npm run dev:api      # arranca vercel dev, sirve frontend + /api juntos
```

## Desplegarlo en Vercel (10 min)

1. **Crea un repo en GitHub** con este proyecto. Desde la carpeta del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Initial mockup"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/tcct-pliegos.git
   git push -u origin main
   ```

2. **Entra en [vercel.com](https://vercel.com)** e inicia sesión con GitHub (gratis, sin tarjeta).

3. **Import Project** → selecciona `tcct-pliegos` → Vercel detecta Vite automáticamente → **Deploy**.

En 90 segundos tienes una URL tipo `tcct-pliegos-xxx.vercel.app` que puedes compartir con JC o con quien quieras.

**Variable de entorno necesaria**: en el proyecto de Vercel (Settings → Environment Variables) añade `ANTHROPIC_API_KEY` para Production y Preview — sin ella, `/api/analyze` responde con error. Opcionalmente puedes definir `ANTHROPIC_MODEL`; por defecto usa `claude-sonnet-5`.

## Cambiar el dominio

En Vercel → Settings → Domains → puedes ponerle `tcct-pliegos.vercel.app` si está libre, o conectar un subdominio de TCCT si te dan permisos.

## Estructura

```
tcct-pliegos/
├── api/
│   └── analyze.js    ← Función serverless (Vercel): envía el PDF a Claude y extrae el JSON estructurado
├── src/
│   ├── App.jsx       ← Todo el componente de frontend. Aquí se edita todo lo visual.
│   ├── main.jsx      ← Entry point de React
│   └── index.css     ← Tailwind + estilos globales
├── index.html        ← Carga Google Fonts
├── tailwind.config.js
├── vite.config.js
└── package.json
```

Las filas del dashboard que aún no se han analizado con la API siguen viniendo de `MOCK_PLIEGOS`/`MOCK_ANALYSIS` en `src/App.jsx`. Los expedientes analizados vía "Nuevo análisis" usan los datos reales devueltos por `/api/analyze`.

**Límite conocido**: las funciones serverless de Vercel (Node) aceptan hasta ~4.5 MB de payload. Pliegos muy grandes o con anexos escaneados pueden superarlo y fallar — pendiente de revisar si se convierte en un problema real.

## Próximos pasos

- [x] Modal de upload con drag & drop del PDF
- [x] Conectar a la API de Anthropic Claude para extracción real
- [ ] Vista de comparativa entre dos pliegos (aparcada mientras se validaba la extracción real)
- [ ] Exportación real a Excel (SheetJS)
- [ ] Autenticación (SSO Telefónica si escala a producción)
