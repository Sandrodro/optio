import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'segments', pathMatch: 'full' },
  {
    path: 'segments',
    loadComponent: () =>
      import('./pages/segment-list/segment-list.component').then(m => m.SegmentListComponent),
  },
  {
    path: 'segments/:id',
    loadComponent: () =>
      import('./pages/segment-detail/segment-detail.component').then(m => m.SegmentDetailComponent),
  },
];
