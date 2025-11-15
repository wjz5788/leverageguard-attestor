import 'cookie-session';

declare module 'cookie-session' {
  interface CookieSessionObject {
    walletAddress?: string;
    siweNonce?: string;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    session?: import('cookie-session').CookieSessionObject | null;
  }
}
