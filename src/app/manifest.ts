import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spark",
    short_name: "Spark",
    description: "A private space for two.",
    start_url: `${base}/home/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#E85D75",
    icons: [
      { src: `${base}/icon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
