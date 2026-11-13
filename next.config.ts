import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite는 번들하지 않고 Node에서 그대로 로드한다.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
