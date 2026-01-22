import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* This async function allows us to define routes that proxy requests to the backend. */
  async rewrites() {
    return [
      {
        // Source path: Any request starting with /api/ will be intercepted by Next.js
        source: "/api/:path*",
        // Destination path: Proxy the request to the local Python backend server
        destination: "http://127.0.0.1:5000/api/:path*",
      },
    ];
  },
  // If reactCompiler is not necessary for your current version, it can be omitted.
  // If you need it, you can uncomment it, but ensure it doesn't cause errors.
  // reactCompiler: true, 
};

export default nextConfig;