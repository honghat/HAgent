import { setRunTask } from './queue.js';
import { runPipeline } from './pipeline.js';

export function initVideoQueue() {
  console.log('[Video Service] Initializing queue worker...');
  setRunTask(runPipeline);
}
