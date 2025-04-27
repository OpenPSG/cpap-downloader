// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { describe, it, expect, beforeEach } from "vitest";
import SpO2AssistantLoader from "./SpO2AssistantLoader";
import path from "path";
import { loadDirectoryFromFolder } from "./TestUtils";

describe("SpO2AssistantLoader", () => {
  let loader: SpO2AssistantLoader;

  beforeEach(() => {
    loader = new SpO2AssistantLoader();
  });

  it("should have the correct name", () => {
    expect(loader.name).toBe("SpO2Assistant");
  });

  it("should validate directory correctly", async () => {
    let directory = await loadDirectoryFromFolder(
      path.join(__dirname, "__fixtures__/spo2assistant"),
    );

    const result = await loader.validateDirectory(directory);
    expect(result).toBe(true);

    // Test with an invalid directory
    directory = new Map<string, File>();

    const invalidResult = await loader.validateDirectory(directory);
    expect(invalidResult).toBe(false);
  });

  it("should find sessions correctly", async () => {
    const directory = await loadDirectoryFromFolder(
      path.join(__dirname, "__fixtures__/spo2assistant"),
    );

    const sessions = await loader.sessions(directory);

    sessions.sort((a, b) => b.start.getTime() - a.start.getTime());

    expect(sessions.length).toBe(1);
    expect(sessions[0].start).toEqual(new Date(2024, 9, 13, 23, 22, 52));
    expect(sessions[0].end).toEqual(new Date(2024, 9, 14, 2, 43, 7));
  });

  it("should load a session correctly", async () => {
    const directory = await loadDirectoryFromFolder(
      path.join(__dirname, "__fixtures__/spo2assistant"),
    );

    const sessions = await loader.sessions(directory);

    sessions.sort((a, b) => b.start.getTime() - a.start.getTime());

    const session = sessions[0];

    const edfFile = await loader.loadSession(session);

    expect(edfFile).toBeDefined();
    expect(edfFile.annotations.length).toBe(0);

    expect(edfFile.header).toEqual({
      patientId: "X X X X",
      recordingId: "Startdate 13-OCT-2024 X X X",
      startTime: new Date(2024, 9, 13, 23, 22, 52),
      dataRecords: 400,
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
    });
  });
});
