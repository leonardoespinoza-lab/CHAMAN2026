/* eslint-disable @typescript-eslint/no-unused-vars */
import { Logger } from '@nestjs/common';

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

export class LogService {
  private _context = '';

  constructor(private context: string) {
    this._context = context;
  }

  log(msg: any) {
    Logger.log(msg, this._context);
  }

  verbose?(msg: any) {
    Logger.verbose(msg, this._context);
  }

  error(msg: any, context?: string) {
    Logger.error(msg, context || this._context);
  }

  warn(msg: any) {
    Logger.warn(msg, this._context);
  }

  debug?(msg: any) {
    if (true) {
      Logger.debug(msg, this._context);
    }
  }
}
