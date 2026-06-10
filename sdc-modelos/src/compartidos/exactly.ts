export type Exactly<T, U> = {
  [K in keyof U]: K extends keyof T ? T[K] : never;
};
