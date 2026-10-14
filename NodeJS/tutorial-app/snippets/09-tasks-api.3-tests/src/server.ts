import { createApp } from './app.ts';
import { openDatabase } from './db/database.ts';
import { SqliteTaskRepository } from './tasks/sqlite-repository.ts';
import { TaskService } from './tasks/service.ts';

const port = Number(process.env.PORT ?? 4000);
const dbFile = process.env.DB_FILE ?? 'data/tasks.db';

const db = openDatabase(dbFile);
const tasks = new TaskService(new SqliteTaskRepository(db));
const app = createApp({ tasks });

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Tasks API listening on http://localhost:${port} (database: ${dbFile})`);
});
