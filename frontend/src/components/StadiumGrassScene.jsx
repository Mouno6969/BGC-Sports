// ---------------------------------------------------------------------------
// StadiumGrassScene — static full-page stadium + grass background wrapper.
// ---------------------------------------------------------------------------
export default function StadiumGrassScene({ children }) {
  return (
    <div className="stadium-scene">
      <div className="stadium-scene__backdrop" aria-hidden="true">
        <div className="stadium-scene__bg-image" />
        <div className="stadium-scene__bg-glow" />
        <div className="stadium-scene__bg-vignette" />
        <div className="stadium-scene__bg-grass-tint" />
      </div>

      <div className="stadium-scene__content">
        {children}
      </div>
    </div>
  );
}