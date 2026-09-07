import { analyzeDraft } from './optimizer';

self.onmessage = (event) => {
  try {
    const { players, drafted, settings, teams, context } = event.data;
    self.postMessage({ analysis: analyzeDraft(players, drafted, settings, teams, context,pickReady=>self.postMessage({pickReady})) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Draft analysis failed.' });
  }
};
