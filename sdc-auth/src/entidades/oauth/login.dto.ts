export interface ILogin {
  grant_type?: string;
  username?: string;
  password?: string;
  refresh_token?: string;
  remember?: boolean;
}
