// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2025 The OpenPSG Authors.

import { describe, it, expect, beforeEach } from "vitest";
import ResMedLoader from "./ResMedLoader";
import { readFile } from "fs/promises";
import path from "path";
import fs from "fs";

describe("ResMedLoader", () => {
  let loader: ResMedLoader;

  beforeEach(() => {
    loader = new ResMedLoader();
  });

  it("should have the correct name", () => {
    expect(loader.name).toBe("ResMed");
  });

  it("should validate directory correctly", async () => {
    let directory = await loadDirectoryFromFolder(
      path.join(__dirname, "__fixtures__/resmed"),
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
      path.join(__dirname, "__fixtures__/resmed"),
    );

    const sessions = await loader.sessions(directory);

    sessions.sort((a, b) => b.start.getTime() - a.start.getTime());

    expect(sessions.length).toBe(3);
    expect(sessions[0].start).toEqual(new Date(2024, 11, 9, 2, 58, 49));
    expect(sessions[0].end).toEqual(new Date(2024, 11, 9, 3, 52, 49));
  });

  it("should load a session correctly", async () => {
    const directory = await loadDirectoryFromFolder(
      path.join(__dirname, "__fixtures__/resmed"),
    );

    const sessions = await loader.sessions(directory);

    sessions.sort((a, b) => b.start.getTime() - a.start.getTime());

    const session = sessions[2];

    const edfFile = await loader.loadSession(session);

    expect(edfFile).toBeDefined();
    expect(edfFile.annotations.length).toBe(2);

    expect(edfFile.header).toBeDefined();

    expect(edfFile.header).toEqual({
      patientId: "X X X X",
      recordingId: "Startdate 08-DEC-2024 X X X",
      startTime: new Date(2024, 11, 8, 2, 39, 39),
      dataRecords: 21,
      recordDuration: 60,
      signalCount: 14,
      signals: [
        {
          label: "Flow",
          transducerType: "ResMed PAP",
          physicalDimension: "L/s",
          physicalMin: -2,
          physicalMax: 3,
          digitalMin: -1000,
          digitalMax: 1500,
          prefiltering: "",
          samplesPerRecord: 1500,
          reserved: "",
        },
        {
          label: "Pressure",
          transducerType: "ResMed PAP",
          physicalDimension: "cmH2O",
          physicalMin: 0,
          physicalMax: 40,
          digitalMin: 0,
          digitalMax: 2000,
          prefiltering: "",
          samplesPerRecord: 1500,
          reserved: "",
        },
        {
          label: "RespEvent",
          transducerType: "ResMed PAP",
          physicalDimension: "",
          physicalMin: 0,
          physicalMax: 16,
          digitalMin: 0,
          digitalMax: 16,
          prefiltering: "",
          samplesPerRecord: 1500,
          reserved: "",
        },
        {
          label: "InspPressure",
          transducerType: "ResMed PAP",
          physicalDimension: "cmH2O",
          physicalMin: 0,
          physicalMax: 30,
          digitalMin: 0,
          digitalMax: 1500,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "ExpPressure",
          transducerType: "ResMed PAP",
          physicalDimension: "cmH2O",
          physicalMin: 0,
          physicalMax: 30,
          digitalMin: 0,
          digitalMax: 1500,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "Leak",
          transducerType: "ResMed PAP",
          physicalDimension: "L/s",
          physicalMin: 0,
          physicalMax: 2,
          digitalMin: 0,
          digitalMax: 100,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "RespRate",
          transducerType: "ResMed PAP",
          physicalDimension: "bpm",
          physicalMin: 0,
          physicalMax: 50,
          digitalMin: 0,
          digitalMax: 250,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "TidalVolume",
          transducerType: "ResMed PAP",
          physicalDimension: "L",
          physicalMin: 0,
          physicalMax: 4,
          digitalMin: 0,
          digitalMax: 200,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "MinuteVent",
          transducerType: "ResMed PAP",
          physicalDimension: "L/min",
          physicalMin: 0,
          physicalMax: 30,
          digitalMin: 0,
          digitalMax: 240,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "InspExpRatio",
          transducerType: "ResMed PAP",
          physicalDimension: "%",
          physicalMin: 0,
          physicalMax: 200,
          digitalMin: 0,
          digitalMax: 200,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "Snore",
          transducerType: "ResMed PAP",
          physicalDimension: "",
          physicalMin: 0,
          physicalMax: 5,
          digitalMin: 0,
          digitalMax: 250,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "FlowLim",
          transducerType: "ResMed PAP",
          physicalDimension: "",
          physicalMin: 0,
          physicalMax: 1,
          digitalMin: 0,
          digitalMax: 100,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "InspTime",
          transducerType: "ResMed PAP",
          physicalDimension: "s",
          physicalMin: 0,
          physicalMax: 10,
          digitalMin: 0,
          digitalMax: 500,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
        {
          label: "ExpTime",
          transducerType: "ResMed PAP",
          physicalDimension: "s",
          physicalMin: 0,
          physicalMax: 10,
          digitalMin: 0,
          digitalMax: 500,
          prefiltering: "",
          samplesPerRecord: 30,
          reserved: "",
        },
      ],
    });

    expect(edfFile.values.length).toBe(14);
    expect(edfFile.values[0].length).toBe(21 * 1500);
    expect(edfFile.values[13].length).toBe(21 * 30);
  });

  async function loadDirectoryFromFolder(
    folderPath: string,
  ): Promise<Map<string, File>> {
    const directory = new Map<string, File>();

    // Read directory contents recursively
    const files = await getAllFiles(folderPath);

    for (const filePath of files) {
      const buffer = await readFile(filePath);
      const relativePath = path
        .relative(folderPath, filePath)
        .replace(/\\/g, "/"); // Normalize to unix slashes
      directory.set(relativePath, new File([buffer], path.basename(filePath)));
    }

    return directory;
  }

  async function getAllFiles(dir: string): Promise<string[]> {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getAllFiles(res) : res;
      }),
    );
    return Array.prototype.concat(...files);
  }
});
