import useClock from "../hooks/useClock.js";

export default function StatusLine() {
  const { hms } = useClock();

  return (
    <div className="contenido-status">
      <span className="led"></span>
      <span>
        SISTEMA <b style={{ color: "var(--acc)" }}>ACTIVO</b>
      </span>
      <span>
        · CRON <b>CADA HORA</b>
      </span>
      <span>
        · KIT <b style={{ color: "var(--acc)" }}>OK</b>
      </span>
      <span>
        · ZERNIO <b style={{ color: "var(--acc)" }}>OK</b>
      </span>
      <span style={{ marginLeft: "auto" }}>
        ÚLTIMA SINC <b>{hms}</b>
      </span>
      <span>
        · <b>SOMA ALCÁZAR</b> · NODE-MAD
      </span>
    </div>
  );
}
