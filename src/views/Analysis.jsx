import { theme } from '../theme.js';
import { useState } from 'react';
import {
  ArrowLeft, Download, Wand2, Package, Users, Shield, Scale, AlertTriangle,
  Calendar, FileText, Building2, FileSearch,
} from 'lucide-react';
import {
  isBlankNumber, formatNumber, formatEuroFull, blankNumberToNull, normalizeAnalysisNumbers,
  listToText, textToList, linesToText, textToLines, getLotesSumMismatch,
} from '../logic.js';
import {
  ConfidenceBadge, SectionCard, SectionTitle, EditButton, SaveCancelButtons,
} from '../components/section.jsx';
import {
  TextField, NumberField, TextAreaField, SelectField, FieldLabel,
} from '../components/fields.jsx';

const SECTIONS = [
  { id: 'resumen', label: 'Resumen ejecutivo', icon: FileText },
  { id: 'lotes', label: 'Lotes', icon: Package },
  { id: 'perfiles', label: 'Perfiles requeridos', icon: Users },
  { id: 'solvencia', label: 'Solvencia', icon: Shield },
  { id: 'criterios', label: 'Criterios de adjudicación', icon: Scale },
  { id: 'penalizaciones', label: 'Penalizaciones', icon: AlertTriangle },
  { id: 'plazos', label: 'Plazos e hitos', icon: Calendar },
];

const Toolbar = ({ onBack }) => (
  <div className="flex items-center justify-between px-8 py-4 border-b" style={{ borderColor: theme.border, background: theme.card }}>
    <button onClick={onBack} className="flex items-center gap-1.5 text-[13px]" style={{ color: theme.textMuted }}
      onMouseEnter={e => e.currentTarget.style.color = theme.text}
      onMouseLeave={e => e.currentTarget.style.color = theme.textMuted}>
      <ArrowLeft size={14} strokeWidth={1.8} />
      Dashboard
    </button>
    <div className="flex items-center gap-2">
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px]" style={{ borderColor: theme.border, color: theme.text }}>
        <Wand2 size={12} strokeWidth={1.8} />
        Generar borrador RFP
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px]" style={{ background: theme.text, color: theme.card }}>
        <Download size={12} strokeWidth={2} />
        Exportar a Excel
      </button>
    </div>
  </div>
);

const HeaderMeta = ({ pliego }) => (
  <>
    <div className="flex items-center gap-2 mb-3">
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 500, color: theme.link, letterSpacing: '0.02em' }}>
        EXP {pliego.expediente}
      </div>
      <div className="text-[11px]" style={{ color: theme.textMuted }}>·</div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>{pliego.procedimiento}</div>
      <div className="text-[11px]" style={{ color: theme.textMuted }}>·</div>
      <div className="flex items-center gap-1 text-[11px]" style={{ color: theme.textMuted }}>
        <Shield size={10} strokeWidth={2} /> ENS {pliego.ens}
      </div>
    </div>

    <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '36px', color: theme.text, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
      {pliego.titulo}
    </h1>

    <div className="flex items-center gap-2 mt-3 text-[14px]" style={{ color: theme.textMuted }}>
      <Building2 size={14} strokeWidth={1.8} />
      {pliego.organismo}
    </div>
  </>
);

const Ribbon = ({ items }) => (
  <div className="grid grid-cols-4 gap-0 mt-6 rounded-lg border overflow-hidden" style={{ borderColor: theme.border, background: theme.card }}>
    {items.map((item, idx) => (
      <div key={idx} className="p-4" style={{ borderLeft: idx > 0 ? `1px solid ${theme.border}` : 'none' }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>{item.label}</div>
        <div style={{
          fontFamily: item.mono ? '"JetBrains Mono", monospace' : '"Space Grotesk", sans-serif',
          fontWeight: 500,
          fontSize: '16px',
          color: item.highlight ? theme.link : theme.text,
          letterSpacing: '-0.01em',
        }}>
          {item.value}
        </div>
      </div>
    ))}
  </div>
);

// Pliego sin análisis propio: no inventamos datos de otro expediente, mostramos un
// estado vacío claro. La cabecera e importe/lotes sí son reales (vienen del pliego).
const AnalysisEmptyState = ({ pliego, onBack }) => (
  <div className="max-w-[1200px]">
    <Toolbar onBack={onBack} />
    <div className="px-8 pt-8 pb-6">
      <HeaderMeta pliego={pliego} />
      <Ribbon items={[
        { label: 'Importe total', value: formatEuroFull(pliego.importe), mono: true },
        { label: 'Lotes', value: String(pliego.lotes) },
        { label: 'Duración', value: '—' },
        { label: 'Cierre de ofertas', value: '—', highlight: true },
      ]} />
    </div>
    <div className="px-8 pb-12">
      <div className="rounded-lg border p-12 flex flex-col items-center text-center" style={{ borderColor: theme.border, background: theme.card }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: theme.accentLight }}>
          <FileSearch size={24} color={theme.link} strokeWidth={1.8} />
        </div>
        <div className="text-[15px] mb-1.5" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: theme.text }}>
          Este pliego aún no se ha analizado en detalle
        </div>
        <div className="text-[13px]" style={{ color: theme.textMuted, maxWidth: '440px' }}>
          Sube el PDF del expediente desde «Nuevo análisis» para extraer lotes, perfiles, criterios de adjudicación y plazos de forma automática.
        </div>
      </div>
    </div>
  </div>
);

