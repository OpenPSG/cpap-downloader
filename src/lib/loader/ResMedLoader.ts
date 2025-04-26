// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { EDFFile, Loader, Session } from "./Loader";
import { EDFReader, EDFWriter } from "edf-ts";
import {
  EDFFileWithDuration,
  canonicalizeLabels,
  filterSignals,
  findCommonTimeRange,
  mergeSignals,
} from "./Utils";
import IntervalTree from "node-interval-tree";

// ResMed had the brilliant idea of internationalizing their signal labels,
// rather than just doing it in the frontend.
const CANONICAL_NAMES = new Map<string, string[]>([
  ["Flow", ["Flow.40ms"]],
  ["MaskPressure", ["Press.40ms", "MaskPress.2s"]],
  ["RespEvent", ["TrigCycEvt.40ms"]],
  ["InspPressure", ["Press.2s", "IPAP", "S.BL.IPAP", "S.S.IPAP"]],
  [
    "ExpPressure",
    ["EprPress.2s", "EPAP", "S.BL.EPAP", "EPRPress.2s", "S.S.EPAP"],
  ],
  [
    "Leak",
    [
      "Leck",
      "Fuites",
      "Fuite",
      "Fuga",
      "泄漏气",
      "Lekk",
      "Läck",
      "LÃ¤ck",
      "Leak.2s",
      "Sızıntı",
    ],
  ],
  ["RespRate", ["AF", "FR", "RespRate.2s"]],
  ["MinuteVent", ["VM", "MinVent.2s"]],
  ["TidalVolume", ["VC", "TidVol.2s"]],
  ["InspExpRatio", ["IERatio.2s"]],
  ["Snore", ["Snore.2s"]],
  ["FlowLim", ["FlowLim.2s"]],
  ["InspTime", ["Ti.2s", "B5ITime.2s"]],
  ["ExpTime", ["B5ETime.2s"]],
  ["TgtMinuteVent", ["TgtVent.2s"]],
  ["Pulse", ["Puls", "Pouls", "Pols", "Pulse.1s", "Nabiz"]],
  ["SpO2", ["SpO2.1s"]],
]);

// ResMedLoader is a class that implements the Loader interface for ResMed devices.
class ResMedLoader implements Loader {
  name = "ResMed";

  // Validate that the directory contains the necessary files for this loader.
  async validateDirectory(directory: Map<string, File>): Promise<boolean> {
    // Check for the presence of a ResMed summary file (STR.edf).
    return Array.from(directory.keys()).some(
      (path) => path.toLowerCase() === "str.edf",
    );
  }

  // Get the list of therapy sessions stored in the directory.
  async sessions(
    directory: Map<string, File>,
    onProgress?: (percent: number) => void,
  ): Promise<Session[]> {
    const sessions: Session[] = [];

    const sessionFiles = Array.from(directory.entries()).filter(([path]) =>
      path.toLowerCase().endsWith("_brp.edf"),
    );

    let processedFiles = 0;

    for (const [path, file] of sessionFiles) {
      const buffer = await file.arrayBuffer();
      const reader = new EDFReader(new Uint8Array(buffer));
      const header = reader.readHeader();

      const dirPath = path.split("/").slice(0, -1).join("/");
      const files = new Map(
        Array.from(directory.entries())
          .filter(
            ([p]) =>
              p.startsWith(dirPath + "/") && p.toLowerCase().endsWith(".edf"),
          )
          .map(([p, f]) => [p.slice(dirPath.length + 1), f]),
      );

      if (header.dataRecords <= 0) {
        // Either no data or corrupted, skip it.
        continue;
      }

      const endOffset = reader.getRecordTimestamp(header.dataRecords - 1);

      sessions.push({
        start: header.startTime,
        end: new Date(
          header.startTime.getTime() +
            (endOffset + header.recordDuration) * 1000,
        ),
        files,
      });

      if (onProgress) {
        processedFiles++;
        onProgress(Math.round((processedFiles / sessionFiles.length) * 100));
      }
    }

    return sessions;
  }

