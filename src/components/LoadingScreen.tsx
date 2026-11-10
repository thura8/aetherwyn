import Sigil from "@/components/Sigil";
import SkyLayers from "@/components/SkyLayers";

/**
 * The full-screen loader. app/loading.tsx renders it as the first-paint Suspense fallback,
 * then app/page.tsx renders it again so src/experience can drive its progress and reveal.
 */
export default function LoadingScreen() {
  return (
    <div className="loader" id="loader" role="status" aria-live="polite">
      <SkyLayers />
      <div className="loader-inner">
        <Sigil />
        <h2 className="loader-title">Aetherwyn</h2>
        <p className="loader-sub">The realm awakens</p>
        <div
          className="loader-meter"
          id="loader-meter"
          role="progressbar"
          aria-label="Loading the realm"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <span className="meter-track" />
          <span className="meter-fill" />
          <span className="meter-spark" />
        </div>
        <p className="loader-text" id="loader-text">
          Opening the realm
        </p>
        <p className="loader-tip" id="loader-tip" />
      </div>
    </div>
  );
}
