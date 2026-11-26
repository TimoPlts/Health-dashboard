import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** App icon: a single pulse stroke on deep glass. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 30% 20%, #2a2d3a 0%, #07080b 70%)" }}>
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="#ff6a55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      </div>
    ),
    size,
  );
}
