import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let classifier: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, text } = e.data;

  if (type === 'INIT') {
    try {
      self.postMessage({ status: 'LOADING', message: 'Downloading local AI model (~60MB)...' });
      classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      self.postMessage({ status: 'READY', message: 'Offline AI Ready' });
    } catch (err: any) {
      self.postMessage({ status: 'ERROR', error: err.message });
    }
  }

  if (type === 'CLASSIFY') {
    try {
      if (!classifier) {
        classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      }

      const results = await classifier(text);
      const topResult = results[0];
      const isDistressed = topResult.label === 'NEGATIVE';
      const confidence = Math.round(topResult.score * 100);

      self.postMessage({ 
        status: 'COMPLETE', 
        result: { isDistressed, confidence }
      });
    } catch (err: any) {
      self.postMessage({ status: 'ERROR', error: err.message });
    }
  }
};