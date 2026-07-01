import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HelperService } from '../servicios/helper';

export const loginGuard: CanActivateFn = (route, state) => {
  const helper = inject(HelperService);
  const token = helper.token;
  if (token) {
    return true;
  }
  const router = inject(Router);
  return router.navigate(['/auth']);
};
