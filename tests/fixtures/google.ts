/**
 * FICTIONAL Google Health API v4 fixtures, shaped after the published REST reference.
 * No real personal data. Field names must match developers.google.com/health/reference/rest/v4.
 */
const wearable = {
  recordingMethod: "PASSIVELY_MEASURED",
  device: { formFactor: "FITNESS_BAND", manufacturer: "Google", displayName: "Fitbit Air" },
  platform: "FITBIT",
};

export function hrPoint(iso: string, bpm: number | string, offset = "3600s") {
  return {
    name: undefined,
    dataSource: wearable,
    heartRate: { sampleTime: { physicalTime: iso, utcOffset: offset }, beatsPerMinute: String(bpm), metadata: { motionContext: "ACTIVE", sensorLocation: "WRIST" } },
  };
}

export function stepsPoint(startIso: string, endIso: string, count: number) {
  return { dataPointName: `users/me/dataTypes/steps/dataPoints/${startIso}`, steps: { interval: { startTime: startIso, startUtcOffset: "3600s", endTime: endIso, endUtcOffset: "3600s" }, count: String(count) } };
}

export const sleepPoint = {
  dataPointName: "users/me/dataTypes/sleep/dataPoints/fixture-sleep-1",
  sleep: {
    interval: { startTime: "2026-03-01T22:30:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T06:30:00Z", endUtcOffset: "3600s" },
    type: "STAGES",
    stages: [
      { startTime: "2026-03-01T22:30:00Z", startUtcOffset: "3600s", endTime: "2026-03-01T22:45:00Z", endUtcOffset: "3600s", type: "AWAKE" },
      { startTime: "2026-03-01T22:45:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T01:00:00Z", endUtcOffset: "3600s", type: "LIGHT" },
      { startTime: "2026-03-02T01:00:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T02:30:00Z", endUtcOffset: "3600s", type: "DEEP" },
      { startTime: "2026-03-02T02:30:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T06:30:00Z", endUtcOffset: "3600s", type: "REM" },
    ],
    metadata: { stagesStatus: "SUCCEEDED", processed: true, nap: false, mainSleep: true },
    summary: { minutesInSleepPeriod: "480", minutesAsleep: "465", minutesAwake: "15", minutesToFallAsleep: "15" },
    updateTime: "2026-03-02T07:00:00Z",
  },
};

export const dailyRhrPoint = {
  name: "users/me/dataTypes/daily-resting-heart-rate/dataPoints/x",
  dataSource: wearable,
  dailyRestingHeartRate: { date: { year: 2026, month: 3, day: 2 }, beatsPerMinute: "52", dailyRestingHeartRateMetadata: { calculationMethod: "WITH_SLEEP" } },
};

export const dailyHrvPoint = {
  dataSource: wearable,
  dailyHeartRateVariability: { date: { year: 2026, month: 3, day: 2 }, averageHeartRateVariabilityMilliseconds: 61.5, deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 70.2 },
};

export const weightPoint = { dataSource: { recordingMethod: "MANUAL" }, weight: { sampleTime: { physicalTime: "2026-03-02T07:10:00Z", utcOffset: "3600s" }, weightGrams: 78400 } };

export const exercisePoint = {
  name: "users/me/dataTypes/exercise/dataPoints/fixture-ex-1",
  dataSource: wearable,
  exercise: {
    interval: { startTime: "2026-03-02T17:00:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T18:00:00Z", endUtcOffset: "3600s" },
    exerciseType: "WEIGHTLIFTING", displayName: "Weights", activeDuration: "3500s",
    metricsSummary: { caloriesKcal: 310, averageHeartRateBeatsPerMinute: "121", heartRateZoneDurations: { lightTime: "900s", moderateTime: "600s" } },
  },
};
