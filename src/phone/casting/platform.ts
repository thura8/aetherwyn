/**
 * Every iOS browser (Safari, Chrome, Firefox…) runs on WebKit, which differs from the standard in
 * places: it labels motion rotation rates in another order, and its speech recognition needs
 * single-phrase mode. Decided from the device alone (iPads report as a Mac with touch): other
 * browsers now also ask for motion permission, so `DeviceMotionEvent.requestPermission` no longer
 * means iOS.
 */
export function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}
