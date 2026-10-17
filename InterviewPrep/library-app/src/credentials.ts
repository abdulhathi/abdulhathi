// Credentials already on the resume, so the profile kit can show them next to new ones. Only the HackerRank
// certificate has a known public link; add the others' links in the app when you have them.
export type ExistingCredential = { name: string; issuer: string; year: string; url?: string; path?: string };

export const EXISTING_CREDENTIALS: ExistingCredential[] = [
  { name: 'Frontend Developer (React)', issuer: 'HackerRank', year: '2025', url: 'https://www.hackerrank.com/certificates/789f6c20c6eb', path: 'react' },
  { name: 'Python for Data Science, AI & Development', issuer: 'IBM', year: '2025', path: 'python' },
  { name: 'Introduction to Cloud Computing', issuer: 'IBM', year: '2025', path: 'cloud' },
  { name: 'Build AI Powered Apps', issuer: 'Code with Mosh', year: '2025', path: 'genai' },
  { name: 'Complete Python Mastery', issuer: 'Code With Mosh', year: '2023', path: 'python' },
  { name: 'Mastering Data Structures & Algorithms', issuer: 'Udemy', year: '2020', path: 'dsa' },
];

/** Profile names for each path's skill: what to add under LinkedIn Skills, the website and the resume. */
export const PROFILE_SKILLS: Record<string, string[]> = {
  python: ['Python', 'Pydantic', 'pytest', 'asyncio'],
  nodejs: ['Node.js', 'Express.js', 'TypeScript'],
  typescript: ['TypeScript', 'JavaScript'],
  react: ['React.js', 'TypeScript', 'Redux', 'TanStack Query', 'Web Accessibility'],
  fastapi: ['FastAPI', 'Pydantic', 'REST APIs', 'SQLAlchemy'],
  sql: ['SQL', 'PostgreSQL', 'Database Design', 'Query Optimization'],
  redis: ['Redis', 'Caching'],
  kafka: ['Apache Kafka', 'Event-Driven Architecture', 'Event Streaming'],
  rabbitmq: ['RabbitMQ', 'Message Queues', 'AMQP'],
  realtime: ['Server-Sent Events', 'WebSockets', 'gRPC'],
  'docker-k8s': ['Docker', 'Kubernetes', 'Azure Kubernetes Service (AKS)', 'Google Kubernetes Engine (GKE)'],
  cloud: ['Google Cloud Platform (GCP)', 'Cloud Run', 'CI/CD', 'Terraform'],
  'system-design': ['System Design', 'Distributed Systems', 'Microservices'],
  genai: ['Generative AI', 'Large Language Models (LLM)', 'Retrieval-Augmented Generation (RAG)', 'AI Agents', 'LangGraph'],
  ml: ['Machine Learning', 'scikit-learn', 'MLOps'],
  security: ['OAuth 2.0', 'OpenID Connect', 'SAML', 'Application Security'],
  testing: ['Playwright', 'Test Automation', 'pytest', 'Jest'],
  dsa: ['Data Structures', 'Algorithms', 'Problem Solving'],
};
