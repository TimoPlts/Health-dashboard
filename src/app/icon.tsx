import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon: the Baseline mark on a deep graphite tile with a soft top light. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(120% 90% at 30% 0%, #2b2e38 0%, #0c0d11 62%, #07080a 100%)" }}>
        <svg width="340" height="340" viewBox="0 0 24 24" fill="none">
          <path d="M2.5 15.5h19" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M2.5 15.5H8c1.4 0 1.9-7 4-7s2.6 7 4 7h5.5" stroke="#ff6a55" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
