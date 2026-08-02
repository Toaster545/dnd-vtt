import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink, MatIconModule, MatTooltipModule],
  templateUrl: './page-header.html',
})
export class PageHeaderComponent {
  title = input.required<string>();
  backRoute = input('/home');
}
