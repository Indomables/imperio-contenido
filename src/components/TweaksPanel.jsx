import { useEffect, useState } from "react";
import SomaAudio from "../lib/soma-audio";

const DEFAULT_TWEAKS = {
  motion: "live",
  density: "comfy",
  type: "default",
  accent: "amber",
};

function applyTweaks(t) {
  const body = document.body;
  body.classList.remove(
    "motion-off",
    "motion-subtle",
    "motion-live",
    "motion-max"
  );
  body.classList.add(`motion-${t.motion}`);

  body.classList.remove("density-compact", "density-comfy", "density-airy");
  body.classList.add(`density-${t.density}`);

  body.classList.toggle("type-mono", t.type === "mono");

  body.classList.remove(
    "accent-citron",
    "accent-amber",
    "accent-cobalt",
    "accent-ember"
  );
  if (t.accent !== "green") body.classList.add(`accent-${t.accent}`);
}

function applyAudio(audioVal) {
  // Sincroniza la clase del body por si el CSS la usa para algo
  document.body.classList.toggle("audio-on", audioVal === "on");
}

export default function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const [tweaks, setTweaks] = useState(DEFAULT_TWEAKS);

  // El estado de audio es la fuente de verdad de SomaAudio (persiste en
  // localStorage). Aquí solo lo reflejamos para la UI.
  const [audio, setAudio] = useState(() =>
    SomaAudio.isMuted() ? "off" : "on"
  );

  useEffect(() => {
    applyTweaks(tweaks);
  }, [tweaks]);

  useEffect(() => {
    applyAudio(audio);
  }, [audio]);

  // Listener del evento global para abrir/cerrar el panel desde el TopNav.
  useEffect(() => {
    function handleToggle() {
      setOpen((v) => !v);
    }
    window.addEventListener("tweaks:toggle", handleToggle);
    return () => window.removeEventListener("tweaks:toggle", handleToggle);
  }, []);

  // Setter unificado: cualquier cambio en los tweaks emite el beep de "toggle".
  // El cambio del audio se gestiona aparte porque también muta SomaAudio.
  const set = (key) => (val) => {
    if (tweaks[key] === val) return; // sin cambio, sin sonido
    SomaAudio.toggle();
    setTweaks((t) => ({ ...t, [key]: val }));
  };

  // Cambio del audio:
  //   - "off" → suena confirmando antes de mute (último beep audible)
  //   - "on"  → desmute primero, luego suena confirmando que está activo
  const setAudioVal = (val) => {
    if (audio === val) return;
    if (val === "off") {
      SomaAudio.toggle();
      SomaAudio.setMuted(true);
    } else {
      SomaAudio.setMuted(false);
      SomaAudio.toggle();
    }
    setAudio(val);
  };

  const Btn = ({ active, onClick, children, style }) => (
    <button
      type="button"
      className={active ? "on" : ""}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );

  return (
    <aside className={`tweaks-panel${open ? " open" : ""}`}>
      <div className="head">
        <span>TWEAKS · SYSTEM CONFIG</span>
        <button onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="body">
        <div className="tweak-section">
          <div className="lbl">Motion</div>
          <div className="tweak-row">
            {["off", "subtle", "live", "max"].map((v) => (
              <Btn
                key={v}
                active={tweaks.motion === v}
                onClick={() => set("motion")(v)}
              >
                {v === "off"
                  ? "Off"
                  : v === "subtle"
                  ? "Subtle"
                  : v === "live"
                  ? "Live"
                  : "HUD Max"}
              </Btn>
            ))}
          </div>
        </div>

        <div className="tweak-section">
          <div className="lbl">Density</div>
          <div className="tweak-row three">
            {["compact", "comfy", "airy"].map((v) => (
              <Btn
                key={v}
                active={tweaks.density === v}
                onClick={() => set("density")(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </Btn>
            ))}
          </div>
        </div>

        <div className="tweak-section">
          <div className="lbl">Typography</div>
          <div className="tweak-row">
            <Btn
              active={tweaks.type === "default"}
              onClick={() => set("type")("default")}
            >
              Sans+Mono
            </Btn>
            <Btn
              active={tweaks.type === "mono"}
              onClick={() => set("type")("mono")}
            >
              All Mono
            </Btn>
          </div>
        </div>

        <div className="tweak-section">
          <div className="lbl">Accent</div>
          <div className="tweak-row five swatches">
            {[
              ["green", "oklch(0.86 0.205 145)"],
              ["citron", "oklch(0.87 0.18 108)"],
              ["amber", "oklch(0.82 0.18 75)"],
              ["cobalt", "oklch(0.78 0.18 245)"],
              ["ember", "oklch(0.72 0.205 30)"],
            ].map(([v, color]) => (
              <Btn
                key={v}
                active={tweaks.accent === v}
                onClick={() => set("accent")(v)}
              >
                <span className="sw" style={{ background: color }}></span>
              </Btn>
            ))}
          </div>
        </div>

        <div className="tweak-section">
          <div className="lbl">Audio</div>
          <div className="tweak-row">
            <Btn active={audio === "on"} onClick={() => setAudioVal("on")}>
              On
            </Btn>
            <Btn active={audio === "off"} onClick={() => setAudioVal("off")}>
              Off
            </Btn>
          </div>
        </div>
      </div>
    </aside>
  );
}
