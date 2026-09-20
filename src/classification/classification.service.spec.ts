import type { TextProvider } from '../providers/ocr-provider';
import { ClassificationService } from './classification.service';

function fakeProvider(response: unknown) {
  const generateJson = jest.fn().mockResolvedValue(response);
  return { provider: { generateJson } as TextProvider, generateJson };
}

describe('ClassificationService', () => {
  describe('categorizeSupplier', () => {
    const categories = [
      { id: 1, name: 'Groceries' },
      { id: 2, name: 'Fuel' },
    ];

    it('returns the category the model picked when it is one of the offered ids', async () => {
      const { provider, generateJson } = fakeProvider({ category_id: 2 });
      const service = new ClassificationService(provider);

      const result = await service.categorizeSupplier('Sonol', categories);

      expect(result).toEqual({ category_id: 2 });
      expect(generateJson).toHaveBeenCalledTimes(1);
    });

    it('rejects a category_id that was not offered', async () => {
      const { provider } = fakeProvider({ category_id: 999 });
      const service = new ClassificationService(provider);

      await expect(
        service.categorizeSupplier('Sonol', categories),
      ).rejects.toThrow(/not one of the offered categories/);
    });

    it('rejects a malformed response', async () => {
      const { provider } = fakeProvider({ category_id: 'not-a-number' });
      const service = new ClassificationService(provider);

      await expect(
        service.categorizeSupplier('Sonol', categories),
      ).rejects.toThrow();
    });
  });

  describe('detectAnomaly', () => {
    it('skips the AI call and returns no anomaly when there are no line items', async () => {
      const { provider, generateJson } = fakeProvider({ has_anomaly: true });
      const service = new ClassificationService(provider);

      const result = await service.detectAnomaly('Fuel', []);

      expect(result).toEqual({ has_anomaly: false });
      expect(generateJson).not.toHaveBeenCalled();
    });

    it('passes through a detected anomaly with its reason', async () => {
      const { provider } = fakeProvider({
        has_anomaly: true,
        reason: 'זוהה פריט מזון בקבלת דלק',
      });
      const service = new ClassificationService(provider);

      const result = await service.detectAnomaly('Fuel', [
        '95 אוקטן - 250 ליטר',
        'שוקולד',
      ]);

      expect(result).toEqual({
        has_anomaly: true,
        reason: 'זוהה פריט מזון בקבלת דלק',
      });
    });

    it('omits reason when nothing is anomalous', async () => {
      const { provider } = fakeProvider({ has_anomaly: false });
      const service = new ClassificationService(provider);

      const result = await service.detectAnomaly('Fuel', ['95 אוקטן']);

      expect(result).toEqual({ has_anomaly: false });
    });
  });
});
