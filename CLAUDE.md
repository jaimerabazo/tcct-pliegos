# CLAUDE.md — TCCT Pliegos

> Contexto persistente para trabajar con Claude en el proyecto **Analizador de Pliegos** de Telefónica Cybersecurity & Cloud Tech (TCCT). Pegar en el próximo chat o dejar en la raíz del repo.

---

## 1. Quién y qué

**Jaime**, presales/bid management en TCCT. Trabajo diario: responder licitaciones públicas (pliegos PPT + PCAP) y automatizar tareas presales con IA.

**Ecosistema**: Yirah, JC (manager), Laura Fdez, María Moríñigo, Octavio (equipo interno); Mónica Cuadrado, Nieves Vega, Oficina Eficiencia (externo); Bea (Compras).

**Dominio**: contratación pública española (ENS, CCN-STIC, GISS/Seguridad Social como cliente clave), ciberseguridad (Fortinet, Cisco UCS, VMware, CrowdStrike, Qualys, XDR/SOAR/EDR/ASM), documentación RFP.

---

## 2. El proyecto

**Nombre**: TCCT Pliegos · Presales Suite
**Objetivo**: automatizar la extracción estructurada de datos de expedientes de licitación pública, para acelerar el bloque "Dispatching" y "Diseño Solución" del Presales Journey de TCCT.

**Origen**: análisis del "Presales Journey" (5 bloques secuenciales — Dispatching → Diseño Solución → Business Case → Presentación Oferta → Post Venta). Se identificaron 10 cuellos de botella; se priorizó el **lector de pliegos** como quick win por dos motivos: (1) es el trabajo diario actual de Jaime con el expediente 2026/7008 de GISS, (2) input y output cerrados (PDF entra, JSON estructurado sale) — no requiere integración con Salesforce/SHERPA/Outlook para arrancar.

**Estrategia comercial interna**: enseñar mockup a JC para vender la idea antes de invertir en la parte funcional. La demo visual pesa más que un diagrama técnico.

---

## 3. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| **Descartado Flowise** para este caso | Dependencia de infra corporativa, curva de aprobación IT, demo poco vendible internamente. Se reserva para casos futuros. |
| **Frontend propio en React** | Control total del prompt engineering, iteración rápida, deploy en Vercel sin infra, demo directamente compartible con URL. |
| **Mockup visual primero (mock data)** | Validar UX con JC antes de gastar tiempo en el LLM real. |
| **Dos pantallas**: dashboard + análisis detallado | Suficiente para vender la idea; ampliable después. |
| **Estilo Telefónica Tech corporativo** | Se pega a la identidad de la empresa para transmitir producto interno de verdad, no POC de fin de semana. |

---

## 4. Estado actual (06/07/2026)

**Entregado**:
- Repo `tcct-pliegos` en GitHub (`jaimerabazo/tcct-pliegos`), con `main` ya desplegado.
- Mockup funcional en React (Vite + React 18 + Tailwind 3 + lucide-react + Google Fonts precargadas).
- Rama `feat/upload-pdf`: modal de upload con drag & drop del PDF (primer ítem del backlog corto plazo, ver §10) — simula validación de PDF, progreso de "extracción" por pasos y navega al análisis completo con los datos mock de 2026/7008.

**Pendiente inmediato**: mergear `feat/upload-pdf` a `main` cuando Jaime lo valide, y seguir con el resto del backlog corto plazo (ajustar mocks del 2026/7008, comparativa entre pliegos, histograma por organismo).

**Aviso registrado**: URL de Vercel es pública por defecto. Para la fase actual (datos mock) no hay problema. Cuando se conecte a pliegos reales, activar Vercel Password Protection o SSO.

---

## 5. Stack técnico

```
Vite 5           bundler y dev server
React 18         UI
Tailwind CSS 3   styling utility-first
lucide-react     iconografía outline
Google Fonts     Space Grotesk + Inter + JetBrains Mono
```

**No hay backend**. Todo son datos mock en constantes al inicio de `src/App.jsx`. Cuando llegue el momento funcional, la extracción irá contra la Anthropic API (Claude Sonnet 4.6 para extracción, Haiku 4.5 para validación) o Azure OpenAI si TCCT ya tiene contrato.

---

## 6. Diseño y branding

**Paleta** (única, sin acentos secundarios):
```
--tt-blue          #0066FF   Protagonista, CTAs, badges principales
--tt-blue-dark     #0044CC   Hover / active
--tt-blue-light    #F0F5FF   Fondos suaves de acento
--tt-navy          #001B4B   Texto principal, avatares
--tt-gray          #5B6478   Texto secundario, iconos inactivos
--tt-border        #E5E9F0   Bordes de tarjetas y tablas
--tt-surface       #F5F7FA   Fondos de sidebar y áreas neutras
```

