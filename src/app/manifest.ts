import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NextSet",
    short_name: "NextSet",
    description: "Personal AI gym logger and progression advisor.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#059669",
    id: "/",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
