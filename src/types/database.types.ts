export interface DatabaseError extends Error {
  code?: number;
  name: string;
}

export interface RepositoryResponse<T> {
  success: boolean;
  data?: T;
  error?: DatabaseError;
}
