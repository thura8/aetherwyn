import type { CSSProperties } from "react";

/** Rising sparks: [horizontal position, duration, delay, size, sideways drift]. */
const MOTES = [
  ["33.4%", "8.1s", "-9.1s", "1.7px", "28px"],
  ["11.8%", "11.1s", "-12.7s", "2.0px", "-29px"],
  ["43.8%", "7.5s", "-1.3s", "2.6px", "32px"],
  ["14.6%", "8.6s", "-8.8s", "3.9px", "33px"],
  ["58.0%", "7.3s", "-3.1s", "2.9px", "-23px"],
  ["30.2%", "8.0s", "-1.6s", "2.3px", "-17px"],
  ["12.7%", "11.0s", "-2.6s", "1.7px", "-32px"],
  ["56.1%", "11.3s", "-6.9s", "2.8px", "0px"],
  ["46.8%", "13.5s", "-5.1s", "2.1px", "-17px"],
  ["68.7%", "8.7s", "-8.0s", "2.8px", "3px"],
  ["71.6%", "9.0s", "-13.7s", "1.8px", "13px"],
  ["18.5%", "9.4s", "-13.1s", "2.6px", "-31px"],
  ["74.9%", "11.0s", "-12.3s", "2.3px", "4px"],
  ["58.9%", "11.1s", "-6.4s", "3.6px", "-6px"],
  ["47.6%", "11.6s", "-0.8s", "3.3px", "33px"],
  ["96.4%", "12.8s", "-4.0s", "2.5px", "4px"],
  ["5.1%", "10.2s", "-2.4s", "1.8px", "-33px"],
  ["23.5%", "9.0s", "-10.3s", "2.5px", "23px"],
  ["10.6%", "10.1s", "-7.7s", "3.7px", "15px"],
  ["84.2%", "8.9s", "-5.8s", "2.4px", "8px"],
  ["93.0%", "8.1s", "-2.5s", "2.1px", "-11px"],
  ["4.1%", "12.8s", "-2.6s", "2.2px", "-22px"],
  ["42.4%", "9.6s", "-7.9s", "3.9px", "25px"],
  ["92.3%", "11.6s", "-10.4s", "2.6px", "31px"],
  ["39.9%", "9.8s", "-1.4s", "3.1px", "-33px"],
  ["20.9%", "13.9s", "-6.2s", "1.8px", "36px"],
] as const;

/** Nebula, twinkling stars and rising motes. Fills its nearest positioned ancestor. */
export default function SkyLayers() {
  return (
    <>
      <div className="loader-nebula" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="loader-stars" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="loader-motes" aria-hidden="true">
        {MOTES.map(([x, duration, delay, size, drift]) => (
          <span
            key={`${x}-${delay}`}
            className="mote"
            style={
              {
                "--x": x,
                "--d": duration,
                "--delay": delay,
                "--s": size,
                "--drift": drift,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
