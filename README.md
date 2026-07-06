# TCCT Pliegos · Analizador de Pliegos

Mockup interno del analizador de pliegos de licitación pública para el equipo de presales de Telefónica Cybersecurity & Cloud Tech (TCCT).

Este es un mockup visual con datos de ejemplo — no procesa PDFs reales todavía. Sirve para validar la UX y vender el caso de uso internamente antes de invertir en la parte funcional.

## Arrancarlo en local (3 pasos)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` y ya lo tienes.

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

## Cambiar el dominio

En Vercel → Settings → Domains → puedes ponerle `tcct-pliegos.vercel.app` si está libre, o conectar un subdominio de TCCT si te dan permisos.

## Estructura

```
tcct-pliegos/
├── src/
│   ├── App.jsx       ← Todo el componente. Aquí se edita todo.
│   ├── main.jsx      ← Entry point de React
│   └── index.css     ← Tailwind + estilos globales
├── index.html        ← Carga Google Fonts
├── tailwind.config.js
├── vite.config.js
└── package.json
```

Los datos mock están al principio de `src/App.jsx` en las constantes `MOCK_PLIEGOS` y `MOCK_ANALYSIS`. Cualquier cambio se refleja en caliente con `npm run dev`.

## Próximos pasos

- [x] Modal de upload con drag & drop del PDF
- [ ] Vista de comparativa entre dos pliegos
- [ ] Conectar a Claude API o Azure OpenAI para extracción real
- [ ] Exportación real a Excel (SheetJS)
- [ ] Autenticación (SSO Telefónica si escala a producción)
