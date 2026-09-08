import {
  PrivacyInternalGuard,
  PrivacyRequestsService,
  PrivacyRequestSchema,
} from './privacy-request';

describe('Privacy requests: persistence without account mutation', () => {
  const id = '1234567890abcdef12345678';
  const ticket = {
    _id: id,
    status: 'pending',
    requestedAt: new Date('2026-09-07T12:00:00Z'),
    respondBy: new Date('2026-10-07T12:00:00Z'),
  };
  const query = (result: any) => ({
    lean: () => ({ exec: () => Promise.resolve(result) }),
  });
  let repository: any;
  let service: PrivacyRequestsService;
  beforeEach(() => {
    repository = {
      findOneAndUpdate: jest.fn(() => query(ticket)),
      findById: jest.fn(() => query(ticket)),
    };
    service = new PrivacyRequestsService(repository);
  });
  it('uses a deterministic string primary key to avoid duplicate tickets', () => {
    expect(PrivacyRequestSchema.path('_id').instance).toBe('String');
  });
  it('stores only server-generated timestamps and policy metadata', async () => {
    await service.request(id);
    const [filter, update, options] = repository.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: id });
    expect(Object.keys(update)).toEqual(['$setOnInsert']);
    expect(update.$setOnInsert.status).toBe('pending');
    expect(
      update.$setOnInsert.respondBy.getTime() -
        update.$setOnInsert.requestedAt.getTime(),
    ).toBe(30 * 86400000);
    expect(options).toEqual({ upsert: true, new: true, runValidators: true });
  });
  it('returns the original ticket when the user retries', async () => {
    expect(await service.request(id)).toBe(ticket);
    expect(await service.request(id)).toBe(ticket);
  });
  it('recovers a simultaneous primary-key collision without replacing the original deadline', async () => {
    repository.findOneAndUpdate.mockReturnValue({
      lean: () => ({ exec: () => Promise.reject({ code: 11000 }) }),
    });
    expect(await service.request(id)).toBe(ticket);
  });
  it('propagates database failures instead of reporting false success', async () => {
    repository.findOneAndUpdate.mockReturnValue({
      lean: () => ({ exec: () => Promise.reject(new Error('offline')) }),
    });
    await expect(service.request(id)).rejects.toThrow('offline');
  });
  it.each(['other', '../usuarios', '123', ''])(
    'rejects invalid account IDs %s',
    async (value) => {
      await expect(service.request(value)).rejects.toThrow();
      expect(repository.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );
  it('paginates the queue with a fixed upper bound', async () => {
    const cursor: any = {
      sort: jest.fn(() => cursor),
      skip: jest.fn(() => cursor),
      limit: jest.fn(() => cursor),
      ...query(Array(51).fill(ticket)),
    };
    repository.find = jest.fn(() => cursor);
    const result = await service.list('2');
    expect(cursor.skip).toHaveBeenCalledWith(100);
    expect(cursor.limit).toHaveBeenCalledWith(51);
    expect(result.records).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    await expect(service.list('-1')).rejects.toThrow();
  });
});

describe('Privacy internal service authentication', () => {
  const original = process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
  const valid = 'test-only-not-a-real-secret-1234567890';
  const context = (token: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-privacy-internal-token': token } }),
      }),
    }) as any;
  afterEach(() => {
    if (original === undefined)
      delete process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
    else process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN = original;
  });
  it('rejects absent configuration', () => {
    delete process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
    expect(() =>
      new PrivacyInternalGuard().canActivate(context(valid)),
    ).toThrow();
  });
  it.each([undefined, [], '', 'wrong', 'x'.repeat(valid.length)])(
    'rejects invalid tokens %j',
    (token) => {
      process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN = valid;
      expect(() =>
        new PrivacyInternalGuard().canActivate(context(token)),
      ).toThrow();
    },
  );
  it('accepts only the configured service token', () => {
    process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN = valid;
    expect(new PrivacyInternalGuard().canActivate(context(valid))).toBe(true);
  });
});
