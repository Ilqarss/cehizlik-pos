import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@cehizlik/types", "@cehizlik/utils", "@cehizlik/config"],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@cehizlik/types": path.resolve(__dirname, "../../packages/types/src"),
      "@cehizlik/utils": path.resolve(__dirname, "../../packages/utils/src"),
      "@cehizlik/config": path.resolve(__dirname, "../../packages/config/src")
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;