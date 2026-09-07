/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MahwarState = 
  | 'closed'          // 01: Default state - center locked, branches hidden
  | 'pressing'        // 02: Moment of press - physical mechanical depression
  | 'unlocking'       // 03: Lock opens, audio plays, energy radiates
  | 'open'            // 04: Branches reveal and orbit the center
  | 'branch_hover'    // 05: Branch hovered or selected, floating card visible
  | 'closing';        // 06: Branches retract, lock shuts

export interface MahwarBranch {
  id: string;
  number: number;
  label: string;
  badge?: string;
  iconName: 'file-text' | 'users' | 'clipboard-check' | 'settings' | 'user';
  angle: number; // In degrees
  cardTitle: string;
  cardSubtitle: string;
  cardDescription: string;
  colorAccent: string;
}

export interface StepDefinition {
  step: string;
  title: string;
  description: string;
  targetState: MahwarState;
}
