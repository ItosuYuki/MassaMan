import "server-only";

import { sendDueReservationReminders } from "@/lib/notifications";

const REMINDER_POLL_INTERVAL_MS = 30_000;

type LocalReminderSchedulerState = {
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
};

const globalForScheduler = globalThis as typeof globalThis & {
  massamanLocalReminderScheduler?: LocalReminderSchedulerState;
};

async function runReminderJob(state: LocalReminderSchedulerState) {
  if (state.running) return;
  state.running = true;
  try {
    const sent = await sendDueReservationReminders();
    if (sent > 0) console.info(`[reminders] ${sent}件のリマインドを送信しました。`);
  } catch (error) {
    console.error("[reminders] リマインドジョブに失敗しました。", error);
  } finally {
    state.running = false;
  }
}

export function startLocalReminderScheduler() {
  if (globalForScheduler.massamanLocalReminderScheduler?.timer) return;

  const state: LocalReminderSchedulerState = { running: false };
  globalForScheduler.massamanLocalReminderScheduler = state;

  void runReminderJob(state);
  state.timer = setInterval(() => void runReminderJob(state), REMINDER_POLL_INTERVAL_MS);
  state.timer.unref();
  console.info("[reminders] ローカルリマインドジョブを30秒間隔で開始しました。");
}
