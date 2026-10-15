import { tsumDefinitions } from '../tsums/catalog.js';
import { isDevelopmentMode } from './core.js';

export const enabledDefinitions = tsumDefinitions.filter(d => !d.developmentOnly || isDevelopmentMode());
export const tdkVisuals = Object.fromEntries(enabledDefinitions.map(d => [d.id, d.visuals]));
export const tdkTiming = Object.fromEntries(enabledDefinitions.map(d => [d.id, d.timing]));
