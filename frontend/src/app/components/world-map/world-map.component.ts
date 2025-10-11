import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  count: number;
  passCount: number;
  failCount: number;
}

@Component({
  selector: 'app-world-map',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './world-map.component.html',
  styleUrls: ['./world-map.component.scss'],
})
export class WorldMapComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() heatmapData: HeatmapPoint[] = [];
  @Input() loading = false;
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  filterMode: 'all' | 'pass' | 'fail' = 'all';
  private map?: L.Map;
  private markers: L.CircleMarker[] = [];
  private filteredData: HeatmapPoint[] = [];

  ngOnInit() {
    // Fix for default markers in Leaflet
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['heatmapData']) {
      this.applyFilter();
      if (this.map) {
        this.updateHeatmap();
      }
    }
  }

  onFilterChange() {
    this.applyFilter();
    this.updateHeatmap();
  }

  private applyFilter() {
    switch (this.filterMode) {
      case 'pass':
        // Include points with any passes (including mixed results)
        this.filteredData = this.heatmapData.filter((point) => point.passCount > 0);
        break;
      case 'fail':
        // Include points with any fails (including mixed results)
        this.filteredData = this.heatmapData.filter((point) => point.failCount > 0);
        break;
      default:
        this.filteredData = [...this.heatmapData];
    }
  }

  private initializeMap() {
    this.map = L.map('world-map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(this.map);

    // Add initial heatmap if data is available
    if (this.heatmapData.length > 0) {
      this.applyFilter();
      this.updateHeatmap();
    }
  }

  private updateHeatmap() {
    if (!this.map) return;

    // Clear existing markers
    this.markers.forEach((marker) => this.map!.removeLayer(marker));
    this.markers = [];

    // Add new markers
    this.filteredData.forEach((point) => {
      const { latitude, longitude, count, passCount, failCount } = point;

      // Determine color and visual properties based on filter mode and pass/fail ratio
      let color: string;
      let fillOpacity: number = 0.7;
      let radius: number;
      const passRatio = passCount / count;
      const isMixed = passRatio >= 0.2 && passRatio <= 0.8;

      // Base radius calculation (logarithmic scale)
      const baseRadius = Math.max(5, Math.min(30, Math.log10(count + 1) * 8));

      if (this.filterMode === 'pass') {
        if (isMixed) {
          // Mixed results in pass filter: show as green but with reduced opacity and size
          color = '#4caf50';
          fillOpacity = 0.4;
          radius = baseRadius * 0.7;
        } else {
          // Clearly passing results: full green
          color = '#4caf50';
          fillOpacity = 0.7;
          radius = baseRadius;
        }
      } else if (this.filterMode === 'fail') {
        if (isMixed) {
          // Mixed results in fail filter: show as red but with reduced opacity and size
          color = '#f44336';
          fillOpacity = 0.4;
          radius = baseRadius * 0.7;
        } else {
          // Clearly failing results: full red
          color = '#f44336';
          fillOpacity = 0.7;
          radius = baseRadius;
        }
      } else {
        // All mode: use original color logic
        if (passRatio > 0.8) {
          color = '#4caf50'; // Green for mostly pass
        } else if (passRatio < 0.2) {
          color = '#f44336'; // Red for mostly fail
        } else {
          color = '#ff9800'; // Orange for mixed
        }
        radius = baseRadius;
      }

      const marker = L.circleMarker([latitude, longitude], {
        radius,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity,
      });

      // Add popup with details
      const filterInfo =
        this.filterMode !== 'all'
          ? `<p><em>Filter: ${this.filterMode === 'pass' ? 'Pass Only' : 'Fail Only'}</em></p>`
          : '';
      const mixedInfo =
        isMixed && this.filterMode !== 'all' ? '<p><em>(Mixed results - shown with reduced opacity)</em></p>' : '';

      marker.bindPopup(`
        <div class="popup-content">
          <h4>Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</h4>
          ${filterInfo}
          <p><strong>Total Records:</strong> ${count.toLocaleString()}</p>
          <p><strong>DMARC Pass:</strong> ${passCount.toLocaleString()} (${(passRatio * 100).toFixed(1)}%)</p>
          <p><strong>DMARC Fail:</strong> ${failCount.toLocaleString()} (${((1 - passRatio) * 100).toFixed(1)}%)</p>
          ${mixedInfo}
        </div>
      `);

      marker.addTo(this.map!);
      this.markers.push(marker);
    });

    // Fit map to show all markers if there are any
    if (this.markers.length > 0) {
      const group = new L.FeatureGroup(this.markers);
      this.map.fitBounds(group.getBounds().pad(0.1));
    }
  }
}
