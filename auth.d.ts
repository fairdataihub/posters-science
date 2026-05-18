declare module "#auth-utils" {
  interface User {
    id: string;
    emailAddress: string;
    emailVerified: boolean;
    familyName: string;
    givenName: string;
    role: string;
  }
}

export {};
