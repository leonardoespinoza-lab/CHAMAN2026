import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error: any) => {
        // const message = error.message || 'Error del interno del servidor';
        console.log(error);
        // Otro error
        Logger.error(error, 'Error interceptor');
        throw error;
        // const statusCode = error.statusCode || error.status || 500;
        // throw new HttpException({ message, statusCode }, statusCode);
      }),
    );
  }
}
