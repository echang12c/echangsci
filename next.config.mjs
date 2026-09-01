/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 é binário nativo: precisa ficar fora do bundle do servidor.
  serverExternalPackages: ['better-sqlite3'],
};
export default nextConfig;
