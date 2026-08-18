import { PDFDocument } from 'pdf-lib';

export type PdfBatch = {
  bytes: Buffer;
  pageStart: number;
  pageCount: number;
};

export async function countPdfPages(bytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function splitPdfIntoBatches(
  bytes: Buffer,
  batchSize: number,
): Promise<PdfBatch[]> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = source.getPageCount();
  if (total === 0) {
    return [];
  }

  const batches: PdfBatch[] = [];
  for (let start = 0; start < total; start += batchSize) {
    const end = Math.min(start + batchSize, total);
    const dest = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await dest.copyPages(source, indices);
    for (const page of pages) {
      dest.addPage(page);
    }
    const saved = await dest.save();
    batches.push({
      bytes: Buffer.from(saved),
      pageStart: start + 1,
      pageCount: end - start,
    });
  }
  return batches;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}
