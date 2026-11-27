import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baseline",
    short_name: "Baseline",
    description: "Your personal health and training baseline",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050608",
    theme_color: "#050608",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed tile with the mark inside the central 66 %, so it also works as a maskable icon.
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
