/**
 * ZernioLoading — Estado de carga: 5 skeletons con shimmer.
 *
 * Markup del handoff (`.zlist-loading[data-state="loading"]`):
 *   ┌──────────────────┐
 *   │ ░░░░░░░░░░░░░░░░ │  × 5
 *   └──────────────────┘
 */

export default function ZernioLoading() {
  return (
    <div className="zlist-loading" data-state="loading">
      <div className="skel"></div>
      <div className="skel"></div>
      <div className="skel"></div>
      <div className="skel"></div>
      <div className="skel"></div>
    </div>
  );
}
