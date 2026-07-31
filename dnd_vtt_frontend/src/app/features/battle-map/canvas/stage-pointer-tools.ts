import Konva from 'konva';
import { FogTool, cellUnderPointer } from './fog-tool';
import { MeasurementTool, pointerToGridPos } from './measurement-tool';
import { FogToolName, Measurement, MeasureShape } from '../../../core/models/campaign.model';

export interface StagePointerToolsConfig {
  cellSize: () => number;
  activeFogTool: () => FogToolName | null;
  activeMeasureTool: () => MeasureShape | null;
  controlsMap: () => boolean;
  onFogChanged: () => void;
  onMeasureChanged: () => void;
  broadcastMeasure: (measurement: Measurement | null) => void;
}

// Wires the stage's pointer events to whichever of the fog or measurement tools is currently
// active, so battle-map.ts doesn't have to hold this branching inline.
export class StagePointerTools {
  private lastMeasureBroadcast = 0;

  constructor(
    private stage: Konva.Stage,
    private fogTool: FogTool,
    private measurementTool: MeasurementTool,
    private config: StagePointerToolsConfig,
  ) {
    stage.on('mousedown touchstart', () => this.onDown());
    stage.on('mousemove touchmove', () => this.onMove());
    stage.on('mouseup touchend', () => this.onUp());
  }

  private onDown() {
    const cellSize = this.config.cellSize();
    const fogTool = this.config.activeFogTool();
    if (fogTool === 'reveal-brush' || fogTool === 'hide-brush') {
      this.fogTool.beginBrush(fogTool === 'reveal-brush', cellUnderPointer(this.stage, cellSize));
      this.config.onFogChanged();
      return;
    }
    if (fogTool === 'reveal-rect' || fogTool === 'hide-rect') {
      this.fogTool.beginRect(cellUnderPointer(this.stage, cellSize));
      this.config.onFogChanged();
      return;
    }
    const shape = this.config.activeMeasureTool();
    if (!shape) return;
    const { col, row } = pointerToGridPos(this.stage, cellSize);
    this.measurementTool.begin(shape, col, row);
  }

  private onMove() {
    const cellSize = this.config.cellSize();
    if (this.fogTool.isPaintingBrush) {
      this.fogTool.continueBrush(cellUnderPointer(this.stage, cellSize));
      this.config.onFogChanged();
      return;
    }
    if (this.fogTool.isDraggingRect) {
      this.fogTool.updateRect(cellUnderPointer(this.stage, cellSize));
      this.config.onFogChanged();
      return;
    }
    if (!this.measurementTool.current) return;
    const { col, row } = pointerToGridPos(this.stage, cellSize);
    this.measurementTool.update(col, row);
    this.config.onMeasureChanged();

    if (this.config.controlsMap()) {
      const now = Date.now();
      if (now - this.lastMeasureBroadcast > 50) {
        this.lastMeasureBroadcast = now;
        this.config.broadcastMeasure(this.measurementTool.current);
      }
    }
  }

  private onUp() {
    if (this.fogTool.isPaintingBrush) {
      this.fogTool.endBrush();
      this.config.onFogChanged();
      return;
    }
    if (this.fogTool.isDraggingRect) {
      this.fogTool.endRect(this.config.activeFogTool() === 'reveal-rect');
      this.config.onFogChanged();
      return;
    }
    if (!this.measurementTool.current) return;
    this.measurementTool.end();
    this.config.onMeasureChanged();
    if (this.config.controlsMap()) {
      this.config.broadcastMeasure(null);
    }
  }
}
