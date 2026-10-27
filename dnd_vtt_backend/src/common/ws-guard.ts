import { HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

// Services throw HTTP exceptions; over a websocket those surface to the client as an opaque
// "Internal server error". Run gateway-side checks through this so the client gets a structured
// `{ status, message }` it can tell apart (404 vs 403).
export async function wsGuard<T>(check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof HttpException) {
      throw new WsException({
        status: error.getStatus(),
        message: error.message,
      });
    }
    throw error;
  }
}
