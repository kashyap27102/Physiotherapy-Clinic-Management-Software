import { pingDatabase, type DatabaseStatus } from "../../db/prisma.js";

export interface Liveness {
  status: "ok";
}

export interface Readiness {
  status: "ok" | "degraded";
  database: DatabaseStatus;
}

export interface VersionInfo {
  name: string;
  version: string;
}

/** Liveness: the process is up. No dependencies are touched, so hosting health checks stay cheap. */
export function getLiveness(): Liveness {
  return { status: "ok" };
}

/** Readiness: dependencies are reachable. "not_configured" counts as ok while there is no database yet. */
export async function getReadiness(): Promise<Readiness> {
  const database = await pingDatabase();
  return { status: database === "down" ? "degraded" : "ok", database };
}

export function getVersion(): VersionInfo {
  return {
    name: "physio-clinic-server",
    version: process.env["npm_package_version"] ?? "unknown",
  };
}
