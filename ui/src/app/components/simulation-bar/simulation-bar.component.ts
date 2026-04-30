import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SimulationService } from '../../services/simulation.service';

@Component({
  selector: 'app-simulation-bar',
  imports: [FormsModule],
  templateUrl: './simulation-bar.component.html',
})
export class SimulationBarComponent {
  private sim = inject(SimulationService);

  ffDays = signal(20);
  bulkCount = signal(100);
  ffLoading = signal(false);
  bulkLoading = signal(false);
  toast = signal<string | null>(null);

  fastForward(): void {
    if (this.ffLoading()) return;
    this.ffLoading.set(true);
    this.sim.fastForward(this.ffDays()).subscribe({
      next: r => {
        this.ffLoading.set(false);
        this.showToast(`Fast-forwarded ${r.days}d — ${r.affected_clients} clients updated`);
      },
      error: () => {
        this.ffLoading.set(false);
        this.showToast('Fast-forward failed');
      },
    });
  }

  addClients(): void {
    if (this.bulkLoading()) return;
    this.bulkLoading.set(true);
    this.sim.bulkClients(this.bulkCount()).subscribe({
      next: r => {
        this.bulkLoading.set(false);
        this.showToast(`Added ${r.count} clients`);
      },
      error: () => {
        this.bulkLoading.set(false);
        this.showToast('Bulk import failed');
      },
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3500);
  }
}