  // Load a specific session and return the processed data in EDF+ format.
  async loadSession(
    session: Session,
    onProgress?: (percent: number) => void,
  ): Promise<EDFFile> {
    // I believe ResMed uses a fixed record duration of 60 seconds for all EDF files.
    // We may need to check on this in the future.
    const recordDuration = 60;

    let processedFiles = 0;

    const tree = new IntervalTree<EDFFileWithDuration>();

    // Load the session files into the tree.
    for (const file of session.files.values()) {
      const buffer = await file.arrayBuffer();
      const reader = new EDFReader(new Uint8Array(buffer));

      const header = reader.readHeader();

      if (
        header.recordDuration !== recordDuration &&
        header.recordDuration !== 0
      ) {
        throw new Error(
          `Unexpected record duration: ${header.recordDuration} seconds. Expected ${recordDuration} seconds.`,
        );
      }

      let values = header.signals
        .map((signal, i) => ({ signal, i }))
        .map(({ i }) => reader.readSignal(i));

      // Filter out the EDF Annotations and CRC signals.
      const { filteredSignals, filteredValues } = filterSignals(
        header.signals,
        values,
        {
          disallowedLabels: ["EDF Annotations", "Crc16", ""],
        },
      );
      header.signals = filteredSignals;
      values = filteredValues;

      // Canonicalize the signal labels.
      header.signals = canonicalizeLabels(header.signals, CANONICAL_NAMES);

      const annotations = reader.readAnnotations().map((ann) => ({
        ...ann,
        // Resmed seems to use the onset time as the end time for some annotations.
        onset: Math.max(0, ann.onset - (ann.duration ?? 0)),
      }));

      const start = header.startTime.getTime();

      if (header.dataRecords <= 0) {
        // Either no data or corrupted, skip it.
        continue;
      }

      const endOffset = reader.getRecordTimestamp(header.dataRecords - 1);
      let end = start + (endOffset + header.recordDuration) * 1000;

      if (header.reserved === "EDF+D") {
        end = session.end.getTime();
      }

      tree.insert(start, end, {
        header,
        values,
        annotations,
        duration: (end - start) / 1000,
      });

      if (onProgress) {
        processedFiles++;
        onProgress(Math.round((processedFiles / session.files.size) * 100));
      }
    }

    // Find the files that overlap with the session start and end times.
    const overlappingFiles = tree.search(
      session.start.getTime(),
      session.end.getTime(),
    );

    // Find the common start and end times for the overlapping files.
    const { start: overlappingStart, end: overlappingEnd } =
      findCommonTimeRange(overlappingFiles);

    // Merge the signals and values from the overlapping files.
    const { signals, values, annotations } = mergeSignals(
      overlappingStart,
      overlappingEnd,
      overlappingFiles,
    );

    return this.postProcess({
      header: {
        patientId: EDFWriter.patientId({}),
        recordingId: EDFWriter.recordingId({
          startDate: overlappingStart,
        }),
        startTime: overlappingStart,
        dataRecords: Math.ceil(
          (overlappingEnd.getTime() - overlappingStart.getTime()) /
            (recordDuration * 1000),
        ),
        recordDuration,
        signalCount: signals.length,
        signals,
      },
      values,
      annotations,
    });
  }

  postProcess(file: EDFFile): EDFFile {
    // Remove SpO2 signal if there are no valid values (eg. the o2 sensor is
    // not fitted).
    const spo2Signal = file.header.signals.find((signal) =>
      signal.label.toLowerCase().includes("spo2"),
    );
    if (spo2Signal) {
      const index = file.header.signals.indexOf(spo2Signal);
      const values = file.values[index];

      const hasValidValues = values.some((value) => value > 0);

      // Remove the SpO2 signal if there aren't any valid values.
      if (!hasValidValues) {
        file.header.signals.splice(index, 1);
        file.values.splice(index, 1);
        file.header.signalCount--;
      }
    }

    // Remove Pulse signal if there are no valid values (eg. the pulse sensor is
    // not fitted).
    const pulseSignal = file.header.signals.find((signal) =>
      signal.label.toLowerCase().includes("pulse"),
    );
    if (pulseSignal) {
      const index = file.header.signals.indexOf(pulseSignal);
      const values = file.values[index];

      const hasValidValues = values.some((value) => value > 0);

      // Remove the Pulse signal if there aren't any valid values.
      if (!hasValidValues) {
        file.header.signals.splice(index, 1);
        file.values.splice(index, 1);
        file.header.signalCount--;
      }
    }

    // TODO: Add any additional post-processing steps here.

    return {
      ...file,
    };
  }
}

export default ResMedLoader;
