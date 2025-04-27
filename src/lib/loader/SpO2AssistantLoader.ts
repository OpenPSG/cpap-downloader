// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { EDFWriter } from "edf-ts";
import { EDFFile, Loader, Session } from "./Loader";

interface SpO2AssistantHeaderInfo {
  start: Date;
  samples: number;
  headerOffset: number;
}

class SpO2AssistantLoader implements Loader {
  name = "SpO2Assistant";

  async validateDirectory(directory: Map<string, File>): Promise<boolean> {
    // TODO: try parsing the first file to check if it is a valid SpO2 Assistant file.
    return Array.from(directory.keys()).some((path) =>
      path.toLowerCase().endsWith(".spo2"),
    );
  }

  async sessions(
    directory: Map<string, File>,
    onProgress?: (percent: number) => void,
  ): Promise<Session[]> {
    const sessions: Session[] = [];
    const entries = Array.from(directory.entries());

    for (let i = 0; i < entries.length; i++) {
      const [path, file] = entries[i];
      if (!path.toLowerCase().endsWith(".spo2")) continue;

      const buffer = await file.arrayBuffer();
      const headerInfo = this.parseHeader(buffer);
      if (!headerInfo) continue;

      const { start, samples } = headerInfo;
      const end = new Date(start.getTime() + samples * 1000);
      const files = new Map<string, File>([[path, file]]);

      sessions.push({ start, end, files });

      if (onProgress) onProgress(Math.round(((i + 1) * 100) / entries.length));
    }

    return sessions;
  }

  async loadSession(
    session: Session,
    onProgress?: (percent: number) => void,
  ): Promise<EDFFile> {
    const spo2File = Array.from(session.files.values())[0];
    const buffer = await spo2File.arrayBuffer();
    const headerInfo = this.parseHeader(buffer);

    if (!headerInfo) {
      throw new Error("Invalid SpO2 file header");
    }

    const { start, samples, headerOffset } = headerInfo;

    let cursor = headerOffset + 228;
    const valuesSpO2: number[] = [];
    const valuesPulse: number[] = [];

    const fileSize = buffer.byteLength;
    const bytesPerRecord = (fileSize - cursor) / samples;
    const view = new DataView(buffer);

    for (let i = 0; i < samples; i++) {
      if (bytesPerRecord > 2) {
        cursor += bytesPerRecord - 2;
      }

      if (cursor + 2 > fileSize) break;

      const spo2 = view.getUint8(cursor);
      const pulse = view.getUint8(cursor + 1);

      if (spo2 === 0x7f && pulse === 0xff) {
        valuesSpO2.push(0);
        valuesPulse.push(0);
      } else {
        valuesSpO2.push(spo2);
        valuesPulse.push(pulse);
      }

      cursor += 2;

      if (onProgress && i % 500 === 0) {
        onProgress(Math.round(((i + 1) * 100) / samples));
      }
    }

    const header = {
      patientId: EDFWriter.patientId({}),
      recordingId: EDFWriter.recordingId({
        startDate: start,
      }),
      startTime: start,
      dataRecords: Math.floor(samples / 30),
      recordDuration: 30,
      signalCount: 2,
      signals: [
        {
          label: "SpO2",
          transducerType: "PPG oximeter",
          physicalDimension: "%",
          physicalMin: 0,
          physicalMax: 100,
          digitalMin: 0,
          digitalMax: 255,
          prefiltering: "",
          samplesPerRecord: 30,
        },
        {
          label: "Pulse",
          transducerType: "PPG pulse sensor",
          physicalDimension: "bpm",
          physicalMin: 0,
          physicalMax: 250,
          digitalMin: 0,
          digitalMax: 255,
          prefiltering: "",
          samplesPerRecord: 30,
        },
      ],
    };

    return {
      header,
      values: [valuesSpO2, valuesPulse],
      annotations: [],
    };
  }

  private parseHeader(buffer: ArrayBuffer): SpO2AssistantHeaderInfo | null {
    const view = new DataView(buffer);
    const pos = view.getUint16(0, true);
    const headerOffset = pos;

    if (headerOffset + 228 > buffer.byteLength) return null;

    const year = view.getUint32(headerOffset + 200, true);
    const month = view.getUint32(headerOffset + 204, true);
    const day = view.getUint32(headerOffset + 208, true);
    const hour = view.getUint32(headerOffset + 212, true);
    const minute = view.getUint32(headerOffset + 216, true);
    const second = view.getUint32(headerOffset + 220, true);
    const samples = view.getUint32(headerOffset + 224, true);

    // TODO: how does the timezone work here?
    const start = new Date(year, month - 1, day, hour, minute, second);

    return { start, samples, headerOffset };
  }
}

export default SpO2AssistantLoader;
