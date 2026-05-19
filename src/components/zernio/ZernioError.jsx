/**
 * ZernioError — Estado de error al cargar notificaciones.
 *
 * Markup del handoff (`.zlist-error[data-state="error"]`):
 *   ┌──────────────────┐
 *   │       !          │
 *   │  Error al cargar │
 *   │  ...             │
 *   │  [Reintentar]    │
 *   └──────────────────┘
 */

export default function ZernioError({ onRetry }) {
  return (
    <div className="zlist-error" data-state="error">
      <div className="glyph">!</div>
      <div className="ttl">Error al cargar notificaciones</div>
      <div className="desc">
        No se ha podido contactar con la base. Reintentando en background. Si
        esto persiste, revisa el log de la Netlify Function.
      </div>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
