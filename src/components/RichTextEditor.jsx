/**
 * RichTextEditor — Editor visual ligero basado en contentEditable.
 *
 * Toolbar:
 *  · B (bold), I (italic)
 *  · H1, H2
 *  · ≡ (lista no ordenada)
 *  · ↶ (undo)
 *  · — (separador horizontal)
 *  · ⤢ (toggle expandir altura)
 *
 * Guarda HTML interno. Patrón "uncontrolled" — el componente gestiona
 * su propio DOM y solo emite onChange con el HTML actual; el setter
 * inicial solo lee el prop `initialHtml` una vez para no romper el
 * cursor en re-renders.
 *
 * Uso:
 *   <RichTextEditor
 *     initialHtml={c.cuerpo}
 *     onChange={(html) => setContenidoField("cuerpo", html)}
 *     placeholder="Escribe aquí…"
 *   />
 */

import { useRef, useEffect, useState } from "react";

export default function RichTextEditor({ initialHtml = "", onChange, placeholder = "" }) {
  const editorRef = useRef(null);
  const initializedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);

  // Inicializa el HTML una sola vez al montar (uncontrolled).
  useEffect(() => {
    if (!initializedRef.current && editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
      initializedRef.current = true;
    }
  }, [initialHtml]);

  function exec(command, value = null) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput(); // propagar cambio
  }

  function handleInput() {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  }

  // Pegado: limpiar formato del clipboard para evitar estilos pegados de Word/Notion
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  return (
    <div className={`rte ${expanded ? "rte-expanded" : ""}`}>
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title="Negrita (Cmd+B)">
          <b>B</b>
        </button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title="Cursiva (Cmd+I)">
          <i>I</i>
        </button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "<h1>"); }} title="Título grande">H1</button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "<h2>"); }} title="Título medio">H2</button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} title="Lista">≡</button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("undo"); }} title="Deshacer">↶</button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertHorizontalRule"); }} title="Separador">—</button>
        <button type="button" className="rte-btn rte-btn-expand"
                onMouseDown={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
                title={expanded ? "Reducir" : "Expandir"}>⤢</button>
      </div>
      <div
        ref={editorRef}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
      />
    </div>
  );
}
