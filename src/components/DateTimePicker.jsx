/**
 * DateTimePicker — Calendar + hora + minutos (paso 5) en HUD Soma OS.
 *
 * Reemplaza al <input type="datetime-local"> nativo del browser.
 * Markup y CSS portados 1:1 del handoff de Claude Design
 * (handoff-datepicker/).
 *
 * Características:
 *   · Semana empieza en lunes (notación española: L M X J V S D)
 *   · Mes en mayúsculas largo (MAYO 2026), días abreviados en footer (LUN)
 *   · Hora 24h, minutos solo cada 5 (00, 05, 10, ..., 55)
 *   · Botones Limpiar / Hoy / Confirmar
 *   · Auto-scroll a la hora y minuto seleccionados al abrir y tras "Hoy"
 *   · Esc o × cancela sin aplicar cambios
 *   · Teclado: flechas para navegar días, Enter confirma,
 *     PageUp/PageDown cambia mes, Home salta a hoy
 *
 * Props:
 *   open      — boolean, si está abierto
 *   value     — Date | null | ISO string. Valor inicial.
 *   onConfirm — (date | null) => void. Se llama al confirmar.
 *   onCancel  — () => void. Se llama al cerrar sin confirmar (Esc, ×).
 */

import { useEffect, useMemo, useRef, useState } from "react";

const MONTHS_LONG  = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
const MONTHS_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const WDAY_SHORT   = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];

const pad = (n) => String(n).padStart(2, "0");

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function snapMinutesTo5(min) {
  return Math.round(min / 5) * 5;
}

// Días en un mes dado (m: 0-11)
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

// Construye state inicial a partir de `value` (Date | null | string).
function buildInitialState(value) {
  const t = new Date();
  if (!value) {
    let mi = snapMinutesTo5(t.getMinutes());
    let h  = t.getHours();
    if (mi >= 60) { mi = 0; h = (h + 1) % 24; }
    return {
      y: t.getFullYear(), m: t.getMonth(), d: null, h, mi,
      viewY: t.getFullYear(), viewM: t.getMonth(),
      centerTrigger: 0,
    };
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    let mi = snapMinutesTo5(t.getMinutes());
    let h  = t.getHours();
    if (mi >= 60) { mi = 0; h = (h + 1) % 24; }
    return {
      y: t.getFullYear(), m: t.getMonth(), d: null, h, mi,
      viewY: t.getFullYear(), viewM: t.getMonth(),
      centerTrigger: 0,
    };
  }
  let mi = snapMinutesTo5(d.getMinutes());
  let h  = d.getHours();
  if (mi >= 60) { mi = 0; h = (h + 1) % 24; }
  return {
    y: d.getFullYear(),
    m: d.getMonth(),
    d: d.getDate(),
    h,
    mi,
    viewY: d.getFullYear(),
    viewM: d.getMonth(),
    centerTrigger: 0,
  };
}

