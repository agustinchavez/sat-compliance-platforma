/**
 * Workers Entry Point (Component 17)
 *
 * Starts all BullMQ workers for the invoice workflow system.
 *
 * Run with: tsx workers/index.ts
 * Or: npm run worker
 *
 * This is a separate process from the Next.js server.
 */

// Import workers to start them
import { invoiceWorker, shutdownInvoiceWorker } from './invoice.worker';
import {
  emailWorker,
  reminderWorker,
  shutdownReminderWorkers,
} from './reminder.worker';

// ============================================================================
// Startup
// ============================================================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Invoice Workflow Workers - Starting');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Environment: ${process.env.NODE_ENV ?? 'development'}`);
console.log(`  Concurrency: ${process.env.WORKER_CONCURRENCY ?? '5'}`);
console.log('───────────────────────────────────────────────────────────────');
console.log('  Workers:');
console.log(`    - Invoice Worker (${invoiceWorker.name})`);
console.log(`    - Email Worker (${emailWorker.name})`);
console.log(`    - Reminder Worker (${reminderWorker.name})`);
console.log('───────────────────────────────────────────────────────────────');
console.log('  Waiting for jobs...');
console.log('═══════════════════════════════════════════════════════════════');

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[workers] ${signal} received, shutting down gracefully...`);

  try {
    await Promise.all([shutdownInvoiceWorker(), shutdownReminderWorkers()]);

    console.log('[workers] All workers shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('[workers] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[workers] Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[workers] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, but log it
});

// ============================================================================
// Keep Process Alive
// ============================================================================

// The workers will keep the process alive as long as they're running.
// If Redis disconnects, the workers will automatically try to reconnect.

// Export workers for external access (e.g., health checks)
export { invoiceWorker, emailWorker, reminderWorker };
