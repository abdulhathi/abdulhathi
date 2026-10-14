import { createApp } from './app.ts';
import { InMemoryTaskRepository } from './tasks/memory-repository.ts';
import { TaskService } from './tasks/service.ts';

const port = Number(process.env.PORT ?? 4000);

const tasks = new TaskService(new InMemoryTaskRepository());
const app = createApp({ tasks });

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Tasks API listening on http://localhost:${port}`);
});
