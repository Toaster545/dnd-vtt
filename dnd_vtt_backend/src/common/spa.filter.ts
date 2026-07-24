import { ExceptionFilter, Catch, NotFoundException, ArgumentsHost } from '@nestjs/common';
import { join } from 'path';
import { Request, Response } from 'express';

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  private readonly indexPath = join(
    process.cwd(), '..', 'dnd_vtt_frontend', 'dist', 'dnd-app', 'browser', 'index.html'
  );

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (req.url.startsWith('/api') || req.url.startsWith('/uploads') || req.url.startsWith('/socket.io')) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
    } else {
      res.sendFile(this.indexPath);
    }
  }
}
