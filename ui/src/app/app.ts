import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SimulationBarComponent } from './components/simulation-bar/simulation-bar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SimulationBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
