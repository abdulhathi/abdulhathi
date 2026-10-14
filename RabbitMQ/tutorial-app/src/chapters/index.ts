import type { ComponentType } from 'react';
import { Direct, Fanout, Hello, Topic, WorkQueues } from './CorePatterns';
import { Build, RunRabbit, Setup, Vocabulary } from './Foundations';
import { CheatSheet, Ship, ShopFlow, Troubleshooting } from './Finish';
import { DeadLetters, QueueTypes, Reliability, Rpc } from './Production';

export type Chapter = {
  id: string; // also the URL: #/<id>
  num: string;
  group: 'Foundations' | 'Core patterns' | 'Production concerns' | 'Finish' | 'Reference';
  title: string;
  goal?: string;
  folder?: string; // where the chapter's code lives in the practice project
  trackable: boolean; // counts toward progress
  Body: ComponentType;
};

export const CHAPTERS: Chapter[] = [
  { id: 'build', num: '01', group: 'Foundations', title: 'What you will build', trackable: true, Body: Build,
    goal: 'ShopFlow takes orders over HTTP and hands the work to independent services through RabbitMQ.' },
  { id: 'vocabulary', num: '02', group: 'Foundations', title: 'The vocabulary', trackable: true, Body: Vocabulary,
    goal: 'Ten words explain almost everything RabbitMQ does. Learn them once and every later chapter reads easily.' },
  { id: 'run', num: '03', group: 'Foundations', title: 'Run RabbitMQ', trackable: true, Body: RunRabbit,
    goal: 'Start a broker with the management UI in Docker and learn where to look while you work.' },
  { id: 'setup', num: '04', group: 'Foundations', title: 'Set up the project', trackable: true, Body: Setup,
    goal: 'A TypeScript project that runs any file with one command, plus two helpers every chapter reuses.' },
  { id: 'hello', num: '05', group: 'Core patterns', title: 'Hello queue', folder: 'src/01-hello', trackable: true, Body: Hello,
    goal: 'Send one message to a queue and receive it. You will meet queue declaration, the default exchange and auto-ack.' },
  { id: 'work-queues', num: '06', group: 'Core patterns', title: 'Work queues and acks', folder: 'src/02-work-queues', trackable: true, Body: WorkQueues,
    goal: 'Spread slow jobs across several workers without losing any, even when a worker crashes.' },
  { id: 'fanout', num: '07', group: 'Core patterns', title: 'Fanout: publish/subscribe', folder: 'src/03-fanout', trackable: true, Body: Fanout,
    goal: 'Send every order to several services at once, without the publisher knowing who they are.' },
  { id: 'direct', num: '08', group: 'Core patterns', title: 'Direct: routing by key', folder: 'src/04-direct', trackable: true, Body: Direct,
    goal: 'Send each order only to the warehouse that serves its region.' },
  { id: 'topic', num: '09', group: 'Core patterns', title: 'Topic: routing by pattern', folder: 'src/05-topic', trackable: true, Body: Topic,
    goal: 'Let each consumer choose the events it wants with wildcard patterns.' },
  { id: 'reliability', num: '10', group: 'Production concerns', title: 'Reliable delivery', folder: 'src/06-reliability', trackable: true, Body: Reliability,
    goal: 'Close every gap where a message can be lost between producer, broker and consumer.' },
  { id: 'queue-types', num: '11', group: 'Production concerns', title: 'Queue types', folder: 'concept only', trackable: true, Body: QueueTypes,
    goal: 'Choose between classic, quorum and stream queues, and know why quorum is the default for data you cannot lose.' },
  { id: 'dead-letters', num: '12', group: 'Production concerns', title: 'Dead letters and retries', folder: 'src/07-dead-letters', trackable: true, Body: DeadLetters,
    goal: 'Retry failures that might succeed later, park failures that never will, and stop poison messages from looping forever.' },
  { id: 'rpc', num: '13', group: 'Production concerns', title: 'Request/reply (RPC)', folder: 'src/08-rpc', trackable: true, Body: Rpc,
    goal: 'Ask a service a question over RabbitMQ and wait for the answer.' },
  { id: 'shopflow', num: '14', group: 'Finish', title: 'Assemble ShopFlow', folder: 'src/09-shopflow', trackable: true, Body: ShopFlow,
    goal: 'Combine the patterns into one small application that survives broker restarts.' },
  { id: 'ship', num: '15', group: 'Finish', title: 'Ship it to GitHub', trackable: true, Body: Ship,
    goal: 'Turn the practice project into a repo that shows what you learned.' },
  { id: 'troubleshooting', num: 'A', group: 'Reference', title: 'Troubleshooting', trackable: false, Body: Troubleshooting },
  { id: 'cheat-sheet', num: 'B', group: 'Reference', title: 'amqplib cheat sheet', trackable: false, Body: CheatSheet },
];

export const TRACKED = CHAPTERS.filter((c) => c.trackable);

export function findChapter(id: string) {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}
