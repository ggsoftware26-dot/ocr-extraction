export type OcrJobData = {
  jobId: string;
  objectKey: string;
  mimeType: string;
  originalName: string;
  webhookUrl?: string;
};

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export function jobProcessingTimeMs(job: {
  processedOn?: number;
  finishedOn?: number;
}): number | null {
  if (!job.processedOn) {
    return null;
  }
  const end = job.finishedOn ?? Date.now();
  return Math.max(0, end - job.processedOn);
}
