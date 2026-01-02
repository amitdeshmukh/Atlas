import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

export interface SurrealConfig {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}

export interface BootstrapConfig {
  enabled: boolean;
  directory: string;
}

export interface ServerConfig {
  port: number;
}

export function getSurrealConfig(): SurrealConfig {
  return {
    url: process.env.SURREAL_URL ?? 'http://127.0.0.1:8000/rpc',
    namespace: process.env.SURREAL_NS ?? 'axontology',
    database: process.env.SURREAL_DB ?? 'axontology',
    username: process.env.SURREAL_USER ?? "",
    password: process.env.SURREAL_PASS ?? ""
  };
}

export function getBootstrapConfig(): BootstrapConfig {
  const enabledEnv = process.env.ONTOLOGY_BOOTSTRAP_ENABLED ?? 'false';
  const enabled = enabledEnv.toLowerCase() === 'true';
  const directory =
    process.env.ONTOLOGY_BOOTSTRAP_DIR ??
    path.join(process.cwd(), 'examples', 'bootstrap_ontologies');
  return { enabled, directory };
}

export function getServerConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
  };
}


