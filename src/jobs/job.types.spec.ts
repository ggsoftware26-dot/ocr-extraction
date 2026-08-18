import { jobProcessingTimeMs } from './job.types';

describe('jobProcessingTimeMs', () => {
  it('returns null when processing has not started', () => {
    expect(jobProcessingTimeMs({})).toBeNull();
  });

  it('uses finishedOn when the job is done', () => {
    expect(jobProcessingTimeMs({ processedOn: 1_000, finishedOn: 1_450 })).toBe(
      450,
    );
  });
});