export const Analysis = ({ pliego, onBack, onUpdateAnalysis, onUpdatePliego }) => {
  const [section, setSection] = useState('resumen');
  const [editingSection, setEditingSection] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pliegoImporteDraft, setPliegoImporteDraft] = useState(null); // solo relevante editando 'lotes'
  const [draftInitial, setDraftInitial] = useState(null); // snapshot JSON del draft (+ importe total) al empezar a editar
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const data = pliego.analysisData;

  const buildDraft = (sectionId) => {
    if (sectionId === 'resumen') {
      return { ...structuredClone(data.resumen), ccnStic: [...data.marco.ccnStic], normativa: [...data.marco.normativa] };
    }
    return structuredClone(data[sectionId]);
  };

  const hasUnsavedChanges = () =>
    editingSection !== null && draftInitial !== null &&
    JSON.stringify({ draft, pliegoImporteDraft }) !== draftInitial;

  const confirmDiscardIfNeeded = () => {
    if (!hasUnsavedChanges()) return true;
    return window.confirm('Tienes cambios sin guardar en la sección que estás editando. Se perderán si continúas. ¿Descartar los cambios?');
  };

  const startEdit = (sectionId) => {
    if (editingSection && editingSection !== sectionId && !confirmDiscardIfNeeded()) return;
    const d = buildDraft(sectionId);
    const importeDraft = sectionId === 'lotes' ? pliego.importe : null;
    setDraft(d);
    setPliegoImporteDraft(importeDraft);
    setDraftInitial(JSON.stringify({ draft: d, pliegoImporteDraft: importeDraft }));
    setEditingSection(sectionId);
  };

  const resetEditState = () => {
    setEditingSection(null);
    setDraft(null);
    setPliegoImporteDraft(null);
    setDraftInitial(null);
  };

  const cancelEdit = () => {
    setSaveError(null);
    resetEditState();
  };

  const goToSection = (sectionId) => {
    if (sectionId === section) return;
    if (!confirmDiscardIfNeeded()) return;
    if (editingSection) cancelEdit();
    setSection(sectionId);
  };

  const handleBack = () => {
    if (!confirmDiscardIfNeeded()) return;
    onBack();
  };

  const collectEmptyNumbers = () => {
    const empty = [];
    if (editingSection === 'lotes') {
      if (isBlankNumber(pliegoImporteDraft)) empty.push('Importe total del pliego');
      draft.forEach((lote, i) => { if (isBlankNumber(lote.importe)) empty.push(`Lote ${i + 1} · importe`); });
    } else if (editingSection === 'perfiles') {
      draft.forEach((p, i) => {
        const label = p.categoria || `Perfil ${i + 1}`;
        if (isBlankNumber(p.headcount)) empty.push(`${label} · nº recursos`);
        if (isBlankNumber(p.experiencia)) empty.push(`${label} · experiencia`);
      });
    } else if (editingSection === 'solvencia') {
      if (isBlankNumber(draft.tecnica?.volumenNegocio)) empty.push('Volumen de negocio');
      if (isBlankNumber(draft.economica?.seguroRC)) empty.push('Seguro RC');
      if (isBlankNumber(draft.economica?.capitalMinimo)) empty.push('Capital mínimo');
    } else if (editingSection === 'criterios') {
      draft.forEach((crit, i) => { if (isBlankNumber(crit.peso)) empty.push(`${crit.criterio || `Criterio ${i + 1}`} · peso`); });
    }
    return empty;
  };

  const saveEdit = async () => {
    if (saving) return;
    const emptyNumbers = collectEmptyNumbers();
    if (emptyNumbers.length > 0) {
      const ok = window.confirm(
        `Hay campos numéricos vacíos que se guardarán sin valor:\n\n· ${emptyNumbers.join('\n· ')}\n\n¿Guardar de todas formas?`
      );
      if (!ok) return;
    }
    let updated;
    if (editingSection === 'resumen') {
      const { ccnStic, normativa, ...resumen } = draft;
      updated = { ...data, resumen, marco: { ...data.marco, ccnStic, normativa } };
    } else if (editingSection === 'lotes' || editingSection === 'perfiles') {
      updated = { ...data, [editingSection]: draft.map(row => ({ ...row, confianza: 100 })) };
    } else {
      updated = { ...data, [editingSection]: draft };
    }
    // NumberField deja los campos numéricos vacíos como ''; la API espera número o
    // null. Normalizamos antes de persistir para que "sin valor" se guarde de verdad.
    updated = normalizeAnalysisNumbers(updated);
    // Esperamos a que la persistencia termine antes de salir del modo edición. Si falla,
    // mantenemos el borrador y mostramos el error, en vez de resetear a datos obsoletos
    // (que daría al usuario una falsa sensación de guardado y pérdida silenciosa).
    setSaving(true);
    setSaveError(null);
    try {
      if (editingSection === 'lotes') {
        // Editar "Lotes" toca dos columnas de la misma fila: el `importe` de cabecera
        // y `analysisData` (con los lotes). Las persistimos en un ÚNICO PATCH para que
        // sea atómico —o se guardan ambas o ninguna— y con una sola invalidación de la
        // lista, evitando que la BD/UI queden con importe y lotes descuadrados si una
        // de dos peticiones separadas fallara.
        await onUpdatePliego(pliego.id, {
          importe: blankNumberToNull(pliegoImporteDraft),
          analysisData: updated,
        });
      } else {
        await onUpdateAnalysis(pliego.id, updated);
      }
      resetEditState();
    } catch (err) {
      setSaveError(err?.message || 'No se han podido guardar los cambios. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const updateDraftRow = (idx, field, value) => {
    setDraft(prev => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  if (!data) {
    return <AnalysisEmptyState pliego={pliego} onBack={onBack} />;
  }

  return (
    <div className="max-w-[1200px]">
      <Toolbar onBack={handleBack} />

      {/* Header con nº expediente */}
      <div className="px-8 pt-8 pb-6">
        <HeaderMeta pliego={pliego} />
        <Ribbon items={[
          { label: 'Importe total', value: formatEuroFull(pliego.importe), mono: true },
          { label: 'Lotes', value: pliego.lotes.toString() },
          { label: 'Duración', value: `${data.resumen.duracion} + ${data.resumen.prorrogas}` },
          { label: 'Cierre de ofertas', value: data.plazos.limite, highlight: true },
        ]} />
      </div>

      {/* Índice + Contenido */}
      <div className="px-8 pb-12 grid gap-6" style={{ gridTemplateColumns: '200px 1fr' }}>
        {/* Índice */}
        <nav className="sticky top-4 h-fit">
          <div className="text-[10px] uppercase tracking-wider mb-3 px-3" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>Índice</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => goToSection(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left rounded-md transition mb-0.5"
              style={{
                color: section === s.id ? theme.link : theme.textMuted,
                background: section === s.id ? theme.accentLight : 'transparent',
                fontWeight: section === s.id ? 500 : 400,
                borderLeft: section === s.id ? `2px solid ${theme.link}` : '2px solid transparent',
                paddingLeft: '10px',
              }}
              onMouseEnter={e => { if (section !== s.id) e.currentTarget.style.color = theme.text; }}
              onMouseLeave={e => { if (section !== s.id) e.currentTarget.style.color = theme.textMuted; }}
            >
              <s.icon size={13} strokeWidth={section === s.id ? 2 : 1.8} />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Contenido */}
        <div className="min-w-0">
          {saveError && editingSection && (
            <div className="flex items-start gap-3 p-3 mb-4 rounded-md border" style={{ borderColor: theme.errorBorder, background: theme.errorBg }}>
              <AlertTriangle size={16} color={theme.errorText} strokeWidth={1.8} className="shrink-0 mt-0.5" />
              <div className="text-[12.5px]" style={{ color: theme.errorText }}>
                No se han guardado los cambios: {saveError} Tus cambios siguen en el formulario; vuelve a intentarlo.
              </div>
            </div>
          )}
          {section === 'resumen' && (
            <SectionCard>
              <SectionTitle
                icon={FileText}
                title="Resumen ejecutivo"
                actions={editingSection === 'resumen'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('resumen')} />}
              />
              {editingSection === 'resumen' ? (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Objeto</FieldLabel>
                    <TextAreaField value={draft.objeto} onChange={v => setDraft({ ...draft, objeto: v })} rows={4} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Procedimiento</FieldLabel>
                      <TextField value={draft.procedimiento} onChange={v => setDraft({ ...draft, procedimiento: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Duración</FieldLabel>
                        <TextField value={draft.duracion} onChange={v => setDraft({ ...draft, duracion: v })} />
                      </div>
                      <div>
                        <FieldLabel>Prórrogas</FieldLabel>
                        <TextField value={draft.prorrogas} onChange={v => setDraft({ ...draft, prorrogas: v })} />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <FieldLabel>Códigos CPV (separados por coma)</FieldLabel>
                      <TextField mono value={listToText(draft.cpv)} onChange={v => setDraft({ ...draft, cpv: textToList(v) })} />
                    </div>
                    <div>
                      <FieldLabel>CCN-STIC (separados por coma)</FieldLabel>
                      <TextField value={listToText(draft.ccnStic)} onChange={v => setDraft({ ...draft, ccnStic: textToList(v) })} />
                    </div>
                    <div>
                      <FieldLabel>Otra normativa (separados por coma)</FieldLabel>
                      <TextField value={listToText(draft.normativa)} onChange={v => setDraft({ ...draft, normativa: textToList(v) })} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[14px] mb-6" style={{ color: theme.text, lineHeight: 1.6 }}>
                    {data.resumen.objeto}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>Procedimiento</div>
                      <div className="text-[13px]" style={{ color: theme.text }}>{data.resumen.procedimiento}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>Duración</div>
                      <div className="text-[13px]" style={{ color: theme.text }}>{data.resumen.duracion} + {data.resumen.prorrogas}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>Códigos CPV</div>
                      <div className="flex gap-2 flex-wrap">
                        {data.resumen.cpv.map(cpv => (
                          <span key={cpv} className="px-2 py-0.5 rounded text-[11px]" style={{ background: theme.accentLight, color: theme.linkDark, fontFamily: '"JetBrains Mono", monospace' }}>
                            {cpv}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted, letterSpacing: '0.08em' }}>Marco normativo</div>
                      <div className="flex gap-2 flex-wrap">
                        {[...data.marco.ccnStic, ...data.marco.normativa].map(n => (
                          <span key={n} className="px-2 py-0.5 rounded text-[11px]" style={{ background: theme.muted, color: theme.text }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {section === 'lotes' && (
            <SectionCard>
              <SectionTitle
                icon={Package}
                title="Lotes"
                subtitle={`${data.lotes.length} lotes por un importe agregado de ${formatEuroFull(data.lotes.reduce((a, l) => a + (Number(l.importe) || 0), 0))}`}
                actions={editingSection === 'lotes'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('lotes')} />}
              />
              {(() => {
                const pliegoParaComparar = editingSection === 'lotes' ? { importe: pliegoImporteDraft } : pliego;
                const mismatch = getLotesSumMismatch(pliegoParaComparar, { lotes: editingSection === 'lotes' ? draft : data.lotes });
                if (!mismatch) return null;
                return (
                  <div className="flex items-start gap-3 p-3 mb-4 rounded-md border" style={{ borderColor: theme.errorBorder, background: theme.errorBg }}>
                    <AlertTriangle size={16} color={theme.errorText} strokeWidth={1.8} className="shrink-0 mt-0.5" />
                    <div className="text-[12.5px]" style={{ color: theme.errorText }}>
                      La suma de los lotes ({formatEuroFull(mismatch.lotesSum)}) no coincide con el importe total del pliego ({formatEuroFull(mismatch.pliegoImporte)}).
                      Diferencia: {formatEuroFull(Math.abs(mismatch.diff))} {mismatch.diff > 0 ? 'de más' : 'de menos'}.
                    </div>
                  </div>
                );
              })()}
              {editingSection === 'lotes' && (
                <div className="mb-4 max-w-[220px]">
                  <FieldLabel>Importe total del pliego</FieldLabel>
                  <NumberField value={pliegoImporteDraft} onChange={setPliegoImporteDraft} />
                </div>
              )}
              <div className="space-y-2">
                {(editingSection === 'lotes' ? draft : data.lotes).map((lote, idx) => (
                  <div key={lote.numero} className="flex items-start gap-4 p-4 rounded-md border" style={{ borderColor: theme.border }}>
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: theme.accentLight }}>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '15px', color: theme.link }}>{lote.numero}</span>
                    </div>
                    {editingSection === 'lotes' ? (
                      <>
                        <div className="flex-1 min-w-0 space-y-2">
                          <TextField value={lote.descripcion} onChange={v => updateDraftRow(idx, 'descripcion', v)} />
                          <TextField mono value={lote.cpv} onChange={v => updateDraftRow(idx, 'cpv', v)} className="max-w-[180px]" />
                        </div>
                        <NumberField value={lote.importe} onChange={v => updateDraftRow(idx, 'importe', v)} className="max-w-[160px]" />
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px]" style={{ color: theme.text, fontWeight: 500 }}>{lote.descripcion}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px]" style={{ color: theme.textMuted, fontFamily: '"JetBrains Mono", monospace' }}>CPV {lote.cpv}</span>
                            <ConfidenceBadge value={lote.confianza} />
                          </div>
                        </div>
                        <div className="text-right">
                          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '15px', fontWeight: 500, color: theme.text }}>
                            {formatEuroFull(lote.importe)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'perfiles' && (
            <SectionCard>
              <SectionTitle
                icon={Users}
                title="Perfiles requeridos (STS)"
                subtitle={`${data.perfiles.reduce((a, p) => a + (Number(p.headcount) || 0), 0)} recursos totales distribuidos en ${data.perfiles.length} categorías`}
                actions={editingSection === 'perfiles'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('perfiles')} />}
              />
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, fontWeight: 500 }}>Código</th>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, fontWeight: 500 }}>Categoría</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, fontWeight: 500 }}>HC</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, fontWeight: 500 }}>Exp.</th>
                    <th className="text-left pb-2.5 text-[10px] uppercase tracking-wider pl-4" style={{ color: theme.textMuted, fontWeight: 500 }}>Certificaciones</th>
                    <th className="text-right pb-2.5 text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, fontWeight: 500 }}>Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {(editingSection === 'perfiles' ? draft : data.perfiles).map((p, idx) => (
                    <tr key={p.codigo} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                      <td className="py-3">
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontWeight: 500, color: theme.link }}>{p.codigo}</span>
                      </td>
                      {editingSection === 'perfiles' ? (
                        <>
                          <td className="py-2 pr-2"><TextField value={p.categoria} onChange={v => updateDraftRow(idx, 'categoria', v)} /></td>
                          <td className="py-2 px-2"><NumberField value={p.headcount} onChange={v => updateDraftRow(idx, 'headcount', v)} /></td>
                          <td className="py-2 px-2"><NumberField value={p.experiencia} onChange={v => updateDraftRow(idx, 'experiencia', v)} /></td>
                          <td className="py-2 pl-4"><TextField value={listToText(p.certs)} onChange={v => updateDraftRow(idx, 'certs', textToList(v))} /></td>
                          <td className="py-3 text-right"><ConfidenceBadge value={100} /></td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 text-[12.5px]" style={{ color: theme.text }}>{p.categoria}</td>
                          <td className="py-3 text-right text-[13px]" style={{ color: theme.text, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatNumber(p.headcount)}</td>
                          <td className="py-3 text-right text-[12px]" style={{ color: theme.textMuted }}>{isBlankNumber(p.experiencia) ? '—' : `${p.experiencia}a`}</td>
                          <td className="py-3 pl-4">
                            <div className="flex gap-1 flex-wrap">
                              {p.certs.length > 0 ? p.certs.map(cert => (
                                <span key={cert} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: theme.muted, color: theme.textMuted }}>{cert}</span>
                              )) : <span className="text-[11px]" style={{ color: theme.textMuted }}>—</span>}
                            </div>
                          </td>
                          <td className="py-3 text-right"><ConfidenceBadge value={p.confianza} /></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          )}

          {section === 'solvencia' && (
            <SectionCard>
              <SectionTitle
                icon={Shield}
                title="Requisitos de solvencia"
                actions={editingSection === 'solvencia'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('solvencia')} />}
              />
              {editingSection === 'solvencia' ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: theme.link, letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia técnica</div>
                    <div>
                      <FieldLabel>Experiencia mínima</FieldLabel>
                      <TextField value={draft.tecnica.experienciaMinima} onChange={v => setDraft({ ...draft, tecnica: { ...draft.tecnica, experienciaMinima: v } })} />
                    </div>
                    <div>
                      <FieldLabel>Volumen negocio anual</FieldLabel>
                      <NumberField value={draft.tecnica.volumenNegocio} onChange={v => setDraft({ ...draft, tecnica: { ...draft.tecnica, volumenNegocio: v } })} />
                    </div>
                    <div>
                      <FieldLabel>Clasificación</FieldLabel>
                      <TextField mono value={draft.tecnica.clasificacion} onChange={v => setDraft({ ...draft, tecnica: { ...draft.tecnica, clasificacion: v } })} />
                    </div>
                    <div>
                      <FieldLabel>Certificaciones (separadas por coma)</FieldLabel>
                      <TextField value={listToText(draft.tecnica.certificaciones)} onChange={v => setDraft({ ...draft, tecnica: { ...draft.tecnica, certificaciones: textToList(v) } })} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: theme.link, letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia económica</div>
                    <div>
                      <FieldLabel>Seguro RC mínimo</FieldLabel>
                      <NumberField value={draft.economica.seguroRC} onChange={v => setDraft({ ...draft, economica: { ...draft.economica, seguroRC: v } })} />
                    </div>
                    <div>
                      <FieldLabel>Capital social mínimo</FieldLabel>
                      <NumberField value={draft.economica.capitalMinimo} onChange={v => setDraft({ ...draft, economica: { ...draft.economica, capitalMinimo: v } })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: theme.link, letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia técnica</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>Experiencia mínima</div>
                        <div className="text-[13px]" style={{ color: theme.text }}>{data.solvencia.tecnica.experienciaMinima}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>Volumen negocio anual</div>
                        <div className="text-[14px]" style={{ color: theme.text, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.tecnica.volumenNegocio)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>Clasificación</div>
                        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: theme.text }}>{data.solvencia.tecnica.clasificacion}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: theme.textMuted }}>Certificaciones</div>
                        <div className="flex gap-1.5 flex-wrap">
                          {data.solvencia.tecnica.certificaciones.map(cert => (
                            <span key={cert} className="px-2 py-0.5 rounded text-[11px]" style={{ background: theme.accentLight, color: theme.linkDark }}>{cert}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: theme.link, letterSpacing: '0.08em', fontWeight: 500 }}>Solvencia económica</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>Seguro RC mínimo</div>
                        <div className="text-[14px]" style={{ color: theme.text, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.economica.seguroRC)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>Capital social mínimo</div>
                        <div className="text-[14px]" style={{ color: theme.text, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>{formatEuroFull(data.solvencia.economica.capitalMinimo)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {section === 'criterios' && (
            <SectionCard>
              <SectionTitle
                icon={Scale}
                title="Criterios de adjudicación"
                subtitle="Pesos porcentuales por criterio, distinguiendo evaluación automática (fórmula) y de juicio de valor"
                actions={editingSection === 'criterios'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('criterios')} />}
              />
              <div className="space-y-2">
                {(editingSection === 'criterios' ? draft : data.criterios).map((crit, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-md" style={{ background: theme.rowHover }}>
                    {editingSection === 'criterios' ? (
                      <>
                        <NumberField value={crit.peso} onChange={v => updateDraftRow(idx, 'peso', v)} className="max-w-[80px] shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <TextField value={crit.criterio} onChange={v => updateDraftRow(idx, 'criterio', v)} />
                          <SelectField
                            value={crit.tipo}
                            onChange={v => updateDraftRow(idx, 'tipo', v)}
                            className="max-w-[220px]"
                            options={[{ value: 'automatico', label: 'Evaluación automática' }, { value: 'juicio', label: 'Juicio de valor' }]}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-14 text-right" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '18px', fontWeight: 500, color: theme.link }}>
                          {isBlankNumber(crit.peso) ? '—' : <>{crit.peso}<span className="text-[12px]" style={{ color: theme.textMuted }}>%</span></>}
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px]" style={{ color: theme.text, fontWeight: 500 }}>{crit.criterio}</div>
                          <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: crit.tipo === 'automatico' ? theme.link : theme.textMuted, letterSpacing: '0.08em' }}>
                            {crit.tipo === 'automatico' ? 'Evaluación automática' : 'Juicio de valor'}
                          </div>
                        </div>
                        <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: theme.border }}>
                          <div className="h-full rounded-full" style={{ width: `${isBlankNumber(crit.peso) ? 0 : crit.peso}%`, background: crit.tipo === 'automatico' ? theme.link : theme.textMuted }} />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'penalizaciones' && (
            <SectionCard>
              <SectionTitle
                icon={AlertTriangle}
                title="Penalizaciones"
                subtitle="Cláusulas de penalización identificadas en el PCAP"
                actions={editingSection === 'penalizaciones'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('penalizaciones')} />}
              />
              <div className="space-y-3">
                {(editingSection === 'penalizaciones' ? draft : data.penalizaciones).map((p, idx) => (
                  <div key={idx} className="p-4 rounded-md border" style={{ borderColor: theme.border }}>
                    {editingSection === 'penalizaciones' ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <TextField value={p.tipo} onChange={v => updateDraftRow(idx, 'tipo', v)} />
                          <TextField value={p.importe} onChange={v => updateDraftRow(idx, 'importe', v)} />
                        </div>
                        <TextAreaField value={p.descripcion} onChange={v => updateDraftRow(idx, 'descripcion', v)} rows={2} />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <div className="text-[13px]" style={{ color: theme.text, fontWeight: 500 }}>{p.tipo}</div>
                          <div className="text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: theme.errorBg, color: theme.errorText }}>{p.importe}</div>
                        </div>
                        <div className="text-[12px]" style={{ color: theme.textMuted }}>{p.descripcion}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === 'plazos' && (
            <SectionCard>
              <SectionTitle
                icon={Calendar}
                title="Plazos e hitos"
                actions={editingSection === 'plazos'
                  ? <SaveCancelButtons onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                  : <EditButton onClick={() => startEdit('plazos')} />}
              />
              {editingSection === 'plazos' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Cierre de ofertas</FieldLabel>
                      <TextField value={draft.limite} onChange={v => setDraft({ ...draft, limite: v })} />
                    </div>
                    <div>
                      <FieldLabel>Apertura</FieldLabel>
                      <TextField value={draft.apertura} onChange={v => setDraft({ ...draft, apertura: v })} />
                    </div>
                    <div>
                      <FieldLabel>Formalización</FieldLabel>
                      <TextField value={draft.formalizacion} onChange={v => setDraft({ ...draft, formalizacion: v })} />
                    </div>
                    <div>
                      <FieldLabel>Inicio del servicio</FieldLabel>
                      <TextField value={draft.inicio} onChange={v => setDraft({ ...draft, inicio: v })} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Hitos del contrato (uno por línea)</FieldLabel>
                    <TextAreaField value={linesToText(draft.hitos)} onChange={v => setDraft({ ...draft, hitos: textToLines(v) })} rows={5} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { label: 'Cierre de ofertas', value: data.plazos.limite, highlight: true },
                      { label: 'Apertura', value: data.plazos.apertura },
                      { label: 'Formalización', value: data.plazos.formalizacion },
                      { label: 'Inicio del servicio', value: data.plazos.inicio },
                    ].map((item, idx) => (
                      <div key={idx} className="p-3 rounded-md" style={{ background: item.highlight ? theme.accentLight : theme.rowHover }}>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: theme.textMuted }}>{item.label}</div>
                        <div className="text-[13px]" style={{ color: item.highlight ? theme.link : theme.text, fontWeight: 500 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: theme.link, letterSpacing: '0.08em', fontWeight: 500 }}>Hitos del contrato</div>
                  <div className="space-y-2">
                    {data.plazos.hitos.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-[13px]" style={{ color: theme.text }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: theme.accentLight, color: theme.link, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500 }}>
                          {idx + 1}
                        </div>
                        {h}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
};
