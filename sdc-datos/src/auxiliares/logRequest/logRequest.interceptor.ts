/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { IUsuario } from 'modelos/src';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PREFIX_PATH } from '../../env';

interface IReqData {
  start: number;
  app: string;
  appVersion: string;
  appType: string;
  method: string;
  path: string;
  query: any;
  body: any;
  contentType: string;
}

type ColorTextFn = (text: string) => string;

const isColorAllowed = () => !process.env.NO_COLOR;
const colorIfAllowed = (colorFn: ColorTextFn) => (text: string) =>
  isColorAllowed() ? colorFn(text) : text;

const yellow = colorIfAllowed((text: string) => `\x1B[38;5;3m${text}\x1B[39m`);
const green = colorIfAllowed((text: string) => `\x1B[38;5;2m${text}\x1B[39m`);
const red = colorIfAllowed((text: string) => `\x1B[38;5;1m${text}\x1B[39m`);
const magentaBright = colorIfAllowed(
  (text: string) => `\x1B[38;5;13m${text}\x1B[39m`,
);
const cyanBright = colorIfAllowed(
  (text: string) => `\x1B[38;5;14m${text}\x1B[39m`,
);

const white = colorIfAllowed((text: string) => `\x1B[38;5;15m${text}\x1B[39m`);
const green2 = colorIfAllowed((text: string) => `\x1B[38;5;70m${text}\x1B[39m`);
const orange = colorIfAllowed(
  (text: string) => `\x1B[38;5;202m${text}\x1B[39m`,
);
const blink = colorIfAllowed((text: string) => `\x1B[5m${text}\x1B[0m`);
const bold = colorIfAllowed((text: string) => `\x1B[1m${text}\x1B[0m`);
const faint = colorIfAllowed((text: string) => `\x1B[2m${text}\x1B[0m`);

@Injectable()
export class LogRequestInterceptor implements NestInterceptor {
  private logger = new Logger(LogRequestInterceptor.name);

  private log(context: ExecutionContext, data: IReqData): void {
    const excludedPaths = ['/health', `${PREFIX_PATH}/health`];

    const req: Request = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();

    const user = res?.locals?.token?.user as IUsuario;
    const method = data.method || req?.method;
    const path = data.path || req?.url?.split('?')[0];
    const body =
      data.body && Object.keys(data.body).length ? data.body : req?.body;
    const query =
      data.query && Object.keys(data.query).length ? data.query : req?.query;
    const time = Date.now() - data.start;

    if (excludedPaths.includes(path)) return;

    if (data.contentType?.includes('multipart/form-data')) {
      for (const key in body) {
        try {
          body[key] = JSON.parse(body[key]);
        } catch (error) {}
      }
    }

    for (const key in query) {
      try {
        query[key] = JSON.parse(query[key]);
      } catch (error) {}
    }

    const ruta = orange(`[${method}] ${path}`);

    let msg = `${ruta}`;

    if (body && Object.keys(body).length)
      msg += ` [body: ${JSON.stringify(body)}]`;
    if (query && Object.keys(query).length)
      msg += ` [query: ${JSON.stringify(query)}]`;
    if (user) msg += magentaBright(` [${user.username}]`);

    if (time <= 500) msg += green(` [${time}ms]`);
    else if (time <= 1000) msg += yellow(` [${time}ms]`);
    else msg += red(` [${time}ms]`);

    this.logger.verbose(msg);
  }

  private handleError(error: any): any {
    const message =
      error.response?.message ||
      error.message ||
      'Error del interno del servidor';

    const statusCode = error.response?.statusCode || error.status || 500;

    if (error.status === 400) {
      Logger.error(message, `Error interceptor ${statusCode}`);
      throw new BadRequestException(message);
    } else {
      Logger.error(message, `Error interceptor ${statusCode}`);
      throw new HttpException({ message, statusCode }, statusCode);
    }
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    const req: Request = context.switchToHttp().getRequest();

    const data: IReqData = {
      start: Date.now(),
      app: req?.headers?.app as string,
      appVersion: req?.headers?.appversion as string,
      appType: req?.headers?.apptype as string,
      method: req?.method,
      path: req?.url?.split('?')[0],
      query: req?.query,
      body: req.body,
      contentType: req?.headers?.['content-type'],
    };

    return next.handle().pipe(
      // Se ejecuta cuando termina el request exitosamente, no modifica la respuesta
      tap(() => {
        this.log(context, data);
      }),
      // Se ejecuta cuando hay un error
      catchError((error: any) => {
        this.log(context, data);
        return this.handleError(error);
      }),
    );
  }
}
