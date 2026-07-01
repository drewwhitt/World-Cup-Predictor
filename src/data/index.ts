import rawFixtures from "./worldcup-fixtures.json";
import { buildGroupFixtures, buildKnockoutFixtures } from "../lib/fixtures";
import { K_FACTOR, HOST_ADVANTAGE } from "../lib/elo";

export const GROUP_MATCHES = buildGroupFixtures(rawFixtures);
export const KNOCKOUT_MATCHES = buildKnockoutFixtures(rawFixtures);

export const DEFAULT_SETTINGS = {
  kFactor: K_FACTOR,           // 40 — scipy-optimized, was 32
  homeAdvantage: HOST_ADVANTAGE, // 100 — host nation only, was flat 65
  simulations: 1000,
};