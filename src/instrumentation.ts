export async function register() {
  // Only run on the server (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSftpServer } = await import("./lib/sftp-server");
    const { startAllPollers } = await import("./lib/poller");

    // Start SFTP server (if enabled in settings)
    startSftpServer().catch((err) => {
      console.error("[instrumentation] Failed to start SFTP server:", err);
    });

    // Start all configured pollers
    startAllPollers().catch((err) => {
      console.error("[instrumentation] Failed to start pollers:", err);
    });
  }
}
