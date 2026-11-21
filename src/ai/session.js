import { modelManager } from './engine/ModelManager.js';
import { ConversationManager } from './conversation/ConversationManager.js';
import { AnswerPlanner } from './generation/AnswerPlanner.js';
import { KnowledgePackService } from '../services/KnowledgePackService.js';

/** The knowledge pack deployed with the app (see services/KnowledgePackService.js). */
export const knowledgePack = new KnowledgePackService();

/**
 * App-wide conversation. It delegates to whatever engine the model manager currently
 * holds, so the chat survives page navigation and the engine can be swapped in tests.
 * Questions are routed against the loaded knowledge pack (if any) before the model sees them.
 */
export const conversation = new ConversationManager(
  {
    generate: (messages, options) => modelManager.engine.generate(messages, options),
    interrupt: () => modelManager.engine.interrupt(),
    resetChat: () => modelManager.engine.resetChat(),
  },
  { planner: new AnswerPlanner(() => knowledgePack.current) }
);
