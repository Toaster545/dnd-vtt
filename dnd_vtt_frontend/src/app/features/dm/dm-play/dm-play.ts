import { Component, inject, signal, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SessionService } from '../../../core/services/session.service';
import { Session } from '../../../core/models/session.model';

@Component({
  selector: 'app-dm-play',
  imports: [MatIconModule],
  templateUrl: './dm-play.html',
  styleUrl: './dm-play.scss',
})
export class DmPlayComponent implements OnInit {
  private sessionService = inject(SessionService);
  sessions = signal<Session[]>([]);
  selected = signal<Session | null>(null);

  async ngOnInit() {
    this.sessions.set(await this.sessionService.getAll());
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
