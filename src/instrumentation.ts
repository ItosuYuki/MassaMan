export async function register() {
  const isLocalDevelopment = process.env.NODE_ENV === "development" && !process.env.VERCEL;
  if (process.env.NEXT_RUNTIME === "nodejs" && isLocalDevelopment) {
    const { startLocalReminderScheduler } = await import("./instrumentation-node");
    startLocalReminderScheduler();
  }
}
