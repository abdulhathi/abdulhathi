import { openDatabase } from '../db/database.ts';
import { testTaskRepository } from './repository-contract.ts';
import { SqliteTaskRepository } from './sqlite-repository.ts';

// ':memory:' gives every test its own empty, fully migrated database in about a millisecond.
testTaskRepository('SqliteTaskRepository', () => new SqliteTaskRepository(openDatabase(':memory:')));
