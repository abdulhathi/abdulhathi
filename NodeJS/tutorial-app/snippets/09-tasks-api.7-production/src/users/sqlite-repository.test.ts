import { openDatabase } from '../db/database.ts';
import { testUserRepository } from './repository-contract.ts';
import { SqliteUserRepository } from './sqlite-repository.ts';

testUserRepository('SqliteUserRepository', () => new SqliteUserRepository(openDatabase(':memory:')));
