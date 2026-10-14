import type { ComponentType } from 'react';
import { Async } from './async';
import { Auth } from './auth';
import { Capstone } from './capstone';
import { CheatSheet } from './cheat-sheet';
import { Cli } from './cli';
import { Concurrency } from './concurrency';
import { Config } from './config';
import { Database } from './database';
import { EventLoop } from './event-loop';
import { Events } from './events';
import { Express } from './express';
import { Http } from './http';
import { Interview } from './interview';
import { Modules } from './modules';
import { Performance } from './performance';
import { Postgres } from './postgres';
import { Production } from './production';
import { Setup } from './setup';
import { Streams } from './streams';
import { Testing } from './testing';
import { Troubleshooting } from './troubleshooting';
import { Welcome } from './welcome';
import { WhatIsNode } from './what-is-node';

export type Chapter = {
  id: string; // also the URL: #/<id>, and the file name in this folder
  num: string;
  group: 'Start here' | 'Core Node.js' | 'Web APIs' | 'Advanced Node.js' | 'Production' | 'Reference';
  title: string;
  goal?: string;
  project?: string; // the practice project folder this chapter builds, under projects/
  trackable: boolean; // counts toward progress
  Body: ComponentType;
};

export const CHAPTERS: Chapter[] = [
  { id: 'welcome', num: '01', group: 'Start here', title: 'How this course works', trackable: true, Body: Welcome,
    goal: 'The route from your first script to a production API, the projects you will build, and how to study so it sticks.' },
  { id: 'what-is-node', num: '02', group: 'Start here', title: 'What Node.js is', trackable: true, Body: WhatIsNode,
    goal: 'Know what happens between your TypeScript file and the operating system, and why one thread can serve thousands of users.' },
  { id: 'setup', num: '03', group: 'Start here', title: 'Tools and your first project', project: '01-hello-node', trackable: true, Body: Setup,
    goal: 'Install Node 24 LTS with a version manager, then create a TypeScript project you will copy for every later chapter.' },

  { id: 'modules', num: '04', group: 'Core Node.js', title: 'Modules and npm packages', project: '02-modules-lab', trackable: true, Body: Modules,
    goal: 'Split code into ES modules, understand where CommonJS still appears, and manage dependencies with npm like a professional.' },
  { id: 'cli', num: '05', group: 'Core Node.js', title: 'Build a CLI: files, paths and process', project: '03-notes-cli', trackable: true, Body: Cli,
    goal: 'Build a notes command-line tool that reads arguments, stores JSON on disk safely, and exits with the right codes.' },
  { id: 'async', num: '06', group: 'Core Node.js', title: 'Async code: callbacks to async/await', project: '04-async-lab', trackable: true, Body: Async,
    goal: 'Write asynchronous code you can reason about: run work in parallel, limit concurrency, handle every error and cancel what you no longer need.' },
  { id: 'event-loop', num: '07', group: 'Core Node.js', title: 'The event loop, for real', project: '05-event-loop-lab', trackable: true, Body: EventLoop,
    goal: 'Predict the order in which Node runs your callbacks, and recognise code that blocks every user at once.' },
  { id: 'events', num: '08', group: 'Core Node.js', title: 'Events and EventEmitter', project: '06-events-lab', trackable: true, Body: Events,
    goal: 'Use the pattern behind streams, servers and sockets: typed event emitters, one-time listeners and the special error event.' },
  { id: 'streams', num: '09', group: 'Core Node.js', title: 'Buffers and streams', project: '07-log-analyzer', trackable: true, Body: Streams,
    goal: 'Process a file far larger than memory with streams, pipelines and backpressure, and work with raw bytes in Buffers.' },

  { id: 'http', num: '10', group: 'Web APIs', title: 'HTTP from scratch', project: '08-raw-http-api', trackable: true, Body: Http,
    goal: 'Build a JSON API with nothing but node:http, so you know exactly what a framework does for you.' },
  { id: 'express', num: '11', group: 'Web APIs', title: 'A REST API with Express 5', project: '09-tasks-api', trackable: true, Body: Express,
    goal: 'Start the tasks API: routers, middleware, validation with Zod, proper status codes and one place that handles errors.' },
  { id: 'database', num: '12', group: 'Web APIs', title: 'Persist data with SQLite', project: '09-tasks-api', trackable: true, Body: Database,
    goal: 'Store tasks in SQLite with migrations, prepared statements and transactions, behind a repository you can swap later.' },
  { id: 'testing', num: '13', group: 'Web APIs', title: 'Test with node:test', project: '09-tasks-api', trackable: true, Body: Testing,
    goal: 'Write unit and HTTP tests with the built-in test runner, use mocks and fake timers, and measure coverage.' },
  { id: 'config', num: '14', group: 'Web APIs', title: 'Config, logging and errors', project: '09-tasks-api', trackable: true, Body: Config,
    goal: 'Validate configuration at startup, write structured logs with a request id on every line, and turn errors into clean responses.' },
  { id: 'auth', num: '15', group: 'Web APIs', title: 'Authentication and security', project: '09-tasks-api', trackable: true, Body: Auth,
    goal: 'Add sign-up and login with hashed passwords and JWTs, give each user their own tasks, and close the common security holes.' },

  { id: 'concurrency', num: '16', group: 'Advanced Node.js', title: 'Worker threads and child processes', project: '10-cpu-lab', trackable: true, Body: Concurrency,
    goal: 'Keep the event loop free during CPU-heavy work with worker threads, and run other programs with child processes.' },
  { id: 'performance', num: '17', group: 'Advanced Node.js', title: 'Performance, profiling and memory', project: '11-perf-lab', trackable: true, Body: Performance,
    goal: 'Measure before you optimise: profile CPU, watch event-loop delay, and find and fix a memory leak.' },

  { id: 'postgres', num: '18', group: 'Production', title: 'Move to PostgreSQL', project: '09-tasks-api', trackable: true, Body: Postgres,
    goal: 'Swap SQLite for PostgreSQL with a connection pool, without touching the routes or the service, and prove it with the same tests.' },
  { id: 'production', num: '19', group: 'Production', title: 'Ship it to production', project: '09-tasks-api', trackable: true, Body: Production,
    goal: 'Shut down gracefully, expose health checks, build for production, run in Docker and test every push with GitHub Actions.' },
  { id: 'capstone', num: '20', group: 'Production', title: 'Capstone: your own service', trackable: true, Body: Capstone,
    goal: 'Design and build a service on your own, using everything from the course, and publish it as a portfolio project.' },

  { id: 'troubleshooting', num: 'A', group: 'Reference', title: 'Troubleshooting', trackable: false, Body: Troubleshooting },
  { id: 'cheat-sheet', num: 'B', group: 'Reference', title: 'Node.js cheat sheet', trackable: false, Body: CheatSheet },
  { id: 'interview', num: 'C', group: 'Reference', title: 'Interview questions', trackable: false, Body: Interview },
];

export const TRACKED = CHAPTERS.filter((c) => c.trackable);

export function findChapter(id: string) {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}
