import { setupCommand } from './commands/setup.js';

try {
  await setupCommand();
} catch {
  // Silent fail — don't block npm install
}
