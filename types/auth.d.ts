// auth.d.ts
declare module "#auth-utils" {
  interface User {
    id: string;

    givenName: string;
    familyName: string;
    emailAddress: string;

    emailVerified: boolean;
  }

  interface UserSession {
    userSessionField: string;
  }

  interface SecureSessionData {
    secureSessionField: string;
  }
}

export {};