export default function DateTimePicker({ open, value, onConfirm, onCancel }) {
  const [state, setState] = useState(() => buildInitialState(value));
  const hListRef = useRef(null);
  const mListRef = useRef(null);
  const dpickRef = useRef(null);

  // Resetear estado cada vez que se abra (o cambie el valor inicial)
  useEffect(() => {
    if (open) setState(buildInitialState(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll a la hora y minuto seleccionados.
  // Depende de: open + h + mi + centerTrigger (este último permite forzar
  // re-centrado desde "Hoy" aunque h/mi no cambien).
  useEffect(() => {
    if (!open) return;
    const tid = setTimeout(() => {
      [hListRef.current, mListRef.current].forEach((body) => {
        if (!body) return;
        const on = body.querySelector(".dp-item.on");
        if (on) body.scrollTop = on.offsetTop - body.clientHeight / 2 + on.offsetHeight / 2;
      });
    }, 30);
    return () => clearTimeout(tid);
  }, [open, state.h, state.mi, state.centerTrigger]);

  // ── Render del calendario ──
  const calendarDays = useMemo(() => {
    const days = [];
    const firstOfMonth = new Date(state.viewY, state.viewM, 1);
    let dow = firstOfMonth.getDay();
    dow = dow === 0 ? 6 : dow - 1; // Monday-first
    const dim   = daysInMonth(state.viewY, state.viewM);
    const dimP  = daysInMonth(state.viewY, state.viewM - 1);
    const today = new Date();

    for (let i = 0; i < 42; i++) {
      let dayNum, monthOffset;
      if (i < dow) {
        dayNum = dimP - (dow - i - 1); monthOffset = -1;
      } else if (i - dow + 1 > dim) {
        dayNum = i - dow + 1 - dim; monthOffset = +1;
      } else {
        dayNum = i - dow + 1; monthOffset = 0;
      }
      // Año/mes reales de la celda (cruza año si hace falta)
      let cellY = state.viewY;
      let cellM = state.viewM + monthOffset;
      if (cellM < 0)  { cellM = 11; cellY -= 1; }
      if (cellM > 11) { cellM = 0;  cellY += 1; }
      const cellDate = new Date(cellY, cellM, dayNum);
      const isToday = cellDate.getFullYear() === today.getFullYear() &&
                      cellDate.getMonth()    === today.getMonth() &&
                      cellDate.getDate()     === today.getDate();
      const isOn    = monthOffset === 0 && state.d !== null &&
                      dayNum === state.d && state.viewY === state.y && state.viewM === state.m;
      days.push({ dayNum, monthOffset, isToday, isOn });
    }
    return days;
  }, [state.viewY, state.viewM, state.d, state.y, state.m]);

  const weekRange = useMemo(() => {
    const firstOfMonth = new Date(state.viewY, state.viewM, 1);
    let dow = firstOfMonth.getDay();
    dow = dow === 0 ? 6 : dow - 1;
    const firstVisible = new Date(state.viewY, state.viewM, 1 - dow);
    const lastVisible  = new Date(state.viewY, state.viewM, 1 - dow + 41);
    return `W${pad(getISOWeek(firstVisible))} — W${pad(getISOWeek(lastVisible))}`;
  }, [state.viewY, state.viewM]);

  const selOut = useMemo(() => {
    if (state.d === null) return "—";
    const d = new Date(state.y, state.m, state.d);
    const wd = WDAY_SHORT[d.getDay()];
    return `${wd} · ${pad(state.d)} ${MONTHS_SHORT[state.m]} ${state.y} · ${pad(state.h)}:${pad(state.mi)}`;
  }, [state.y, state.m, state.d, state.h, state.mi]);

  // ── Handlers ──
  function handleDayClick(dayNum, monthOffset) {
    setState((s) => {
      let nm = s.viewM + monthOffset;
      let ny = s.viewY;
      if (nm < 0)  { nm = 11; ny--; }
      if (nm > 11) { nm = 0;  ny++; }
      return { ...s, d: dayNum, y: ny, m: nm, viewM: nm, viewY: ny };
    });
  }
  function prevMonth() {
    setState((s) => {
      let nm = s.viewM - 1, ny = s.viewY;
      if (nm < 0) { nm = 11; ny--; }
      return { ...s, viewM: nm, viewY: ny };
    });
  }
  function nextMonth() {
    setState((s) => {
      let nm = s.viewM + 1, ny = s.viewY;
      if (nm > 11) { nm = 0; ny++; }
      return { ...s, viewM: nm, viewY: ny };
    });
  }
  function handleToday() {
    const t = new Date();
    let mi = snapMinutesTo5(t.getMinutes());
    let h  = t.getHours();
    if (mi >= 60) { mi = 0; h = (h + 1) % 24; }
    setState((s) => ({
      y: t.getFullYear(), m: t.getMonth(), d: t.getDate(),
      h, mi,
      viewY: t.getFullYear(), viewM: t.getMonth(),
      // Bump del trigger para forzar re-centrado aunque h/mi coincidan
      // con los actuales (caso del usuario que pulsa "Hoy" cuando ya
      // estaba en una hora cercana — el calendario debe re-scrollar).
      centerTrigger: s.centerTrigger + 1,
    }));
  }
  function handleClear() {
    setState((s) => ({ ...s, d: null }));
  }
  function handleConfirm() {
    if (state.d === null) {
      onConfirm?.(null);
      return;
    }
    const result = new Date(state.y, state.m, state.d, state.h, state.mi, 0, 0);
    onConfirm?.(result);
  }

  // ── Soporte de teclado ──
  // Esc cancela. Enter confirma. Flechas mueven el día seleccionado
  // (con auto-cambio de mes si te sales). PageUp/PageDown cambian mes.
  // Home salta a hoy. No interceptamos teclas cuando el foco está dentro
  // de las listas de hora/min (para no romper su scroll).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); return; }
      if (e.key === "Enter")  { e.preventDefault(); handleConfirm(); return; }

      // No interferir con scroll/foco interno de las listas
      const insideList = dpickRef.current && dpickRef.current.contains(document.activeElement) &&
                         document.activeElement.closest && document.activeElement.closest(".dp-list");
      if (insideList && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

      if (e.key === "PageUp")   { e.preventDefault(); prevMonth();   return; }
      if (e.key === "PageDown") { e.preventDefault(); nextMonth();   return; }
      if (e.key === "Home")     { e.preventDefault(); handleToday(); return; }

      // Flechas: mover día seleccionado (±1 / ±7 días)
      const delta =
        e.key === "ArrowLeft"  ? -1 :
        e.key === "ArrowRight" ?  1 :
        e.key === "ArrowUp"    ? -7 :
        e.key === "ArrowDown"  ?  7 : 0;
      if (delta !== 0) {
        e.preventDefault();
        setState((s) => {
          // Si no hay día seleccionado, arrancamos desde el 1 del mes en vista
          const base = s.d !== null
            ? new Date(s.y, s.m, s.d)
            : new Date(s.viewY, s.viewM, 1);
          base.setDate(base.getDate() + delta);
          return {
            ...s,
            y: base.getFullYear(), m: base.getMonth(), d: base.getDate(),
            viewY: base.getFullYear(), viewM: base.getMonth(),
          };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.d, state.y, state.m, state.viewY, state.viewM, state.h, state.mi]);

  if (!open) return null;

  return (
    <div className="dp-host" onClick={onCancel}>

      {/* Faded board silhouette behind — siluetas de columnas del Tablero */}
      <div className="dp-host-bg" aria-hidden="true">
        <div className="g-col"></div>
        <div className="g-col"></div>
        <div className="g-col"></div>
        <div className="g-col"></div>
        <div className="g-col"></div>
      </div>

      <div className="dp-scrim" aria-hidden="true"></div>

      <div
        className="dpick"
        ref={dpickRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="dpTitle"
        aria-modal="true"
      >
        {/* Chasis */}
        <span className="s-br tl"></span><span className="s-br tr"></span>
        <span className="s-br bl"></span><span className="s-br br"></span>
        <span className="s-screw tl"></span><span className="s-screw tr"></span>
        <span className="s-screw bl"></span><span className="s-screw br"></span>

        {/* HEADER */}
        <header className="dp-h">
          <div className="l">
            <span className="led"></span>
            <span className="ix">00</span><span className="div">/</span>
            <span className="ttl" id="dpTitle">Fecha · Hora de Publicación</span>
          </div>
          <button type="button" className="somal-x" onClick={onCancel} aria-label="Cerrar (ESC)">×</button>
        </header>

        {/* BODY */}
        <div className="dp-body">

          {/* CALENDARIO */}
          <section className="dp-cal">
            <div className="dp-cal-h">
              <button type="button" className="navbtn" onClick={prevMonth} aria-label="Mes anterior">‹</button>
              <div className="monthlbl">
                <b>{MONTHS_LONG[state.viewM]} {state.viewY}</b>
                <small>{weekRange}</small>
              </div>
              <button type="button" className="navbtn" onClick={nextMonth} aria-label="Mes siguiente">›</button>
            </div>
            <div className="dp-week" aria-hidden="true">
              <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
            </div>
            <div className="dp-grid">
              {calendarDays.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`dp-day ${c.monthOffset !== 0 ? "off" : ""} ${c.isToday ? "today" : ""} ${c.isOn ? "on" : ""}`}
                  onClick={() => handleDayClick(c.dayNum, c.monthOffset)}
                >
                  {c.dayNum}
                </button>
              ))}
            </div>
          </section>

          {/* HORA */}
          <section className="dp-list">
            <div className="dp-list-h">Hora</div>
            <div className="dp-list-body" ref={hListRef}>
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  className={`dp-item ${h === state.h ? "on" : ""}`}
                  onClick={() => setState((s) => ({ ...s, h }))}
                >
                  {pad(h)}
                </button>
              ))}
            </div>
          </section>

          {/* MINUTOS (paso 5) */}
          <section className="dp-list">
            <div className="dp-list-h">Minutos</div>
            <div className="dp-list-body" ref={mListRef}>
              {Array.from({ length: 12 }, (_, idx) => idx * 5).map((mi) => (
                <button
                  key={mi}
                  type="button"
                  className={`dp-item ${mi === state.mi ? "on" : ""}`}
                  onClick={() => setState((s) => ({ ...s, mi }))}
                >
                  {pad(mi)}
                </button>
              ))}
            </div>
          </section>

        </div>

        {/* FOOTER */}
        <footer className="dp-foot">
          <div className="l">
            <span><span className="led"></span>SELECCIONADO</span>
            <b>{selOut}</b>
          </div>
          <div className="r">
            <button type="button" className="dp-btn-link" onClick={handleClear}>Limpiar</button>
            <button type="button" className="dp-btn-link" onClick={handleToday}>Hoy</button>
            <button type="button" className="somal-btn primary" onClick={handleConfirm}>Confirmar</button>
          </div>
        </footer>

      </div>
    </div>
  );
}
