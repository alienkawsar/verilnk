import 'express';

declare module 'express' {
  export interface Request {
    rawBody?: Buffer;
    rawBodyText?: string;
  }
}
