import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Either the pool or an open transaction; services accept both so callers can compose them. */
export type Db = Sql | Tx;

export function createDb(url: string, max = 10): Sql {
  return postgres(url, {
    max,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
    transform: { undefined: null },
  });
}

/** Runs fn inside a transaction, reusing the caller's transaction when one is passed. */
export async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ('savepoint' in db) return fn(db as Tx);
  return (db as Sql).begin(tx => fn(tx)) as Promise<T>;
}
