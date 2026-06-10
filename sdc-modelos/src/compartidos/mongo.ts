export interface UpdateResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of documents that matched the filter */
  matchedCount: number;
  /** The number of documents that were modified */
  modifiedCount: number;
  /** The number of documents that were upserted */
  upsertedCount: number;
  /** The identifier of the inserted document if an upsert took place */
  upsertedId: any;
}

export interface DeleteResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined. */
  acknowledged: boolean;
  /** The number of documents that were deleted */
  deletedCount: number;
}

export interface BulkWriteResult {
  result: BulkResult;
}

export declare interface BulkWriteOperationError {
  index: number;
  code: number;
  errmsg: string;
  errInfo: any; // Document;
  op: any; // Document | UpdateStatement | DeleteStatement
}

export interface WriteError {
  err: BulkWriteOperationError;
}

export declare interface BulkResult {
  ok: number;
  writeErrors: WriteError[];
  // writeConcernErrors: WriteConcernError[];
  writeConcernErrors: any[];
  insertedIds: any[]; // Document[];
  nInserted: number;
  nUpserted: number;
  nMatched: number;
  nModified: number;
  nRemoved: number;
  upserted: any[]; // Document[];
  opTime?: any; // Document;
}
