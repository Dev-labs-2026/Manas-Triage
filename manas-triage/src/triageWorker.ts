import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// Replaced 'any' with the specific pipeline function type or unknown
let classifier: ((text: string) => Promise<Array<{ label: string; score: number }>>) | null = null;

const MODEL_NAME = 'Xenova/bionlp-emotion';

self.onmessage = async (e: MessageEvent) => {
  const { type, text } = e.data;

  if (type === 'INIT') {
    try {
      self.postMessage({ status: 'LOADING', message: 'Loading clinical emotion model...' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      classifier = (await pipeline('text-classification', MODEL_NAME)) as any;
      self.postMessage({ status: 'READY', message: 'Offline AI Ready' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ status: 'ERROR', error: message });
    }
  }

  if (type === 'CLASSIFY') {
    try {
      if (!classifier) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        classifier = (await pipeline('text-classification', MODEL_NAME)) as any;
      }

      if (!classifier) {
        throw new Error('Classifier failed to initialize.');
      }

      const results = await classifier(text);
      const topResult = results[0];
      
      const label = (topResult?.label || '').toLowerCase();
      const confidence = Math.round((topResult?.score || 0) * 100);

      const highDistressLabels = ['fear', 'sadness', 'anger', 'disgust'];
      const isDistressed = highDistressLabels.includes(label);

      self.postMessage({ 
        status: 'COMPLETE', 
        result: { 
          isDistressed, 
          confidence,
          detectedEmotion: label 
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ status: 'ERROR', error: message });
    }
  }
};