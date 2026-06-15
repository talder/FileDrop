import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonConfig } from "@/lib/config";
import { getDestinations } from "@/lib/destinations";
import { getTransfers } from "@/lib/transfers";
import { getIntegrations } from "@/lib/integrations";
import { getSftpConnections } from "@/lib/sftp-connections";
import { getSoapConnections } from "@/lib/soap-connections";
import { getFtpConnections } from "@/lib/ftp-connections";
import { getAllApiKeys } from "@/lib/api-keys";
import { getTagsPruned } from "@/lib/tags";
import { buildFlowGraph } from "@/lib/flow";
import type { DropEndpoint } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [endpoints, destinations, transfers, integrations, sftpConnections, soapConnections, ftpConnections, tags] =
    await Promise.all([
      readJsonConfig<DropEndpoint[]>("endpoints.json", []),
      getDestinations(),
      getTransfers(),
      getIntegrations(),
      getSftpConnections(),
      getSoapConnections(),
      getFtpConnections(),
      getTagsPruned(),
    ]);

  const apiKeys = getAllApiKeys();

  const graph = buildFlowGraph(
    { endpoints, destinations, transfers, integrations, sftpConnections, soapConnections, ftpConnections, apiKeys },
    tags,
  );

  return NextResponse.json(graph);
}
