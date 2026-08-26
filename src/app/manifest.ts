import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "McKenzie Construction Company Inbox",
    short_name: "McKenzie Inbox",
    description: "Secure employee access to McKenzie Construction communications.",
    start_url: "/communications?channel=sms",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [{
      src: "/branding/MCM_positive_square.jpg",
      sizes: "800x800",
      type: "image/jpeg",
      purpose: "any",
    }],
  };
}
