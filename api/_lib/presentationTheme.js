// Paleta y tipografía para la EXPORTACIÓN A POWERPOINT.
//
// IMPORTANTE: esto es deliberadamente independiente de `src/theme.js`. `theme.js` es
// la paleta oscura "Claude Design" del PRODUCTO (sidebar #111827, azul #2563EB), aún
// pendiente de validar con JC. La presentación, en cambio, es material que sale de cara
// al cliente/comité, así que sigue la identidad "Telefónica Tech corporativo" (azul
// #0066FF, navy #001B4B) — la decisión de marca más sólida documentada en CLAUDE.md §3.
//
// Los colores de pptxgenjs van en hex SIN "#".
export const PPT = {
  // Marca corporativa TT
  blue: '0066FF', // protagonista: portada, títulos de sección, acentos
  blueDark: '0044CC', // barras/hover
  navy: '001B4B', // texto principal, fondos oscuros de portada
  gray: '5B6478', // texto secundario, etiquetas
  border: 'E5E9F0', // líneas de tabla, separadores
  surface: 'F5F7FA', // fondos suaves, filas alternas de tabla
  white: 'FFFFFF',

  // Estados (para chips de confianza y avisos)
  success: '00A67C',
  warning: 'F5A623',
  error: 'E24B4A',
};

// Fuentes: Space Grotesk / Inter / JetBrains Mono son Google Fonts y NO están
// garantizadas en el PowerPoint del receptor. Usamos fuentes seguras de Office para
// que el .pptx se vea igual se abra donde se abra.
export const FONT = {
  display: 'Arial', // títulos (sustituto de Space Grotesk)
  body: 'Calibri', // cuerpo y microcopy (sustituto de Inter)
  mono: 'Consolas', // nº expediente, CPV, importes (sustituto de JetBrains Mono)
};

// Dimensiones de diapositiva 16:9 (pulgadas), la referencia de layout para el builder.
export const LAYOUT = {
  w: 13.333,
  h: 7.5,
  margin: 0.6,
};
