import rawFixtures from "./worldcup-fixtures.json";
import { buildGroupFixtures, buildKnockoutFixtures } from "../lib/fixtures";

export const GROUP_MATCHES = buildGroupFixtures(rawFixtures);
export const KNOCKOUT_MATCHES = buildKnockoutFixtures(rawFixtures);

export const DEFAULT_SETTINGS = {
  kFactor: 32,
  homeAdvantage: 65,
  simulations: 5000,
};
