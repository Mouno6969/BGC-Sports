// ---------------------------------------------------------------------------
// StadiumGrassScene — fixed, full-viewport stadium atmosphere shared by pages.
// ---------------------------------------------------------------------------
export default function StadiumGrassScene({ children }) {
  return (
    <div className="stadium-scene">
      <div className="stadium-scene__backdrop" aria-hidden="true">
        <div className="stadium-scene__bg-image" />
        <div className="stadium-scene__bg-aurora" />
        <div className="stadium-scene__bg-vignette" />
        <div className="stadium-scene__bg-pitch" />
        <div className="stadium-scene__bg-grain" />
      </div>

      <div className="stadium-scene__content">{children}</div>
    </div>
  );
}
