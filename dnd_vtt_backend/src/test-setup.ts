import { Logger } from '@nestjs/common';

// Service specs spin up real DatabaseService instances (see common/test-db.util.ts), each
// re-running every schema migration — silence Nest's Logger so that isn't 15+ log lines per test.
Logger.overrideLogger(false);
