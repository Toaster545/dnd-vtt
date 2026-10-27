import { Migration } from './migration';
import { migrateV1 } from './v001';
import { migrateV2 } from './v002';
import { migrateV3 } from './v003';
import { migrateV4 } from './v004';
import { migrateV5 } from './v005';
import { migrateV6 } from './v006';
import { migrateV7 } from './v007';
import { migrateV8 } from './v008';
import { migrateV9 } from './v009';
import { migrateV10 } from './v010';
import { migrateV11 } from './v011';
import { migrateV12 } from './v012';
import { migrateV13 } from './v013';
import { migrateV14 } from './v014';
import { migrateV15 } from './v015';
import { migrateV16 } from './v016';
import { migrateV17 } from './v017';
import { migrateV18 } from './v018';
import { migrateV19 } from './v019';
import { migrateV20 } from './v020';
import { migrateV21 } from './v021';
import { migrateV23 } from './v023';
import { migrateV24 } from './v024';
import { migrateV25 } from './v025';
import { migrateV26 } from './v026';
import { migrateV27 } from './v027';
import { migrateV28 } from './v028';
import { migrateV29 } from './v029';
import { migrateV30 } from './v030';
import { migrateV31 } from './v031';
import { migrateV32 } from './v032';
import { migrateV33 } from './v033';
import { migrateV34 } from './v034';
import { migrateV35 } from './v035';
import { migrateV36 } from './v036';

/** Ordered by version. There is deliberately no v22; see v023. */
export const MIGRATIONS: Migration[] = [
  migrateV1,
  migrateV2,
  migrateV3,
  migrateV4,
  migrateV5,
  migrateV6,
  migrateV7,
  migrateV8,
  migrateV9,
  migrateV10,
  migrateV11,
  migrateV12,
  migrateV13,
  migrateV14,
  migrateV15,
  migrateV16,
  migrateV17,
  migrateV18,
  migrateV19,
  migrateV20,
  migrateV21,
  migrateV23,
  migrateV24,
  migrateV25,
  migrateV26,
  migrateV27,
  migrateV28,
  migrateV29,
  migrateV30,
  migrateV31,
  migrateV32,
  migrateV33,
  migrateV34,
  migrateV35,
  migrateV36,
];
