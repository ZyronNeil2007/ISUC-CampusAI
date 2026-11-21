import { buildRefusal, decideRoute, GENERAL_LABEL } from '../retrieval/routing.js';

/**
 * Decides how one question is answered, before any model runs (README 14.6 and 15.2 to 15.4):
 *
 *   university  retrieved sources go to the model, which answers and cites them
 *   general     no sources; the model answers as general information, labelled as such
 *   refuse      a fixed message built from the pack; the model is NOT called, so nothing can be invented
 *   chat        greetings and thanks
 *
 * `getPack` returns {manifest, retriever} or null when no knowledge pack is loaded.
 */
export class AnswerPlanner {
  constructor(getPack) {
    this.getPack = getPack;
  }

  plan(question, previousQuestion = null) {
    const pack = this.getPack();
    if (!pack) {
      const decision = decideRoute({ retrieval: null, question, packLoaded: false });
      // Without a pack there is nothing to verify against, so even a "general" answer must not make ISU claims.
      return { route: decision.route, reason: decision.reason, packLoaded: false, label: decision.route === 'general' ? GENERAL_LABEL : null, hits: [], contentLevel: null, today: null };
    }

    const { retriever, manifest } = pack;
    const retrieval = retriever.retrieve(question, { previousQuestion });
    const decision = decideRoute({ retrieval, question, lexicon: retriever.lexicon, officeTerms: retriever.officeTerms, packLoaded: true });
    const plan = {
      route: decision.route,
      reason: decision.reason,
      packLoaded: true,
      label: decision.route === 'general' ? GENERAL_LABEL : null,
      hits: decision.route === 'university' ? retrieval.sources : [],
      contentLevel: manifest.contentLevel,
      today: retrieval.today,
      retrieval,
      refusal: null,
    };
    if (decision.route === 'refuse') plan.refusal = buildRefusal({ retrieval, retriever, packLoaded: true });
    return plan;
  }
}
