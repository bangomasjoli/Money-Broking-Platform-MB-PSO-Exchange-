/**
 * FND-01 §5.2 / FND-FR-001 configuration loader.
 * Startup fails closed if a required critical variable is missing or invalid.
 * Secrets are read from the environment (KMS/vault provider is a §13 open item); this
 * loader never logs their values.
 */
import { AppError } from "./errors.js";

export type Environment = "dev" | "qa" | "uat" | "staging" | "prod";
const ENVIRONMENTS: readonly Environment[] = ["dev", "qa", "uat", "staging", "prod"];

export interface AppConfig {
  environment: Environment;
  databaseUrl: string;
  internalServiceToken: string;
  port: number;
  releaseVersion: string;
  artifactHash: string;
  buildTimeUtc: string;
}

export interface RawEnv {
  [key: string]: string | undefined;
}

/**
 * Parse + validate config from an env map. Throws CONFIGURATION_INVALID listing every
 * missing/invalid critical key (so startup surfaces all problems at once).
 */
export function loadConfig(env: RawEnv = process.env): AppConfig {
  const problems: string[] = [];

  const environment = env.ENVIRONMENT?.trim() as Environment | undefined;
  if (!environment || !ENVIRONMENTS.includes(environment)) {
    problems.push(`ENVIRONMENT must be one of ${ENVIRONMENTS.join("/")}`);
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) problems.push("DATABASE_URL is required");

  const internalServiceToken = env.INTERNAL_SERVICE_TOKEN?.trim();
  if (!internalServiceToken) {
    problems.push("INTERNAL_SERVICE_TOKEN is required (interim IAM handoff seam)");
  } else if (internalServiceToken.length < 8) {
    problems.push("INTERNAL_SERVICE_TOKEN too short");
  }

  const port = parseInt(env.PORT ?? "8080", 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    problems.push("PORT must be a valid port number");
  }

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    environment: environment as Environment,
    databaseUrl: databaseUrl as string,
    internalServiceToken: internalServiceToken as string,
    port,
    releaseVersion: env.RELEASE_VERSION?.trim() || "v0.0.0",
    artifactHash: env.ARTIFACT_HASH?.trim() || "sha256:unknown",
    buildTimeUtc: env.BUILD_TIME_UTC?.trim() || "1970-01-01T00:00:00Z",
  };
}