Estados: verde #00A67C (analizado), naranja #F5A623 (revisión), rojo #E24B4A (error), azul TT con pulse (procesando).

**Tipografía**:
- **Space Grotesk** (500 principalmente) — display, títulos, KPIs, números de categorías. Geométrica, moderna, cercana al feel de Movistar Text sin infringirla.
- **Inter** (400/500) — body y microcopy.
- **JetBrains Mono** (500) — nº expediente, códigos CPV, códigos de perfiles STS, importes. **Signature element del producto**.

**Elementos distintivos**:
1. **Nº expediente en mono azul TT** omnipresente — trata el pliego oficial como un objeto de datos estructurados.
2. **Ribbon de metadatos** debajo del título del análisis (importe, lotes, duración, cierre) — mimetiza cabecera de documento oficial.
3. **Índice de confianza** (`● 98%`) junto a cada dato extraído — transmite transparencia sobre el LLM y da al usuario señal de qué campos revisar manualmente.
4. **Botón "Generar borrador RFP"** en toolbar del análisis — puente visible al siguiente caso de uso, aunque no hace nada aún.

---

## 7. Estructura de datos mock

**Dashboard**: 6 expedientes en `MOCK_PLIEGOS`:
1. `2026/7008` — GISS · Soporte Técnico de Sistemas (18.5M€, 3 lotes) — **el real que Jaime trabaja**
2. `2026/4521` — AGE Interior · Modernización EDR/XDR (4.5M€, 1 lote)
3. `2026/2145` — Min. Justicia · Renovación Fortinet (3.1M€, 1 lote)
4. `2026/5210` — Ajuntament Barcelona · Ciberseguridad municipal (6.2M€, 1 lote)
5. `2026/3892` — INAP · Plataforma SOAR (2.8M€, 2 lotes)
6. `2026/6034` — Junta Andalucía · Auditoría ENS Alto (1.8M€, 1 lote)

**Análisis detallado**: solo el 2026/7008 tiene datos ricos en `MOCK_ANALYSIS`; los demás caen a él como fallback (intencional para demo). Estructura del análisis:

```
resumen        objeto, CPV, procedimiento, duración, prórrogas
lotes          3 lotes (Producción/Sistemas/Comunicaciones) con importe + CPV + confianza
perfiles       5 categorías STS (TSSX/TSSA/TSSB/TSSC/TMSA), 40 recursos totales
solvencia      técnica (experiencia, volumen 20M€, ISO 27001/20000/9001, ENS Alto) + económica (RC 3M€, capital 5M€)
criterios      5 criterios con pesos (40% precio + 25% metodología + 20% equipo + 10% transición + 5% mejoras)
penalizaciones retraso hito, incumplimiento SLA, confidencialidad
plazos         cierre 15/07/2026, hitos del contrato (kickoff, fin transición, revisión SLA, plantillas críticas)
marco          ENS Alto, CCN-STIC 803/804/810/811, RGPD, LOPDGDD, RD 311/2022
```

---

## 8. Estructura del proyecto

```
tcct-pliegos/
├── index.html                  Carga Google Fonts en <head>
├── package.json                deps: react 18, lucide-react, tailwind 3, vite 5
├── vite.config.js              plugin-react
├── tailwind.config.js          extend con paleta tt-*
├── postcss.config.js           tailwind + autoprefixer
├── .gitignore
├── README.md                   instrucciones de despliegue
└── src/
    ├── main.jsx                entry ReactDOM
    ├── index.css               @tailwind directives + @keyframes pulse
    └── App.jsx                 TODO el componente en un solo archivo (~1000 líneas)
```

**`src/App.jsx`** contiene:
- Constantes `MOCK_PLIEGOS` y `MOCK_ANALYSIS` al inicio (aquí se edita todo lo que quieras cambiar de datos).
- Helpers `formatEuro`, `formatEuroFull`, `StatusBadge`, `ConfidenceBadge`.
- Subcomponentes: `Sidebar`, `KpiCard`, `Dashboard`, `SectionCard`, `SectionTitle`, `Analysis`, `UploadModal`.
- Constante `SECTIONS` con el índice del análisis (7 secciones).
- Constante `UPLOAD_STEPS` con los mensajes de la simulación de progreso del `UploadModal`.
- Componente raíz `App` con `useState` para navegación `view` ('dashboard' | 'analysis') y `selectedPliego`, más `showUploadModal` para el modal de nuevo análisis.

**No usa**: routing library (solo state), backend, base de datos, autenticación, localStorage/sessionStorage.

---

## 9. Cómo desarrollar y desplegar

**Local**:
```bash
npm install
npm run dev        # → http://localhost:5173
```

