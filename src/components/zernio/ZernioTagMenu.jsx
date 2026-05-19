/**
 * ZernioTagMenu — Dropdown con las etiquetas predefinidas para "Etiquetar como…".
 *
 * Set fijado en el skill `zernio-imperio`:
 *   - Estados especiales (clientes existentes): 5 cliente-*
 *   - Estados especiales (personales / filtros): familiar, amigo, scam, requiere-revision
 *
 * Total: 9 etiquetas. Click en una → aplica la etiqueta y cierra el menú.
 */

import { useEffect, useRef } from "react";

const TAGS = [
  { id: "cliente-hermandad",     label: "Cliente · Hermandad",     group: "Cliente existente" },
  { id: "cliente-metamorfosis",  label: "Cliente · Metamorfosis",  group: "Cliente existente" },
  { id: "cliente-mentalidad",    label: "Cliente · Mentalidad",    group: "Cliente existente" },
  { id: "cliente-smd",           label: "Cliente · SMD",           group: "Cliente existente" },
  { id: "cliente-audios",        label: "Cliente · Audios",        group: "Cliente existente" },
  { id: "familiar",              label: "Familiar",                group: "Personal" },
  { id: "amigo",                 label: "Amigo",                   group: "Personal" },
  { id: "scam",                  label: "Scam",                    group: "Filtro" },
  { id: "requiere-revision",     label: "Requiere revisión",       group: "Filtro" },
];

export default function ZernioTagMenu({ open, anchorRect, onPick, onClose }) {
  const ref = useRef(null);

  // Cerrar al hacer click fuera o pulsar Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Posicionamiento básico junto al botón que lo abrió
  const style = anchorRect
    ? {
        position: "fixed",
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
      }
    : {};

  // Agrupar por group
  const groups = TAGS.reduce((acc, tag) => {
    if (!acc[tag.group]) acc[tag.group] = [];
    acc[tag.group].push(tag);
    return acc;
  }, {});

  return (
    <div className="ztagmenu" ref={ref} style={style} role="menu">
      <div className="ztagmenu-hd">ETIQUETAR COMO</div>
      {Object.entries(groups).map(([group, tags]) => (
        <div key={group} className="ztagmenu-grp">
          <div className="ztagmenu-grp-lbl">{group}</div>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="ztagmenu-opt"
              onClick={() => {
                onPick?.(tag);
                onClose?.();
              }}
              role="menuitem"
            >
              {tag.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
