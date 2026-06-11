import { readJsonConfig, writeJsonConfig } from "./config";
import type { SoapConnection } from "./types";

const CONNECTIONS_FILE = "soap-connections.json";

export async function getSoapConnections(): Promise<SoapConnection[]> {
  return readJsonConfig<SoapConnection[]>(CONNECTIONS_FILE, []);
}

export async function writeSoapConnections(connections: SoapConnection[]): Promise<void> {
  await writeJsonConfig(CONNECTIONS_FILE, connections);
}

export async function getSoapConnectionById(id: string): Promise<SoapConnection | null> {
  const connections = await getSoapConnections();
  return connections.find((c) => c.id === id) || null;
}

/** Public view of a SOAP connection: never expose secrets. */
export interface SanitizedSoapConnection {
  id: string;
  name: string;
  url: string;
  username: string;
  hasPassword: boolean;
  soapAction: string;
  envelopeMode: SoapConnection["envelopeMode"];
  envelopeTemplate?: string;
  extractBody: boolean;
  ignoreTlsErrors: boolean;
  createdAt: string;
  updatedAt?: string;
}

export function sanitizeSoapConnection(c: SoapConnection): SanitizedSoapConnection {
  return {
    id: c.id,
    name: c.name,
    url: c.url,
    username: c.username,
    hasPassword: !!c.passwordEncrypted,
    soapAction: c.soapAction,
    envelopeMode: c.envelopeMode,
    envelopeTemplate: c.envelopeTemplate,
    extractBody: c.extractBody,
    ignoreTlsErrors: c.ignoreTlsErrors,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