**Deploy Vercel**:
1. Push a un repo de GitHub (`tcct-pliegos`, público o privado).
2. vercel.com → Add New → Project → import repo → Deploy.
3. URL pública en 90s tipo `tcct-pliegos-xxx.vercel.app`.
4. Cada `git push` a `main` = redeploy automático.

---

## 10. Backlog identificado

**Corto plazo (iteración de mockup)**:
- [x] Modal de upload con drag & drop del PDF — implementado en rama `feat/upload-pdf`. Valida que sea PDF, simula progreso de extracción por pasos y al terminar abre el análisis completo de 2026/7008 (no procesa el PDF real, sigue siendo mock).
- [ ] Ajustar los mock del 2026/7008 con datos más cercanos a los reales de Jaime.
- [ ] Vista de comparativa entre dos pliegos.
- [ ] Histograma de importes por organismo en dashboard.

**Medio plazo (versión funcional)**:
- [ ] Conectar a Claude API (Sonnet 4.6 extracción + Haiku 4.5 validación) o Azure OpenAI.
- [ ] Backend mínimo (Vercel Functions o Cloudflare Workers) para no exponer la API key.
- [ ] Exportación real a Excel (SheetJS/xlsx).
- [ ] Persistencia de análisis (Postgres/Supabase o similar).

**Largo plazo (institucionalización)**:
- [ ] SSO Telefónica.
- [ ] Subdominio corporativo TCCT.
- [ ] Integración con Salesforce (auto-abrir análisis al recibir el pliego en un caso).
- [ ] Integración con Outlook / Power Automate (trigger cuando llega correo del organismo).
- [ ] Botón "Generar borrador RFP" funcional (caso de uso #3 del backlog original).

---

## 11. Contexto adicional del Presales Journey

Los 5 bloques del flujo TCCT y los cuellos de botella identificados (por si el próximo chat va sobre otro caso de uso):

1. **Dispatching** — bandeja triaje, análisis de la necesidad, evaluación cargabilidad, asignación ingeniero. Cuellos: triaje manual, comunicación OB atascada. Herramientas: Outlook, Consola Triaje.
2. **Diseño Solución** — requerimientos, Tech Solution Book/SAGA, arquitectura, cotización proveedores. Cuellos: búsqueda manual en repositorios, redacción RFP a proveedor.
3. **Construcción Business Case** — cotización manual + SHERPA, Comité de Ofertas, recotización. Cuellos: llenar SHERPA (no automatizable con LLM), evaluar si va a CdO.
4. **Presentación Oferta** — OTE, preciarios, DEUC, casos éxito, certificaciones, CVs, defensa con cliente. Cuellos: documentación repetitiva.
5. **Post Venta** — correlación caso-oferta, kickoff tramitación, resolución escalados.

**Casos especiales**: Big Deals (flujo extendido con equipo, kick-off, plantillas y modelos de gobierno), Ofertas multitorre, Filiales (ACENS/AS/TGT → GV/AC).

**Ranking de próximos casos de uso** (después del lector de pliegos):
1. Generador de borradores de RFP sección 2.1 (workstream actual de Jaime).
2. RAG sobre Tech Solution Book + SAGA + ofertas históricas.
3. Selector automático de casos éxito + CVs por sector/tecnología del cliente.

---

## 12. Convenciones y preferencias de Jaime

- **Comunicación**: informal/coloquial en chat (español, abreviaciones, algún emoji), pero espera outputs profesionales (documentos, código, Excel).
- **Iteración**: incremental, paso a paso. Prefiere implementar él mismo con guía que recibir soluciones cerradas.
- **Excel**: locale español (`BUSCARX`, `EXTRAE`, `SI.CONJUNTO`, Power Query). Versionado explícito (`_vX.xlsx`).
- **Escalación**: soft first contact, autoridad del manager como fallback.
- **Framing licitaciones**: distingue *nueva necesidad / renovación / ampliación* — cambia el tono del documento.
- **Introducciones RFP**: estructura de tres párrafos (contexto/objeto → alcance técnico → continuidad/soporte del proveedor).

---

## 13. Filosofía de trabajo acordada en el proyecto

1. Vender internamente la UX antes de invertir en la parte funcional.
2. Feedback temprano de JC prima sobre perfección técnica.
3. Iteración rápida: cambio en `App.jsx` → `git push` → Vercel redespliega solo.
4. Cuando se hable con managers, el mockup manda. Cuando se implemente, el JSON schema manda.
5. Cada caso de uso resuelto abre el siguiente (RFP generator, RAG Tech Solution Book, selector casos éxito).

---

*Última actualización: 06/07/2026 · Fase actual: mockup desplegado en Vercel, modal de upload con drag & drop implementado en rama `feat/upload-pdf`, pendiente merge a `main` y siguiente ítem del backlog corto plazo.*
