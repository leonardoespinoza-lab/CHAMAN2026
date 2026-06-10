import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const loginGuard: CanActivateFn = (route, state) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    return true;
  }
  const router = inject(Router);
  return router.navigate(['/auth']);
};
