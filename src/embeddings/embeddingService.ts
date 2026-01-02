import { pipeline } from '@xenova/transformers';

let embedderPromise: Promise<any> | null = null;

async function getEmbedder(): Promise<any> {
  if (!embedderPromise) {
    // all-MiniLM-L6-v2, 384 dimensions, JS port
    embedderPromise = pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    );
  }
  return embedderPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = (await extractor(text, {
    pooling: 'mean',
    normalize: true,
  })) as any;
  // output.data is a Float32Array of length 384
  const data: Float32Array = output.data;
  return Array.from(data);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}


