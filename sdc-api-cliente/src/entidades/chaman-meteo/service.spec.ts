import { ChamanMeteoService } from './service';

describe('ChamanMeteoService', () => {
  const repository = {
    hourly: jest.fn(),
    daily: jest.fn(),
  };
  const service = new ChamanMeteoService(repository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards trimmed hourly filters without changing pagination', () => {
    service.hourly(
      ' pilot-grid ',
      '48',
      '5',
      ' 2026-08-01T00:00:00Z ',
      ' 2026-09-01T00:00:00Z ',
    );

    expect(repository.hourly).toHaveBeenCalledWith(
      'pilot-grid',
      48,
      5,
      '2026-08-01T00:00:00Z',
      '2026-09-01T00:00:00Z',
    );
  });

  it('forwards daily filters and preserves undefined pagination defaults', () => {
    service.daily(
      'pilot-grid',
      undefined,
      undefined,
      '2026-08-01',
      '2026-09-01',
    );

    expect(repository.daily).toHaveBeenCalledWith(
      'pilot-grid',
      undefined,
      undefined,
      '2026-08-01',
      '2026-09-01',
    );
  });
});
