import { InMemoryUserRepository } from './memory-repository.ts';
import { testUserRepository } from './repository-contract.ts';

testUserRepository('InMemoryUserRepository', () => new InMemoryUserRepository());
