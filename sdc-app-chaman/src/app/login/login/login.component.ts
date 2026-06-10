import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { GoogleLoginOptions, SocialLogin } from '@capgo/capacitor-social-login';
import { Subscription } from 'rxjs';
import { LoginService } from '../../auxiliares/http/login.service';
import { HelperService } from '../../auxiliares/servicios/helper';
import { SharedModule } from '../../auxiliares/shared.module';
import { VERSION } from '../../environments/environment';

export interface ResSocialLogin {
  provider?: string;
  result?: Result;
}

export interface Result {
  accessToken?: AccessToken;
  profile?: Profile;
  idToken?: string;
  responseType?: string;
}

export interface AccessToken {
  token?: string;
}

export interface Profile {
  id?: string;
  name?: string;
  email?: string;
  familyName?: string;
  givenName?: string;
  imageUrl?: string;
}

@Component({
  selector: 'app-login',
  imports: [SharedModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit, OnDestroy {
  public loading = false;
  public form = this.createForm();
  public version = VERSION;
  private user$?: Subscription;
  private platform = Capacitor.getPlatform();  

  constructor(
    private loginService: LoginService,
    private router: Router,
    public helper: HelperService
  ) {}

  private createForm() {
    return new FormGroup({
      username: new FormControl<string>('', Validators.required),
      password: new FormControl<string>('', Validators.required),
      remember: new FormControl<boolean>(false),
    });
  }

  public async onSubmit() {
    this.loading = true;
    try {
      const username = this.form.get('username')?.value as string;
      const password = this.form.get('password')?.value as string;
      const remember = this.form.get('remember')?.value as boolean;
      await this.loginService.login(username, password, remember);
      this.router.navigateByUrl('/');
    } catch (error) {
      this.helper.notifError(error);
    }
    this.loading = false;
  }
  
  @HostListener('document:keyup.enter', ['$event'])
  handleEnterKey(event: KeyboardEvent) {
    if (!this.form.valid) {
      return;
    }
    this.onSubmit();
  }

  private async googleLoginAndroid(idToken: string): Promise<void> {
    if (idToken) {
      this.loading = true;
      const remember = this.form.get('remember')?.value as boolean;
      await this.loginService.loginGoogle(idToken, remember);
      this.loading = false;
      this.router.navigateByUrl('/mapa');
    }
  }

  private async googleLoginIOS(idToken: string): Promise<void> {
    if (idToken) {
      this.loading = true;
      const remember = this.form.get('remember')?.value as boolean;
      await this.loginService.loginGoogleApple(idToken, remember);
      this.loading = false;
      this.router.navigateByUrl('/mapa');
    }
  }

  private async loginAndroid() {
    this.loading = true;
    try {
      const options: GoogleLoginOptions = {};
      if (this.platform !== 'ios') {
        options.scopes = ['email', 'profile'];
      }
      const res = await SocialLogin.login({
        provider: 'google',
        options,
      });
      const response = res as ResSocialLogin;
      if (response.result?.idToken) {
        const idToken = response.result?.idToken;
        console.log('ID Token:', idToken);
        await this.googleLoginAndroid(idToken);
      } else {
        console.error('Error: No profile found in response');
        this.helper.notifError('No profile found in response');
      }
    } catch (error) {
      console.error('Error during login:', error);
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  private async loginIOS() {
    this.loading = true;
    try {
      const options: GoogleLoginOptions = {
        scopes: ['email', 'profile'],
      };
      const res = await SocialLogin.login({
        provider: 'google',
        options,
      });
      const response = res as ResSocialLogin;
      if (response.result?.idToken) {
        const idToken = response.result?.idToken;
        console.log('ID Token:', idToken);
        await this.googleLoginIOS(idToken);
      } else {
        console.error('Error: No profile found in response');
        this.helper.notifError('No profile found in response');
      }
    } catch (error) {
      console.error('Error during login:', error);
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public async loginGoogle() {
    if (this.platform !== 'ios') {
      console.log('Android platform detected');
      await this.loginAndroid();
    } else {
      console.log('iOS platform detected');
      await this.loginIOS();
    }
  }

  async ngOnInit() {
    if (this.platform !== 'ios') {
      try {
        console.log('Android platform detected');
        console.log('Initializing SocialLogin for Android');
        await SocialLogin.initialize({
          google: {
            webClientId: '160697268426-idg2tdtfb6d1gn16jf1a1c40u3pviio1.apps.googleusercontent.com',
          },
        });
        console.log('SocialLogin initialized for Android');
        console.log('Waiting for user to login...');
      } catch (error) {
        console.error('Error initializing SocialLogin for Android:', error);
        this.helper.notifError(error);
      }
    } else {
      try {
        console.log('iOS platform detected');
        console.log('Initializing SocialLogin for iOS');
        await SocialLogin.initialize({
          google: {
            iOSClientId: '160697268426-4rdgd314anp3p7f7d9nrnvb69cnipf1q.apps.googleusercontent.com',
          },
        });
        console.log('SocialLogin initialized for iOS');
        console.log('Waiting for user to login...');
      } catch (error) {
        console.error('Error initializing SocialLogin for iOS:', error);
        this.helper.notifError(error);
      }
    }
  }

  async ngOnDestroy() {
    this.user$?.unsubscribe();
  }
}
