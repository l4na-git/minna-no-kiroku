/** データ層が投げるエラー。メッセージに記録の本文を含めない。 */
export type DbErrorCode = 'unauthenticated' | 'invalid' | 'not_found' | 'forbidden' | 'conflict';

export class DbError extends Error {
  constructor(
    readonly code: DbErrorCode,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 未知・不正な利用者ID。呼び出し元は 401 相当に扱う。 */
export class AuthenticationError extends DbError {
  constructor(message = '認証済みの利用者が見つかりません') {
    super('unauthenticated', message);
  }
}

/** 入力の不正。`field` は入力項目名（本文の値は入れない）。 */
export class ValidationError extends DbError {
  constructor(
    readonly field: string,
    message: string
  ) {
    super('invalid', message);
  }
}

export class NotFoundError extends DbError {
  constructor(message = '見つかりません') {
    super('not_found', message);
  }
}

/** 他人の記録の編集・削除など。 */
export class ForbiddenError extends DbError {
  constructor(message = '権限がありません') {
    super('forbidden', message);
  }
}

/** 重複・運用者の確認が必要な衝突。 */
export class ConflictError extends DbError {
  constructor(
    readonly reason: 'duplicate_category' | 'email_in_use' | 'subject_in_use' | 'stale_entry',
    message: string
  ) {
    super('conflict', message);
  }
}
