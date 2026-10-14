import { InMemoryTaskRepository } from './memory-repository.ts';
import { testTaskRepository } from './repository-contract.ts';

testTaskRepository('InMemoryTaskRepository', () => new InMemoryTaskRepository());
