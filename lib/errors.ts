export class AppError extends Error {
  status: number;
  detail?: string;
  upstream?: number;

  constructor(message: string, status = 500, detail?: string, upstream?: number) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.detail = detail;
    this.upstream = upstream;
  }
}
