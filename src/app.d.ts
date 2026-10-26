declare global {
  namespace App {
    interface Locals {
      user: { id: string; displayName: string; email: string; color: number };
    }
  }
}

export {};
