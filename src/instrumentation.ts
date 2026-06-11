export async function register() {
  // Only run on the server (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateSftpEndpoints } = await import("./lib/migrate-sftp");
    const { startSftpServer } = await import("./lib/sftp-server");
    const { startScheduler } = await import("./lib/scheduler");
    const { startRetentionSweep } = await import("./lib/retention");

    // Migrate any legacy SFTP-client endpoints to connections + transfers first,
    // so the scheduler picks up the migrated transfers below.
    try {
      await migrateSftpEndpoints();
    } catch (err) {
      console.error("[instrumentation] SFTP endpoint migration failed:", err);
    }

    // Start inbound SFTP server (if enabled in settings)
    startSftpServer().catch((err) => {
      console.error("[instrumentation] Failed to start SFTP server:", err);
    });

    // Arm scheduled transfers
    startScheduler().catch((err) => {
      console.error("[instrumentation] Failed to start scheduler:", err);
    });

    startRetentionSweep();
  }
}
