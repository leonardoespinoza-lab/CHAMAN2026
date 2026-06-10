import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { MAIL_HOST, MAIL_PASS, MAIL_PORT, MAIL_USER } from '../../env';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import Mail from 'nodemailer/lib/mailer';

@Injectable()
export class MailService {
  private logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

  constructor() {
    this.createTransporter();
  }

  private createTransporter() {
    this.transporter = nodemailer.createTransport({
      host: MAIL_HOST || 'smtp.ethereal.email',
      port: MAIL_PORT || 587,
      secure: MAIL_PORT === 465, // true for 465, false for other ports
      auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
      },
    });
  }

  public async send(
    from: string,
    to: string,
    subject: string,
    text?: string,
    html?: string,
  ) {
    try {
      const mailOptions: Mail.Options = {
        from,
        to,
        subject,
      };
      if (text) mailOptions.text = text;
      if (html) mailOptions.html = html;

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Message sent: ${info.messageId}`);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
